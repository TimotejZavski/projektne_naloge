using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Stub implementacija GPS senzorja
/// </summary>
public class GPSSensor : IGPSSensor
{
    private bool _isActive = false;
    public event EventHandler<GPSDataEventArgs>? LocationUpdated;

    public bool IsActive => _isActive;

    public async Task<GPSData> GetLocationAsync()
    {
        // Stub podatki
        var gpsData = new GPSData(46.0569, 14.5058, DateTime.UtcNow);

        return await Task.FromResult(gpsData);
    }

    public async Task StartAsync()
    {
        _isActive = true;
        await Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        _isActive = false;
        await Task.CompletedTask;
    }
}
