using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// Repository za lokalno shranjevanje senzorskih podatkov
/// </summary>
public interface ISensorDataRepository
{
    Task AddAsync(SensorData sensorData);

    Task<IReadOnlyList<SensorData>> GetAllAsync();

    Task<IReadOnlyList<SensorData>> GetByKindAsync(SensorDataKind kind);

    Task ClearAsync();
}
