namespace NPO_Aplikacija.Services;

public interface IDeviceRegistrationService
{
    Task RegisterCurrentDeviceAsync(string accessToken);
}
