using NPO_Aplikacija.Models;

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
    Task<GPSData> GetLocationAsync();

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
    public required GPSData Data { get; init; }
}
