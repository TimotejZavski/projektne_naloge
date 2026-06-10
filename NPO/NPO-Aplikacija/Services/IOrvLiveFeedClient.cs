namespace NPO_Aplikacija.Services;

public interface IOrvLiveFeedClient
{
    OrvLiveFeedOptions Options { get; }

    string FeedUrl { get; }

    string GlobalHeatmapUrl { get; }

    string Team0HeatmapUrl { get; }

    string Team1HeatmapUrl { get; }

    Task<OrvLiveFeedState> GetStateAsync(CancellationToken cancellationToken = default);
}
