namespace NPO_Aplikacija.Services;

public interface IDeviceIdentityService
{
    string DeviceId { get; }
    string Platform { get; }
    string DeviceName { get; }
    string AppVersion { get; }
}
