namespace NPO_Aplikacija.Services;

public interface IDeviceIdentityProvider
{
    string DeviceId { get; }

    string ClientId { get; }

    string DisplayName { get; }

    string Platform { get; }

    string AppVersion { get; }
}
