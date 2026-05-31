namespace NPO_Aplikacija.Models;

public sealed record RaiIntegrationStatus(
    bool IsConfigured,
    bool IsReachable,
    string BaseUrl,
    string Message,
    DateTime CheckedAtUtc);

public sealed record RaiSyncResult(
    bool Success,
    int SentCount,
    int RejectedCount,
    string Message,
    DateTime CompletedAtUtc)
{
    public static RaiSyncResult Skipped(string message) =>
        new(false, 0, 0, message, DateTime.UtcNow);
}
