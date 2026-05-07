namespace NPO_Aplikacija.Models;

/// <summary>
/// Model za GPS podatke
/// </summary>
public sealed record GPSData(double Latitude, double Longitude, DateTime Timestamp)
	: SensorData(SensorDataKind.GPS, Timestamp);
