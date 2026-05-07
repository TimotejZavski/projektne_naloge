namespace NPO_Aplikacija.Services;

/// <summary>
/// GPS senzor za pridobivanje lokacijskih podatkov
/// </summary>
public interface IGPSSensor
{
    /// <summary>
    /// Pridobi trenutno GPS lokacijo
    /// </summary>
    /// <returns>GPS podatki (latitude, longitude, timestamp)</returns>
    Task<(double Latitude, double Longitude, DateTime Timestamp)> GetLocationAsync();

    /// <summary>
    /// Event ki se sproži ko so novi GPS podatki dostopni
    /// </summary>
    event EventHandler<GPSDataEventArgs>? LocationUpdated;

    /// <summary>
    /// Začni zajemati GPS podatke
    /// </summary>
    Task StartAsync();

    /// <summary>
    /// Zaustavi zajemanje GPS podatkov
    /// </summary>
    Task StopAsync();

    /// <summary>
    /// Ali je GPS senzor trenutno aktiven
    /// </summary>
    bool IsActive { get; }
}

/// <summary>
/// Event argumenti za GPS podatke
/// </summary>
public class GPSDataEventArgs : EventArgs
{
    public double Latitude { get; init; }
    public double Longitude { get; init; }
    public DateTime Timestamp { get; init; }
}
