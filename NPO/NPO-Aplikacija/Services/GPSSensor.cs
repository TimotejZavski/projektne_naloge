namespace NPO_Aplikacija.Services;

/// <summary>
/// Stub implementacija GPS senzorja
/// </summary>
public class GPSSensor : IGPSSensor
{
    private bool _isActive = false;
    public event EventHandler<GPSDataEventArgs>? LocationUpdated;

    public bool IsActive => _isActive;

    public async Task<(double Latitude, double Longitude, DateTime Timestamp)> GetLocationAsync()
    {
        // Stub podatki
        var latitude = 46.0569;
        var longitude = 14.5058;
        var timestamp = DateTime.UtcNow;

        return await Task.FromResult((latitude, longitude, timestamp));
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
