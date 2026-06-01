using System.Text;

namespace NPO_Aplikacija.Services;

public sealed class DeviceIdentityService : IDeviceIdentityService
{
    private const string DeviceIdStorageKey = "npo_device_id";

    public DeviceIdentityService()
    {
        DeviceId = LoadOrCreateDeviceId();
        Platform = GetPlatform();
        DeviceName = BuildDeviceName();
        AppVersion = AppInfo.VersionString;
    }

    public string DeviceId { get; }
    public string Platform { get; }
    public string DeviceName { get; }
    public string AppVersion { get; }

    private static string LoadOrCreateDeviceId()
    {
        var stored = SecureStorage.GetAsync(DeviceIdStorageKey).GetAwaiter().GetResult();
        if (!string.IsNullOrWhiteSpace(stored))
        {
            return stored;
        }

        var candidate = NormalizeDeviceId(DeviceInfo.Name);
        if (candidate.Length < 3)
        {
            candidate = NormalizeDeviceId(DeviceInfo.Model);
        }

        if (candidate.Length < 3)
        {
            candidate = $"npo-{Guid.NewGuid():N}"[..12];
        }

        SecureStorage.SetAsync(DeviceIdStorageKey, candidate).GetAwaiter().GetResult();
        return candidate;
    }

    private static string BuildDeviceName()
    {
        var name = DeviceInfo.Name?.Trim();
        if (!string.IsNullOrWhiteSpace(name))
        {
            return name.Length <= 80 ? name : name[..80];
        }

        return DeviceInfo.Model;
    }

    private static string GetPlatform()
    {
#if ANDROID
        return "android";
#elif IOS
        return "ios";
#elif MACCATALYST
        return "macos";
#elif WINDOWS
        return "windows";
#else
        return "other";
#endif
    }

    internal static string NormalizeDeviceId(string value)
    {
        var builder = new StringBuilder();

        foreach (var character in value.ToLowerInvariant())
        {
            builder.Append(char.IsLetterOrDigit(character) ? character : '-');
        }

        return builder.ToString().Trim('-') switch
        {
            { Length: > 64 } id => id[..64].Trim('-'),
            var id => id,
        };
    }
}
