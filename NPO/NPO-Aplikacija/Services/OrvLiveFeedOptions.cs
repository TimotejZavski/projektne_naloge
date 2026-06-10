namespace NPO_Aplikacija.Services;

public sealed record OrvLiveFeedOptions(
    Uri BaseUri,
    string CourtId,
    TimeSpan Timeout)
{
    public const string BaseUrlEnvironmentName = "NPO_ORV_BASE_URL";
    public const string CourtIdEnvironmentName = "NPO_ORV_COURT_ID";
    public const string TimeoutEnvironmentName = "NPO_ORV_TIMEOUT_SECONDS";

    public static OrvLiveFeedOptions FromEnvironment()
    {
        var baseUrl = Environment.GetEnvironmentVariable(BaseUrlEnvironmentName);
        var courtId = Environment.GetEnvironmentVariable(CourtIdEnvironmentName);
        var timeoutValue = Environment.GetEnvironmentVariable(TimeoutEnvironmentName);

        return new OrvLiveFeedOptions(
            BaseUri: BuildBaseUri(baseUrl),
            CourtId: BuildCourtId(courtId),
            Timeout: BuildTimeout(timeoutValue));
    }

    private static Uri BuildBaseUri(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            value = "http://localhost:8000";
        }

        if (!Uri.TryCreate(value.Trim().TrimEnd('/'), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return new Uri("http://localhost:8000");
        }

        return uri;
    }

    private static string BuildCourtId(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "test-court-1" : value.Trim();

    private static TimeSpan BuildTimeout(string? value)
    {
        if (int.TryParse(value, out var seconds) && seconds is >= 2 and <= 30)
        {
            return TimeSpan.FromSeconds(seconds);
        }

        return TimeSpan.FromSeconds(5);
    }
}
