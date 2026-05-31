namespace NPO_Aplikacija.Services;

public sealed record RaiIntegrationOptions(
    Uri BaseUri,
    string HealthPath,
    TimeSpan Timeout)
{
    public const string BaseUrlEnvironmentName = "NPO_RAI_BASE_URL";
    public const string TimeoutEnvironmentName = "NPO_RAI_TIMEOUT_SECONDS";

    public static RaiIntegrationOptions FromEnvironment()
    {
        var baseUrl = Environment.GetEnvironmentVariable(BaseUrlEnvironmentName);
        var timeoutValue = Environment.GetEnvironmentVariable(TimeoutEnvironmentName);

        return new RaiIntegrationOptions(
            BaseUri: BuildBaseUri(baseUrl),
            HealthPath: "/health",
            Timeout: BuildTimeout(timeoutValue));
    }

    private static Uri BuildBaseUri(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            value = "http://localhost:5000";
        }

        if (!Uri.TryCreate(value.Trim().TrimEnd('/'), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return new Uri("http://localhost:5000");
        }

        return uri;
    }

    private static TimeSpan BuildTimeout(string? value)
    {
        if (int.TryParse(value, out var seconds) && seconds is >= 2 and <= 60)
        {
            return TimeSpan.FromSeconds(seconds);
        }

        return TimeSpan.FromSeconds(10);
    }
}
