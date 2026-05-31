using System.Text.Json;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public static class MqttSensorMessageFactory
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static string BuildTopic(string baseTopic, string deviceId, SensorData sensorData)
    {
        var normalizedBaseTopic = baseTopic.Trim().Trim('/');
        var sensorType = GetSensorType(sensorData);

        return $"{normalizedBaseTopic}/devices/{deviceId}/sensors/{sensorType}";
    }

    public static string BuildJsonPayload(string deviceId, SensorData sensorData)
    {
        var message = new MqttSensorMessage(
            SchemaVersion: "1.0",
            DeviceId: deviceId,
            SensorType: GetSensorType(sensorData),
            TimestampUtc: sensorData.Timestamp.ToUniversalTime(),
            Data: BuildPayload(sensorData));

        return JsonSerializer.Serialize(message, JsonOptions);
    }

    private static string GetSensorType(SensorData sensorData) => sensorData switch
    {
        GPSData => "gps",
        NPO_Aplikacija.Models.AccelerometerData => "accelerometer",
        _ => sensorData.Kind.ToString().ToLowerInvariant()
    };

    private static object BuildPayload(SensorData sensorData) => sensorData switch
    {
        GPSData gpsData => new MqttGpsPayload(
            gpsData.Latitude,
            gpsData.Longitude,
            gpsData.AccuracyMeters),
        NPO_Aplikacija.Models.AccelerometerData accelerometerData => new MqttAccelerometerPayload(
            accelerometerData.X,
            accelerometerData.Y,
            accelerometerData.Z),
        _ => new { }
    };
}
