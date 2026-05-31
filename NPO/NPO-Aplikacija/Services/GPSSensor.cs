using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// GPS senzor z uporabo MAUI geolokacije in varnim razvojnim nadomestkom.
/// </summary>
public class GPSSensor : IGPSSensor
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
    private const double FallbackLatitude = 46.0569;
    private const double FallbackLongitude = 14.5058;

    private bool _isActive = false;
    private GPSData? _lastKnownLocation;

    public event EventHandler<GPSDataEventArgs>? LocationUpdated;

    public bool IsActive => _isActive;

    public async Task<GPSData> GetLocationAsync()
    {
        var gpsData = await TryReadDeviceLocationAsync()
            ?? _lastKnownLocation
            ?? CreateFallbackLocation();

        _lastKnownLocation = gpsData;
        LocationUpdated?.Invoke(this, new GPSDataEventArgs { Data = gpsData });

        return gpsData;
    }

    private static async Task<GPSData?> TryReadDeviceLocationAsync()
    {
        try
        {
            var request = new GeolocationRequest(GeolocationAccuracy.Medium, RequestTimeout);
            var location = await Geolocation.Default.GetLocationAsync(request)
                ?? await Geolocation.Default.GetLastKnownLocationAsync();

            return location is null ? null : MapLocation(location);
        }
        catch (Exception exception) when (
            exception is FeatureNotSupportedException
            or FeatureNotEnabledException
            or PermissionException
            or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static GPSData MapLocation(Location location)
    {
        var timestamp = location.Timestamp == default
            ? DateTime.UtcNow
            : location.Timestamp.UtcDateTime;

        return new GPSData(
            location.Latitude,
            location.Longitude,
            timestamp,
            NormalizeAccuracy(location.Accuracy));
    }

    private static GPSData CreateFallbackLocation()
    {
        return new GPSData(
            FallbackLatitude,
            FallbackLongitude,
            DateTime.UtcNow);
    }

    private static double? NormalizeAccuracy(double? accuracyMeters)
    {
        return accuracyMeters is > 0 ? Math.Round(accuracyMeters.Value, 2) : null;
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
