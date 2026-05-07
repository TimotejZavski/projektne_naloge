using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Glavna senzorska storitev za upravljanje vseh senzorjev
/// </summary>
public interface ISensorService
{
    /// <summary>
    /// Sproži se ob vsakem novem zajemu podatkov
    /// </summary>
    event EventHandler<SensorDataUpdatedEventArgs>? SensorDataUpdated;

    /// <summary>
    /// Pridobi GPS senzor
    /// </summary>
    IGPSSensor GPSSensor { get; }

    /// <summary>
    /// Pridobi Accelerometer senzor
    /// </summary>
    IAccelerometerSensor AccelerometerSensor { get; }

    /// <summary>
    /// Inicializiraj vse senzorje
    /// </summary>
    Task InitializeAsync();

    /// <summary>
    /// Zaustavi vse senzorje
    /// </summary>
    Task StopAsync();
}

/// <summary>
/// Event argumenti za osvežitev podatkov senzorjev
/// </summary>
public sealed class SensorDataUpdatedEventArgs : EventArgs
{
    public required global::NPO_Aplikacija.Models.GPSData GpsData { get; init; }

    public required global::NPO_Aplikacija.Models.AccelerometerData AccelerometerData { get; init; }

    public required IReadOnlyList<global::NPO_Aplikacija.Models.SensorData> Snapshot { get; init; }
}
