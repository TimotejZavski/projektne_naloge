namespace NPO_Aplikacija.Services;

public static class ApiSettings
{
    // Produkcija + privzeto testiranje proti Render API-ju (isti MongoDB kot lokalni server).
    public const string BaseUrl = "https://projektne-naloge.onrender.com";

    // DEBUG: za lokalni strežnik na fizičnem telefonu odkomentiraj in vpiši IP računalnika:
    // public const string BaseUrl = "http://192.168.1.42:5000";

    public const string HttpClientName = "SmartPlaygroundsApi";
}
