using System.Text.Json;
using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Protocol;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// MQTT publisher z persistentno povezavo preko MQTTnet knjiznice.
///
/// Ob ConnectAsync:
///   1. Vzpostavi povezavo z Last Will Testament (status/online → {"online":false})
///   2. Objavi status/connect z metapodatki naprave
///   3. Objavi prvi heartbeat (status/online → {"online":true})
///   4. Zazene periodicen heartbeat timer (vsakih 30 sekund)
///
/// Last Will (MQTT retained) zagotavlja, da broker samodejno objavi
/// offline status, ce se naprava nepricakovano odklopi.
///
/// Heartbeat omogoca backendu stetje aktivnih naprav in prikaz stanja
/// na spletnem dashboardu.
/// </summary>
public sealed class MqttSensorPublisher : IMqttSensorPublisher, IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly ILogger<MqttSensorPublisher> _logger;
    private readonly IDeviceIdentityProvider _deviceIdentity;
    private readonly string _host;
    private readonly int _port;
    private readonly string _baseTopic;

    private IMqttClient? _client;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private CancellationTokenSource? _heartbeatCts;
    private Task? _heartbeatTask;
    private bool _disposed;

    private string OnlineTopic => $"{_baseTopic}/devices/{_deviceIdentity.DeviceId}/status/online";
    private string ConnectTopic => $"{_baseTopic}/devices/{_deviceIdentity.DeviceId}/status/connect";

    public bool IsConnected => _client?.IsConnected == true;

    public MqttSensorPublisher(
        ILogger<MqttSensorPublisher> logger,
        IDeviceIdentityProvider deviceIdentityProvider)
    {
        _logger = logger;
        _deviceIdentity = deviceIdentityProvider;
        _host = "localhost";
        _port = 1883;
        _baseTopic = "smart-playgrounds";
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        if (_disposed)
        {
            throw new ObjectDisposedException(nameof(MqttSensorPublisher));
        }

        await _connectionLock.WaitAsync(cancellationToken);
        try
        {
            if (_client?.IsConnected == true)
            {
                _logger.LogDebug("MQTT ze povezan — preskakujem ConnectAsync.");
                return;
            }

            // Pripravi Last Will: ce se nepricakovano odklopimo,
            // broker objavi retained sporocilo "offline".
            var willPayload = JsonSerializer.Serialize(new
            {
                online = false,
                reason = "unexpected-disconnect"
            }, JsonOptions);

            var mqttFactory = new MqttClientFactory();
            _client = mqttFactory.CreateMqttClient();

            var options = new MqttClientOptionsBuilder()
                .WithTcpServer(_host, _port)
                .WithClientId(_deviceIdentity.ClientId)
                .WithWillTopic(OnlineTopic)
                .WithWillPayload(willPayload)
                .WithWillQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .WithWillRetain(true)
                .WithKeepAlivePeriod(TimeSpan.FromSeconds(60))
                .WithCleanSession(false)
                .Build();

            _client.DisconnectedAsync += OnDisconnectedAsync;

            _logger.LogInformation("MQTT povezovanje na {Host}:{Port} kot {ClientId}...",
                _host, _port, _deviceIdentity.ClientId);

            var connectResult = await _client.ConnectAsync(options, cancellationToken);

            if (connectResult.ResultCode != MqttClientConnectResultCode.Success)
            {
                _logger.LogWarning("MQTT povezava ni uspela: {ResultCode}", connectResult.ResultCode);
                return;
            }

            _logger.LogInformation("MQTT povezan (LWT nastavljen na {Topic}).", OnlineTopic);

            // Objavi status/connect z metapodatki
            await PublishConnectInfoAsync(cancellationToken);

            // Objavi prvi heartbeat
            await PublishHeartbeatAsync(cancellationToken);

            // Zaženi periodični heartbeat
            StartHeartbeat();
        }
        catch (Exception ex) when (ex is not ObjectDisposedException)
        {
            _logger.LogWarning(ex, "MQTT povezava ni uspela.");
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    public async Task PublishAsync(SensorData sensorData, CancellationToken cancellationToken = default)
    {
        if (_disposed)
        {
            return;
        }

        // Poskusi se povezati, ce se nismo
        if (_client?.IsConnected != true)
        {
            try
            {
                await ConnectAsync(cancellationToken);
            }
            catch
            {
                // Ne prekinemo — ce broker ni dosegljiv, preskocimo objavo
            }
        }

        if (_client?.IsConnected != true)
        {
            return;
        }

        var topic = MqttSensorMessageFactory.BuildTopic(_baseTopic, _deviceIdentity.DeviceId, sensorData);
        var payload = MqttSensorMessageFactory.BuildJsonPayload(_deviceIdentity.DeviceId, sensorData);

        var qos = sensorData is GPSData
            ? MqttQualityOfServiceLevel.AtLeastOnce
            : MqttQualityOfServiceLevel.AtMostOnce;

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(payload)
            .WithQualityOfServiceLevel(qos)
            .Build();

        try
        {
            await _client.PublishAsync(message, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MQTT objava na {Topic} ni uspela.", topic);
        }
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        if (_disposed)
        {
            return;
        }

        await _connectionLock.WaitAsync(cancellationToken);
        try
        {
            await StopHeartbeatAsync();

            if (_client?.IsConnected == true)
            {
                // Graciozno odklopi — NE sprozi LWT
                await _client.DisconnectAsync();

                _logger.LogInformation("MQTT graciozno odklopljen.");
            }

            if (_client is not null)
            {
                _client.DisconnectedAsync -= OnDisconnectedAsync;
                _client.Dispose();
                _client = null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Napaka pri MQTT odklopu.");
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        await DisconnectAsync();
        _connectionLock.Dispose();
    }

    private async Task PublishConnectInfoAsync(CancellationToken cancellationToken)
    {
        if (_client?.IsConnected != true)
        {
            return;
        }

        var payload = JsonSerializer.Serialize(new
        {
            platform = _deviceIdentity.Platform,
            appVersion = _deviceIdentity.AppVersion
        }, JsonOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(ConnectTopic)
            .WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(false)
            .Build();

        await _client.PublishAsync(message, cancellationToken);
        _logger.LogInformation("MQTT status/connect objavljen za {DeviceId}.", _deviceIdentity.DeviceId);
    }

    private async Task PublishHeartbeatAsync(CancellationToken cancellationToken)
    {
        if (_client?.IsConnected != true)
        {
            return;
        }

        var payload = JsonSerializer.Serialize(new
        {
            online = true,
            timestampUtc = DateTime.UtcNow.ToString("O")
        }, JsonOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(OnlineTopic)
            .WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(true)
            .Build();

        await _client.PublishAsync(message, cancellationToken);
    }

    private void StartHeartbeat()
    {
        StopHeartbeat();

        _heartbeatCts = new CancellationTokenSource();
        _heartbeatTask = RunHeartbeatLoopAsync(_heartbeatCts.Token);
    }

    private async Task StopHeartbeatAsync()
    {
        if (_heartbeatCts is not null)
        {
            await _heartbeatCts.CancelAsync();
            _heartbeatCts.Dispose();
            _heartbeatCts = null;
        }

        if (_heartbeatTask is not null)
        {
            try
            {
                await _heartbeatTask;
            }
            catch (OperationCanceledException)
            {
            }

            _heartbeatTask = null;
        }
    }

    private void StopHeartbeat()
    {
        if (_heartbeatCts is not null)
        {
            _heartbeatCts.Cancel();
            _heartbeatCts.Dispose();
            _heartbeatCts = null;
        }

        _heartbeatTask = null;
    }

    private async Task RunHeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        // 30 sekundni interval — dovolj pogosto za dashboard, dovolj redek za omrezje
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await timer.WaitForNextTickAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            try
            {
                await PublishHeartbeatAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat objava ni uspela.");
            }
        }
    }

    private async Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs eventArgs)
    {
        _logger.LogWarning(
            "MQTT nepricakovano odklopljen: {Reason}. ClientWasConnected={WasConnected}",
            eventArgs.Reason,
            eventArgs.ClientWasConnected);

        // Ce je bil clientWasConnected, pomeni da je LWT ze sprozen
        // (ali pa bo sprozen v kratkem). Ne poskusaj ponovne povezave s
        // starim client objektom — naslednji PublishAsync bo poklical
        // ConnectAsync, ki ustvari nov client.

        await StopHeartbeatAsync();

        if (_client is not null)
        {
            _client.DisconnectedAsync -= OnDisconnectedAsync;
        }
    }
}
