namespace NPO_Aplikacija.Models;

public sealed record RegisteredUser(
    string Id,
    string DisplayName,
    string Email,
    string PasswordHash,
    DateTime CreatedAtUtc);
