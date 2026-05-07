namespace NPO_Aplikacija.Services;

/// <summary>
/// Accelerometer senzor za pridobivanje podatkov o pospešku
/// </summary>
public interface IAccelerometerSensor
{
    /// <summary>
    /// Pridobi trenutne accelerometer podatke
    /// </summary>
    /// <returns>Pospeški v X, Y, Z oseh in timestamp</returns>
    Task<global::NPO_Aplikacija.Models.AccelerometerData> GetAccelerationAsync();

    /// <summary>
    /// Event ki se sproži ko so novi accelerometer podatki dostopni
    /// </summary>
    event EventHandler<AccelerometerDataEventArgs>? AccelerationUpdated;

    /// <summary>
    /// Začni zajemati accelerometer podatke
    /// </summary>
    Task StartAsync();

    /// <summary>
    /// Zaustavi zajemanje accelerometer podatkov
    /// </summary>
    Task StopAsync();

    /// <summary>
    /// Ali je accelerometer senzor trenutno aktiven
    /// </summary>
    bool IsActive { get; }
}

/// <summary>
/// Event argumenti za accelerometer podatke
/// </summary>
public class AccelerometerDataEventArgs : EventArgs
{
    public required global::NPO_Aplikacija.Models.AccelerometerData Data { get; init; }
}
