using System.Buffers.Binary;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public sealed class MqttSensorPublisher : IMqttSensorPublisher
{
    private const byte ConnectPacketType = 0x10;
    private const byte PublishPacketType = 0x30;
    private const byte DisconnectPacketType = 0xE0;

    private readonly ILogger<MqttSensorPublisher> _logger;
    private readonly IDeviceIdentityService _deviceIdentity;
    private readonly string _clientId;
    private readonly string _host;
    private readonly int _port;
    private readonly string _baseTopic;

    public MqttSensorPublisher(ILogger<MqttSensorPublisher> logger, IDeviceIdentityService deviceIdentity)
    {
        _logger = logger;
        _deviceIdentity = deviceIdentity;
        _clientId = $"npo-{_deviceIdentity.DeviceId}";
        _host = "localhost";
        _port = 1883;
        _baseTopic = "smart-playgrounds";
    }

    public async Task PublishAsync(SensorData sensorData, CancellationToken cancellationToken = default)
    {
        var topic = MqttSensorMessageFactory.BuildTopic(_baseTopic, _deviceIdentity.DeviceId, sensorData);
        var payload = MqttSensorMessageFactory.BuildJsonPayload(_deviceIdentity.DeviceId, sensorData);

        try
        {
            using var tcpClient = new TcpClient();
            await tcpClient.ConnectAsync(_host, _port, cancellationToken);

            await using var stream = tcpClient.GetStream();
            await WriteConnectPacketAsync(stream, cancellationToken);
            await ReadConnAckAsync(stream, cancellationToken);
            await WritePublishPacketAsync(stream, topic, payload, cancellationToken);
            await stream.WriteAsync(new[] { DisconnectPacketType, (byte)0x00 }, cancellationToken);
        }
        catch (Exception exception) when (exception is SocketException or IOException or TimeoutException)
        {
            _logger.LogWarning(exception, "MQTT broker is not available for topic {Topic}.", topic);
        }
    }

    private async Task WriteConnectPacketAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        using var payload = new MemoryStream();
        WriteMqttString(payload, "MQTT");
        payload.WriteByte(0x04);
        payload.WriteByte(0x02);
        payload.WriteByte(0x00);
        payload.WriteByte(0x3C);
        WriteMqttString(payload, _clientId);

        await WritePacketAsync(stream, ConnectPacketType, payload.ToArray(), cancellationToken);
    }

    private static async Task ReadConnAckAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var buffer = new byte[4];
        var bytesRead = 0;

        while (bytesRead < buffer.Length)
        {
            var currentRead = await stream.ReadAsync(buffer.AsMemory(bytesRead), cancellationToken);
            if (currentRead == 0)
            {
                throw new IOException("MQTT broker closed the connection before CONNACK.");
            }

            bytesRead += currentRead;
        }

        if (buffer[0] != 0x20 || buffer[1] != 0x02 || buffer[3] != 0x00)
        {
            throw new IOException("MQTT broker rejected the connection.");
        }
    }

    private static async Task WritePublishPacketAsync(
        NetworkStream stream,
        string topic,
        string payload,
        CancellationToken cancellationToken)
    {
        using var packetPayload = new MemoryStream();
        WriteMqttString(packetPayload, topic);
        packetPayload.Write(Encoding.UTF8.GetBytes(payload));

        await WritePacketAsync(stream, PublishPacketType, packetPayload.ToArray(), cancellationToken);
    }

    private static async Task WritePacketAsync(
        NetworkStream stream,
        byte packetType,
        byte[] payload,
        CancellationToken cancellationToken)
    {
        var fixedHeader = new List<byte> { packetType };
        fixedHeader.AddRange(EncodeRemainingLength(payload.Length));

        await stream.WriteAsync(fixedHeader.ToArray(), cancellationToken);
        await stream.WriteAsync(payload, cancellationToken);
    }

    private static void WriteMqttString(Stream stream, string value)
    {
        var valueBytes = Encoding.UTF8.GetBytes(value);
        Span<byte> lengthBytes = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(lengthBytes, (ushort)valueBytes.Length);
        stream.Write(lengthBytes);
        stream.Write(valueBytes);
    }

    private static IEnumerable<byte> EncodeRemainingLength(int length)
    {
        do
        {
            var encodedByte = length % 128;
            length /= 128;

            if (length > 0)
            {
                encodedByte |= 128;
            }

            yield return (byte)encodedByte;
        }
        while (length > 0);
    }
}
