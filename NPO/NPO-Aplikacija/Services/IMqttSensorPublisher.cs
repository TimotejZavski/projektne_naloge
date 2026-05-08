using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public interface IMqttSensorPublisher
{
    Task PublishAsync(SensorData sensorData, CancellationToken cancellationToken = default);
}
