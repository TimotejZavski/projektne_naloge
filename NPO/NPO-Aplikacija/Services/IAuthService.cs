using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public interface IAuthService
{
    AuthUser? CurrentUser { get; }
    string? AccessToken { get; }
    bool IsAuthenticated { get; }
    bool IsInitialized { get; }

    event Action? AuthStateChanged;

    Task InitializeAsync();
    Task<AuthResult> RegisterAsync(RegistrationFormModel model);
    Task<AuthResult> LoginAsync(LoginFormModel model);
    Task LogoutAsync();
}

public sealed record AuthResult(
    bool Success,
    string Message,
    AuthUser? User = null);
