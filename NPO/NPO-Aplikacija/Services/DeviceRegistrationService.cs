using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace NPO_Aplikacija.Services;

public sealed class DeviceRegistrationService : IDeviceRegistrationService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDeviceIdentityService _deviceIdentity;
    private readonly ILogger<DeviceRegistrationService> _logger;

    public DeviceRegistrationService(
        IHttpClientFactory httpClientFactory,
        IDeviceIdentityService deviceIdentity,
        ILogger<DeviceRegistrationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _deviceIdentity = deviceIdentity;
        _logger = logger;
    }

    public async Task<DeviceRegistrationResult> RegisterCurrentDeviceAsync(string accessToken)
    {
        var deviceId = _deviceIdentity.DeviceId;

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return new DeviceRegistrationResult(false, "Manjka access token.", deviceId);
        }

        if (deviceId.Length < 3)
        {
            return new DeviceRegistrationResult(
                false,
                "Identifikator naprave je prekratek.",
                deviceId);
        }

        var payload = new
        {
            deviceId,
            name = _deviceIdentity.DeviceName,
            platform = _deviceIdentity.Platform,
            appVersion = _deviceIdentity.AppVersion,
        };

        try
        {
            using var client = _httpClientFactory.CreateClient(ApiSettings.HttpClientName);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/devices")
            {
                Content = JsonContent.Create(payload),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await client.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Naprava {DeviceId} je registrirana na strežniku.", deviceId);
                return new DeviceRegistrationResult(
                    true,
                    "Naprava je povezana z vašim računom.",
                    deviceId);
            }

            var error = await ReadErrorMessageAsync(response);
            _logger.LogWarning(
                "Registracija naprave {DeviceId} ni uspela ({StatusCode}): {Error}",
                deviceId,
                (int)response.StatusCode,
                error);

            return new DeviceRegistrationResult(false, error, deviceId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Registracija naprave {DeviceId} ni uspela.", deviceId);
            return new DeviceRegistrationResult(
                false,
                "Strežnik ni dosegljiv. Preverite internetno povezavo.",
                deviceId);
        }
    }

    private static async Task<string> ReadErrorMessageAsync(HttpResponseMessage response)
    {
        try
        {
            var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
            if (!string.IsNullOrWhiteSpace(error?.Error?.Message))
            {
                return error.Error.Message;
            }
        }
        catch (JsonException)
        {
            // Ignore parse errors.
        }

        return response.StatusCode switch
        {
            System.Net.HttpStatusCode.Conflict => "Ta naprava je že registrirana pod drugim računom.",
            System.Net.HttpStatusCode.Unauthorized => "Seja je potekla. Prijavite se znova.",
            _ => $"Registracija ni uspela (HTTP {(int)response.StatusCode}).",
        };
    }

    private sealed class ApiErrorResponse
    {
        public ApiErrorBody? Error { get; set; }
    }

    private sealed class ApiErrorBody
    {
        public string? Message { get; set; }
    }
}
