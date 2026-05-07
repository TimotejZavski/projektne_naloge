using Microsoft.Maui.Devices.Sensors;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Accelerometer sensor implementation using MAUI device sensors
/// </summary>
public class AccelerometerSensor : IAccelerometerSensor
{
    private bool _isActive = false;
    private global::NPO_Aplikacija.Models.AccelerometerData? _latest;

    public event EventHandler<AccelerometerDataEventArgs>? AccelerationUpdated;

    public bool IsActive => _isActive;

    public Task<global::NPO_Aplikacija.Models.AccelerometerData> GetAccelerationAsync()
    {
        if (_latest is not null)
            return Task.FromResult(_latest);

        // If no live data yet, return a sensible zeroed value (gravity on Z if device stationary)
        var fallback = new global::NPO_Aplikacija.Models.AccelerometerData(0.0, 0.0, 9.81, DateTime.UtcNow);
        return Task.FromResult(fallback);
    }

    public Task StartAsync()
    {
        if (!Accelerometer.IsSupported)
        {
            _isActive = false;
            return Task.CompletedTask;
        }

        if (_isActive)
            return Task.CompletedTask;

        Accelerometer.ReadingChanged += OnReadingChanged;
        try
        {
            Accelerometer.Start(SensorSpeed.UI);
            _isActive = true;
        }
        catch
        {
            // If start fails, ensure state is consistent
            Accelerometer.ReadingChanged -= OnReadingChanged;
            _isActive = false;
        }

        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        if (!Accelerometer.IsSupported || !_isActive)
            return Task.CompletedTask;

        try
        {
            Accelerometer.Stop();
        }
        catch
        {
            // ignore stop errors
        }

        Accelerometer.ReadingChanged -= OnReadingChanged;
        _isActive = false;
        return Task.CompletedTask;
    }

    private void OnReadingChanged(object? sender, AccelerometerChangedEventArgs e)
    {
        var r = e.Reading;
        var data = new global::NPO_Aplikacija.Models.AccelerometerData(r.Acceleration.X, r.Acceleration.Y, r.Acceleration.Z, DateTime.UtcNow);
        _latest = data;

        AccelerationUpdated?.Invoke(this, new AccelerometerDataEventArgs { Data = data });
    }
}
