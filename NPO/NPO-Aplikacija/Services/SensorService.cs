namespace NPO_Aplikacija.Services;

/// <summary>
/// Implementacija glavne senzorske storitve
/// </summary>
public class SensorService : ISensorService
{
    private readonly IGPSSensor _gpsSensor;
    private readonly IAccelerometerSensor _accelerometerSensor;

    public SensorService(IGPSSensor gpsSensor, IAccelerometerSensor accelerometerSensor)
    {
        _gpsSensor = gpsSensor;
        _accelerometerSensor = accelerometerSensor;
    }

    public IGPSSensor GPSSensor => _gpsSensor;
    public IAccelerometerSensor AccelerometerSensor => _accelerometerSensor;

    public async Task InitializeAsync()
    {
        await _gpsSensor.StartAsync();
        await _accelerometerSensor.StartAsync();
    }

    public async Task StopAsync()
    {
        await _gpsSensor.StopAsync();
        await _accelerometerSensor.StopAsync();
    }
}
