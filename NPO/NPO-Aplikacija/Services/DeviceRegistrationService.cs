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

    public async Task RegisterCurrentDeviceAsync(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return;
        }

        var payload = new
        {
            deviceId = _deviceIdentity.DeviceId,
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
                _logger.LogInformation(
                    "Naprava {DeviceId} je registrirana na strežniku.",
                    _deviceIdentity.DeviceId);
                return;
            }

            var error = await ReadErrorMessageAsync(response);
            _logger.LogWarning(
                "Registracija naprave {DeviceId} ni uspela ({StatusCode}): {Error}",
                _deviceIdentity.DeviceId,
                (int)response.StatusCode,
                error);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Registracija naprave {DeviceId} ni uspela.",
                _deviceIdentity.DeviceId);
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

        return $"HTTP {(int)response.StatusCode}";
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
