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
    Task<(double X, double Y, double Z, DateTime Timestamp)> GetAccelerationAsync();

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
    public double X { get; init; }
    public double Y { get; init; }
    public double Z { get; init; }
    public DateTime Timestamp { get; init; }
}
