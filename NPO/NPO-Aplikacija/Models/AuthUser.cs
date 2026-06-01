namespace NPO_Aplikacija.Models;

public sealed record AuthUser(
    string Id,
    string DisplayName,
    string Email,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc);
