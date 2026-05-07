using System.Collections.Concurrent;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// In-memory implementacija repository-ja za senzorske podatke
/// </summary>
public class SensorDataRepository : ISensorDataRepository
{
    private readonly ConcurrentQueue<SensorData> _sensorData = new();

    public Task AddAsync(SensorData sensorData)
    {
        _sensorData.Enqueue(sensorData);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<SensorData>> GetAllAsync()
    {
        IReadOnlyList<SensorData> snapshot = _sensorData.ToArray();
        return Task.FromResult(snapshot);
    }

    public Task<IReadOnlyList<SensorData>> GetByKindAsync(SensorDataKind kind)
    {
        IReadOnlyList<SensorData> filtered = _sensorData.Where(data => data.Kind == kind).ToArray();
        return Task.FromResult(filtered);
    }

    public Task ClearAsync()
    {
        while (_sensorData.TryDequeue(out _))
        {
        }

        return Task.CompletedTask;
    }
}
