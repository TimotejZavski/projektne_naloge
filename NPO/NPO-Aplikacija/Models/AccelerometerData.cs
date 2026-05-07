namespace NPO_Aplikacija.Models;

/// <summary>
/// Model za accelerometer podatke
/// </summary>
public sealed record AccelerometerData(double X, double Y, double Z, DateTime Timestamp)
	: SensorData(SensorDataKind.Accelerometer, Timestamp);
