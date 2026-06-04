using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Implementacija glavne senzorske storitve
/// </summary>
public class SensorService : ISensorService
{
    private readonly IGPSSensor _gpsSensor;
    private readonly IAccelerometerSensor _accelerometerSensor;
    private readonly ISensorDataRepository _sensorDataRepository;
    private readonly IMqttSensorPublisher _mqttSensorPublisher;
    private readonly IRaiIntegrationClient _raiIntegrationClient;
    private CancellationTokenSource? _monitoringCancellationTokenSource;
    private Task? _monitoringTask;

    public event EventHandler<SensorDataUpdatedEventArgs>? SensorDataUpdated;

    public SensorService(
        IGPSSensor gpsSensor,
        IAccelerometerSensor accelerometerSensor,
        ISensorDataRepository sensorDataRepository,
        IMqttSensorPublisher mqttSensorPublisher,
        IRaiIntegrationClient raiIntegrationClient)
    {
        _gpsSensor = gpsSensor;
        _accelerometerSensor = accelerometerSensor;
        _sensorDataRepository = sensorDataRepository;
        _mqttSensorPublisher = mqttSensorPublisher;
        _raiIntegrationClient = raiIntegrationClient;
    }

    public IGPSSensor GPSSensor => _gpsSensor;
    public IAccelerometerSensor AccelerometerSensor => _accelerometerSensor;

    public async Task InitializeAsync()
    {
        await _gpsSensor.StartAsync();
        await _accelerometerSensor.StartAsync();

        // Vzpostavi MQTT povezavo z LWT, status/connect in heartbeati
        await _mqttSensorPublisher.ConnectAsync();

        if (_monitoringTask is null || _monitoringTask.IsCompleted)
        {
            _monitoringCancellationTokenSource = new CancellationTokenSource();
            _monitoringTask = MonitorSensorsAsync(_monitoringCancellationTokenSource.Token);
        }

        await CaptureAndNotifyAsync();
    }

    public async Task StopAsync()
    {
        if (_monitoringCancellationTokenSource is not null)
        {
            await _monitoringCancellationTokenSource.CancelAsync();

            if (_monitoringTask is not null)
            {
                try
                {
                    await _monitoringTask;
                }
                catch (OperationCanceledException)
                {
                }
            }

            _monitoringCancellationTokenSource.Dispose();
            _monitoringCancellationTokenSource = null;
            _monitoringTask = null;
        }

        // Graciozno odklopi MQTT (ne sprozi LWT)
        await _mqttSensorPublisher.DisconnectAsync();

        await _gpsSensor.StopAsync();
        await _accelerometerSensor.StopAsync();
    }

    private async Task MonitorSensorsAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            await CaptureAndNotifyAsync();
        }
    }

    private async Task CaptureAndNotifyAsync()
    {
        var gpsData = await _gpsSensor.GetLocationAsync();
        var accelerometerData = await _accelerometerSensor.GetAccelerationAsync();

        await _sensorDataRepository.AddAsync(gpsData);
        await _sensorDataRepository.AddAsync(accelerometerData);
        _ = _mqttSensorPublisher.PublishAsync(gpsData);
        _ = _mqttSensorPublisher.PublishAsync(accelerometerData);
        _ = _raiIntegrationClient.SendMeasurementsAsync([gpsData, accelerometerData]);

        var snapshot = (await _sensorDataRepository.GetAllAsync())
            .OrderByDescending(item => item.Timestamp)
            .ToArray();

        SensorDataUpdated?.Invoke(this, new SensorDataUpdatedEventArgs
        {
            GpsData = gpsData,
            AccelerometerData = accelerometerData,
            Snapshot = snapshot
        });
    }
}
