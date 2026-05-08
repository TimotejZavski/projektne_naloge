using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public interface IUserRegistrationService
{
    Task<UserRegistrationResult> RegisterAsync(RegistrationFormModel model);
}

public sealed record UserRegistrationResult(
    bool Success,
    string Message,
    RegisteredUser? User = null);
