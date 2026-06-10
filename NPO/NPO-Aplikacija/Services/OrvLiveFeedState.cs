using System.Text.Json.Serialization;

namespace NPO_Aplikacija.Services;

public sealed record OrvLiveFeedState(
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("players")] int? Players,
    [property: JsonPropertyName("team0")] int? Team0,
    [property: JsonPropertyName("team1")] int? Team1,
    [property: JsonPropertyName("waiting")] int? Waiting,
    [property: JsonPropertyName("refs")] int? Referees,
    [property: JsonPropertyName("frame")] int? Frame)
{
    public static OrvLiveFeedState Empty { get; } = new(
        Status: null,
        Players: null,
        Team0: null,
        Team1: null,
        Waiting: null,
        Referees: null,
        Frame: null);

    public string StatusLabel => string.IsNullOrWhiteSpace(Status) ? "Ni podatkov" : Status;
}
