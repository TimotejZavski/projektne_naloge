using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public interface IRaiIntegrationClient
{
    Task<RaiIntegrationStatus> CheckHealthAsync(CancellationToken cancellationToken = default);

    Task<bool> RegisterDeviceAsync(CancellationToken cancellationToken = default);

    Task<RaiSyncResult> SendMeasurementsAsync(
        IReadOnlyCollection<SensorData> measurements,
        CancellationToken cancellationToken = default);
}
