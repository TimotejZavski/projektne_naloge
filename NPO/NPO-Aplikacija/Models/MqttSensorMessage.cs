using System.Text.Json.Serialization;

namespace NPO_Aplikacija.Models;

public sealed record MqttSensorMessage(
    string SchemaVersion,
    string DeviceId,
    string SensorType,
    DateTime TimestampUtc,
    object Data);

public sealed record MqttGpsPayload(
    [property: JsonPropertyName("latitude")] double Latitude,
    [property: JsonPropertyName("longitude")] double Longitude,
    [property: JsonPropertyName("accuracyMeters")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    double? AccuracyMeters = null);

public sealed record MqttAccelerometerPayload(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y,
    [property: JsonPropertyName("z")] double Z);
