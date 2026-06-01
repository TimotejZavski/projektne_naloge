namespace NPO_Aplikacija.Services;

public interface IDeviceRegistrationService
{
    Task<DeviceRegistrationResult> RegisterCurrentDeviceAsync(string accessToken);
}

public sealed record DeviceRegistrationResult(
    bool Success,
    string Message,
    string DeviceId);
