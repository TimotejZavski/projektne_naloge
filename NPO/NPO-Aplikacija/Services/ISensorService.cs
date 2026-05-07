namespace NPO_Aplikacija.Services;

/// <summary>
/// Glavna senzorska storitev za upravljanje vseh senzorjev
/// </summary>
public interface ISensorService
{
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
