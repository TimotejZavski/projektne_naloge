namespace NPO_Aplikacija.Models;

/// <summary>
/// Vrsta senzorskih podatkov
/// </summary>
public enum SensorDataKind
{
    GPS,
    Accelerometer
}

/// <summary>
/// Skupni model za vse senzorske podatke
/// </summary>
public abstract record SensorData(SensorDataKind Kind, DateTime Timestamp);
