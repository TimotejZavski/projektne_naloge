using System.Reflection;
using System.Text;

namespace NPO_Aplikacija.Services;

public sealed class DeviceIdentityProvider : IDeviceIdentityProvider
{
    private readonly Lazy<string> _deviceId = new(BuildDeviceId);

    public string DeviceId => _deviceId.Value;

    public string ClientId => $"npo-{DeviceId}";

    public string DisplayName => $"{Platform} NPO naprava";

    public string Platform => DeviceInfo.Current.Platform.ToString().ToLowerInvariant();

    public string AppVersion => AppInfo.Current.VersionString
        ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString()
        ?? "1.0";

    private static string BuildDeviceId()
    {
        var configured = Environment.GetEnvironmentVariable("NPO_DEVICE_ID");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Normalize(configured);
        }

        var deviceName = DeviceInfo.Current.Name;
        if (string.IsNullOrWhiteSpace(deviceName))
        {
            deviceName = Environment.MachineName;
        }

        return Normalize(deviceName);
    }

    private static string Normalize(string value)
    {
        var builder = new StringBuilder();

        foreach (var character in value.ToLowerInvariant())
        {
            builder.Append(char.IsLetterOrDigit(character) ? character : '-');
        }

        var normalized = builder.ToString().Trim('-');
        if (normalized.Length < 3)
        {
            normalized = $"npo-{normalized}";
        }

        return normalized.Length <= 64 ? normalized : normalized[..64].Trim('-');
    }
}
