using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

public sealed class UserRegistrationService : IUserRegistrationService
{
    private readonly ConcurrentDictionary<string, RegisteredUser> _usersByEmail = new();

    public Task<UserRegistrationResult> RegisterAsync(RegistrationFormModel model)
    {
        var normalizedEmail = model.Email.Trim().ToLowerInvariant();
        var user = new RegisteredUser(
            Id: Guid.NewGuid().ToString("N"),
            DisplayName: model.DisplayName.Trim(),
            Email: normalizedEmail,
            PasswordHash: HashPassword(model.Password),
            CreatedAtUtc: DateTime.UtcNow);

        if (!_usersByEmail.TryAdd(normalizedEmail, user))
        {
            return Task.FromResult(new UserRegistrationResult(
                Success: false,
                Message: "Uporabnik s tem e-postnim naslovom ze obstaja."));
        }

        return Task.FromResult(new UserRegistrationResult(
            Success: true,
            Message: "Registracija je uspesno pripravljena.",
            User: user));
    }

    private static string HashPassword(string password)
    {
        var passwordBytes = Encoding.UTF8.GetBytes(password);
        var hashBytes = SHA256.HashData(passwordBytes);

        return Convert.ToHexString(hashBytes);
    }
}
