using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public sealed class RaiIntegrationClient : IRaiIntegrationClient
{
    private readonly HttpClient _httpClient;
    private readonly RaiIntegrationOptions _options;
    private readonly IDeviceIdentityProvider _deviceIdentityProvider;
    private readonly ILogger<RaiIntegrationClient> _logger;

    public RaiIntegrationClient(
        HttpClient httpClient,
        RaiIntegrationOptions options,
        IDeviceIdentityProvider deviceIdentityProvider,
        ILogger<RaiIntegrationClient> logger)
    {
        _httpClient = httpClient;
        _options = options;
        _deviceIdentityProvider = deviceIdentityProvider;
        _logger = logger;

        _httpClient.BaseAddress = _options.BaseUri;
        _httpClient.Timeout = _options.Timeout;
    }

    public async Task<RaiIntegrationStatus> CheckHealthAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
            var message = response.IsSuccessStatusCode
                ? "RAI backend je dosegljiv."
                : $"RAI health check je vrnil HTTP {(int)response.StatusCode}.";

            return new RaiIntegrationStatus(
                IsConfigured: true,
                IsReachable: response.IsSuccessStatusCode,
                BaseUrl: _options.BaseUri.ToString(),
                Message: message,
                CheckedAtUtc: DateTime.UtcNow);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(exception, "RAI health check failed for {BaseUrl}.", _options.BaseUri);

            return new RaiIntegrationStatus(
                IsConfigured: true,
                IsReachable: false,
                BaseUrl: _options.BaseUri.ToString(),
                Message: "RAI backend trenutno ni dosegljiv.",
                CheckedAtUtc: DateTime.UtcNow);
        }
    }

    public async Task<bool> RegisterDeviceAsync(CancellationToken cancellationToken = default)
    {
        var request = new RaiDeviceRegistrationRequest(
            _deviceIdentityProvider.DeviceId,
            _deviceIdentityProvider.DisplayName,
            _deviceIdentityProvider.Platform,
            _deviceIdentityProvider.AppVersion);

        try
        {
            using var response = await _httpClient.PostAsJsonAsync("/api/devices", request, cancellationToken);
            if (response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK)
            {
                return true;
            }

            _logger.LogWarning(
                "RAI device registration returned HTTP {StatusCode}.",
                (int)response.StatusCode);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(exception, "RAI device registration failed.");
        }

        return false;
    }

    public async Task<RaiSyncResult> SendMeasurementsAsync(
        IReadOnlyCollection<SensorData> measurements,
        CancellationToken cancellationToken = default)
    {
        var payload = measurements
            .Select(BuildMeasurement)
            .Where(measurement => measurement is not null)
            .Cast<RaiMeasurementRequest>()
            .ToArray();

        if (payload.Length == 0)
        {
            return RaiSyncResult.Skipped("Ni meritev za sinhronizacijo.");
        }

        try
        {
            await RegisterDeviceAsync(cancellationToken);

            using var response = await _httpClient.PostAsJsonAsync(
                "/api/measurements/batch",
                new RaiBatchMeasurementsRequest(payload),
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return new RaiSyncResult(
                    Success: false,
                    SentCount: 0,
                    RejectedCount: payload.Length,
                    Message: $"RAI je vrnil HTTP {(int)response.StatusCode}.",
                    CompletedAtUtc: DateTime.UtcNow);
            }

            var result = await response.Content.ReadFromJsonAsync<RaiBatchResponse>(
                cancellationToken: cancellationToken);

            return new RaiSyncResult(
                Success: true,
                SentCount: result?.InsertedCount ?? payload.Length,
                RejectedCount: result?.RejectedCount ?? 0,
                Message: "Meritve so poslane v RAI.",
                CompletedAtUtc: DateTime.UtcNow);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(exception, "RAI measurement sync failed.");
            return RaiSyncResult.Skipped("RAI backend trenutno ni dosegljiv.");
        }
    }

    private RaiMeasurementRequest? BuildMeasurement(SensorData sensorData)
    {
        var sensorType = sensorData switch
        {
            GPSData => "gps",
            NPO_Aplikacija.Models.AccelerometerData => "accelerometer",
            _ => null
        };

        if (sensorType is null)
        {
            return null;
        }

        return new RaiMeasurementRequest(
            SchemaVersion: "1.0",
            DeviceId: _deviceIdentityProvider.DeviceId,
            SensorType: sensorType,
            TimestampUtc: sensorData.Timestamp.ToUniversalTime(),
            Data: BuildData(sensorData));
    }

    private static object BuildData(SensorData sensorData) => sensorData switch
    {
        GPSData gpsData => new
        {
            latitude = gpsData.Latitude,
            longitude = gpsData.Longitude,
            accuracyMeters = gpsData.AccuracyMeters
        },
        NPO_Aplikacija.Models.AccelerometerData accelerometerData => new
        {
            x = accelerometerData.X,
            y = accelerometerData.Y,
            z = accelerometerData.Z,
            unit = "m/s2"
        },
        _ => new { }
    };

    private sealed record RaiDeviceRegistrationRequest(
        string DeviceId,
        string Name,
        string Platform,
        string AppVersion);

    private sealed record RaiBatchMeasurementsRequest(
        IReadOnlyCollection<RaiMeasurementRequest> Measurements);

    private sealed record RaiMeasurementRequest(
        string SchemaVersion,
        string DeviceId,
        string SensorType,
        DateTime TimestampUtc,
        object Data);

    private sealed record RaiBatchResponse(
        [property: JsonPropertyName("insertedCount")] int InsertedCount,
        [property: JsonPropertyName("rejectedCount")] int RejectedCount);
}
