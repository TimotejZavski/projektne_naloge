namespace NPO_Aplikacija.Services;

/// <summary>
/// Stub implementacija Accelerometer senzorja
/// </summary>
public class AccelerometerSensor : IAccelerometerSensor
{
    private bool _isActive = false;
    public event EventHandler<AccelerometerDataEventArgs>? AccelerationUpdated;

    public bool IsActive => _isActive;

    public async Task<global::NPO_Aplikacija.Models.AccelerometerData> GetAccelerationAsync()
    {
        // Stub podatki
        var data = new global::NPO_Aplikacija.Models.AccelerometerData(0.5, 0.3, 9.81, DateTime.UtcNow);

        return await Task.FromResult(data);
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
