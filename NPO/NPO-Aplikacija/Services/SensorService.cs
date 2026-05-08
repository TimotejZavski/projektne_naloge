using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Implementacija glavne senzorske storitve
/// </summary>
public class SensorService : ISensorService
{
    private readonly IGPSSensor _gpsSensor;
    private readonly IAccelerometerSensor _accelerometerSensor;
    private readonly ISensorDataRepository _sensorDataRepository;
    private readonly IMqttSensorPublisher _mqttSensorPublisher;
    private CancellationTokenSource? _monitoringCancellationTokenSource;
    private Task? _monitoringTask;

    public event EventHandler<SensorDataUpdatedEventArgs>? SensorDataUpdated;

    public SensorService(
        IGPSSensor gpsSensor,
        IAccelerometerSensor accelerometerSensor,
        ISensorDataRepository sensorDataRepository,
        IMqttSensorPublisher mqttSensorPublisher)
    {
        _gpsSensor = gpsSensor;
        _accelerometerSensor = accelerometerSensor;
        _sensorDataRepository = sensorDataRepository;
        _mqttSensorPublisher = mqttSensorPublisher;
    }

    public IGPSSensor GPSSensor => _gpsSensor;
    public IAccelerometerSensor AccelerometerSensor => _accelerometerSensor;

    public async Task InitializeAsync()
    {
        await _gpsSensor.StartAsync();
        await _accelerometerSensor.StartAsync();

        if (_monitoringTask is null || _monitoringTask.IsCompleted)
        {
            _monitoringCancellationTokenSource = new CancellationTokenSource();
            _monitoringTask = MonitorSensorsAsync(_monitoringCancellationTokenSource.Token);
        }

        await CaptureAndNotifyAsync();
    }

    public async Task StopAsync()
    {
        if (_monitoringCancellationTokenSource is not null)
        {
            await _monitoringCancellationTokenSource.CancelAsync();

            if (_monitoringTask is not null)
            {
                try
                {
                    await _monitoringTask;
                }
                catch (OperationCanceledException)
                {
                }
            }

            _monitoringCancellationTokenSource.Dispose();
            _monitoringCancellationTokenSource = null;
            _monitoringTask = null;
        }

        await _gpsSensor.StopAsync();
        await _accelerometerSensor.StopAsync();
    }

    private async Task MonitorSensorsAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            await CaptureAndNotifyAsync();
        }
    }

    private async Task CaptureAndNotifyAsync()
    {
        var gpsData = await _gpsSensor.GetLocationAsync();
        var accelerometerData = await _accelerometerSensor.GetAccelerationAsync();

        await _sensorDataRepository.AddAsync(gpsData);
        await _sensorDataRepository.AddAsync(accelerometerData);
        await _mqttSensorPublisher.PublishAsync(gpsData);
        await _mqttSensorPublisher.PublishAsync(accelerometerData);

        var snapshot = (await _sensorDataRepository.GetAllAsync())
            .OrderByDescending(item => item.Timestamp)
            .ToArray();

        SensorDataUpdated?.Invoke(this, new SensorDataUpdatedEventArgs
        {
            GpsData = gpsData,
            AccelerometerData = accelerometerData,
            Snapshot = snapshot
        });
    }
}
