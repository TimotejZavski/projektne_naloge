using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace NPO_Aplikacija.Services;

public sealed class OrvLiveFeedClient : IOrvLiveFeedClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<OrvLiveFeedClient> _logger;

    public OrvLiveFeedClient(
        HttpClient httpClient,
        OrvLiveFeedOptions options,
        ILogger<OrvLiveFeedClient> logger)
    {
        _httpClient = httpClient;
        Options = options;
        _logger = logger;

        _httpClient.BaseAddress = options.BaseUri;
        _httpClient.Timeout = options.Timeout;
    }

    public OrvLiveFeedOptions Options { get; }

    public string FeedUrl => BuildAbsoluteUrl($"/orv/courts/{Options.CourtId}/live/feed");

    public string GlobalHeatmapUrl => BuildAbsoluteUrl($"/orv/courts/{Options.CourtId}/live/heatmap");

    public string Team0HeatmapUrl => BuildAbsoluteUrl($"/orv/courts/{Options.CourtId}/live/heatmap?team=0");

    public string Team1HeatmapUrl => BuildAbsoluteUrl($"/orv/courts/{Options.CourtId}/live/heatmap?team=1");

    public async Task<OrvLiveFeedState> GetStateAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var state = await _httpClient.GetFromJsonAsync<OrvLiveFeedState>(
                $"/orv/courts/{Options.CourtId}/live/state",
                cancellationToken);

            return state ?? OrvLiveFeedState.Empty;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(
                exception,
                "ORV live state could not be loaded for court {CourtId}.",
                Options.CourtId);

            return OrvLiveFeedState.Empty;
        }
    }

    private string BuildAbsoluteUrl(string path) => new Uri(Options.BaseUri, path).ToString();
}
