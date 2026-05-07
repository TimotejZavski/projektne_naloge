namespace NPO_Aplikacija.Services;

/// <summary>
/// Stub implementacija Accelerometer senzorja
/// </summary>
public class AccelerometerSensor : IAccelerometerSensor
{
    private bool _isActive = false;
    public event EventHandler<AccelerometerDataEventArgs>? AccelerationUpdated;

    public bool IsActive => _isActive;

    public async Task<(double X, double Y, double Z, DateTime Timestamp)> GetAccelerationAsync()
    {
        // Stub podatki
        var x = 0.5;
        var y = 0.3;
        var z = 9.81;
        var timestamp = DateTime.UtcNow;

        return await Task.FromResult((x, y, z, timestamp));
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
