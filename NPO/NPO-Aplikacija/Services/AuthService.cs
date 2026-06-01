using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public sealed class AuthService : IAuthService
{
    private const string AccessTokenKey = "npo_access_token";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDeviceRegistrationService _deviceRegistrationService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        IHttpClientFactory httpClientFactory,
        IDeviceRegistrationService deviceRegistrationService,
        ILogger<AuthService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _deviceRegistrationService = deviceRegistrationService;
        _logger = logger;
    }

    public AuthUser? CurrentUser { get; private set; }
    public string? AccessToken { get; private set; }
    public bool IsAuthenticated => CurrentUser is not null && !string.IsNullOrWhiteSpace(AccessToken);
    public bool IsInitialized { get; private set; }

    public event Action? AuthStateChanged;

    public async Task InitializeAsync()
    {
        AccessToken = await SecureStorage.GetAsync(AccessTokenKey);
        if (string.IsNullOrWhiteSpace(AccessToken))
        {
            IsInitialized = true;
            NotifyAuthStateChanged();
            return;
        }

        try
        {
            CurrentUser = await FetchCurrentUserAsync(AccessToken);
            await _deviceRegistrationService.RegisterCurrentDeviceAsync(AccessToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Shranjeni access token ni veljaven.");
            await ClearSessionAsync();
        }

        IsInitialized = true;
        NotifyAuthStateChanged();
    }

    public async Task<AuthResult> RegisterAsync(RegistrationFormModel model)
    {
        var payload = new
        {
            email = model.Email.Trim(),
            password = model.Password,
            displayName = model.DisplayName.Trim(),
        };

        return await AuthenticateAsync("/api/auth/register", payload, "Registracija je uspela. Dobrodošli!");
    }

    public async Task<AuthResult> LoginAsync(LoginFormModel model)
    {
        var payload = new
        {
            email = model.Email.Trim(),
            password = model.Password,
        };

        return await AuthenticateAsync("/api/auth/login", payload, "Prijava je uspela. Dobrodošli!");
    }

    public async Task LogoutAsync()
    {
        await ClearSessionAsync();
        NotifyAuthStateChanged();
    }

    private async Task<AuthResult> AuthenticateAsync(string path, object payload, string successMessage)
    {
        try
        {
            using var client = CreateClient();
            using var response = await client.PostAsJsonAsync(path, payload);

            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadFromJsonAsync<AuthApiResponse>(JsonOptions);
                if (data?.User is null || string.IsNullOrWhiteSpace(data.AccessToken))
                {
                    return new AuthResult(false, "Strežnik je vrnil neveljaven odgovor.");
                }

                await SaveSessionAsync(data.AccessToken, data.User.ToAuthUser());
                await _deviceRegistrationService.RegisterCurrentDeviceAsync(data.AccessToken);
                return new AuthResult(true, successMessage, CurrentUser);
            }

            var errorMessage = await ReadErrorMessageAsync(response);
            return new AuthResult(false, errorMessage);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Napaka pri klicu {Path}.", path);
            return new AuthResult(false, "Strežnik ni dosegljiv. Preverite internetno povezavo.");
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Zahtevek {Path} je potekel.", path);
            return new AuthResult(false, "Zahtevek je potekel. Poskusite znova.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Nepričakovana napaka pri {Path}.", path);
            return new AuthResult(false, "Prišlo je do nepričakovane napake.");
        }
    }

    private async Task<AuthUser> FetchCurrentUserAsync(string accessToken)
    {
        using var client = CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(await ReadErrorMessageAsync(response));
        }

        var data = await response.Content.ReadFromJsonAsync<MeApiResponse>(JsonOptions);
        if (data?.User is null)
        {
            throw new InvalidOperationException("Strežnik je vrnil neveljaven odgovor.");
        }

        return data.User.ToAuthUser();
    }

    private async Task SaveSessionAsync(string accessToken, AuthUser user)
    {
        AccessToken = accessToken;
        CurrentUser = user;
        await SecureStorage.SetAsync(AccessTokenKey, accessToken);
    }

    private async Task ClearSessionAsync()
    {
        AccessToken = null;
        CurrentUser = null;
        SecureStorage.Remove(AccessTokenKey);
        await Task.CompletedTask;
    }

    private HttpClient CreateClient()
    {
        return _httpClientFactory.CreateClient(ApiSettings.HttpClientName);
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
            // Fallback to generic message below.
        }

        return response.StatusCode switch
        {
            System.Net.HttpStatusCode.Unauthorized => "Napačen e-poštni naslov ali geslo.",
            System.Net.HttpStatusCode.Conflict => "Uporabnik s tem e-poštnim naslovom že obstaja.",
            System.Net.HttpStatusCode.TooManyRequests => "Preveč poskusov. Poskusite znova kasneje.",
            _ => "Zahteva ni uspela. Poskusite znova.",
        };
    }

    private void NotifyAuthStateChanged()
    {
        AuthStateChanged?.Invoke();
    }

    private sealed class AuthApiResponse
    {
        public AuthUserDto? User { get; set; }
        public string? AccessToken { get; set; }
    }

    private sealed class MeApiResponse
    {
        public AuthUserDto? User { get; set; }
    }

    private sealed class ApiErrorResponse
    {
        public ApiErrorBody? Error { get; set; }
    }

    private sealed class ApiErrorBody
    {
        public string? Code { get; set; }
        public string? Message { get; set; }
    }

    private sealed class AuthUserDto
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Role { get; set; } = "user";
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAtUtc { get; set; }

        public AuthUser ToAuthUser()
        {
            return new AuthUser(
                Id: Id,
                DisplayName: DisplayName,
                Email: Email,
                Role: Role,
                IsActive: IsActive,
                CreatedAtUtc: CreatedAtUtc);
        }
    }
}
