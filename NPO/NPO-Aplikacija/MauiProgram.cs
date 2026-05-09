using Microsoft.Extensions.Logging;
using NPO_Aplikacija.Services;

namespace NPO_Aplikacija
{
    public static class MauiProgram
    {
        public static MauiApp CreateMauiApp()
        {
            var builder = MauiApp.CreateBuilder();
            builder
                .UseMauiApp<App>()
                .ConfigureFonts(fonts =>
                {
                    fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                });

            builder.Services.AddMauiBlazorWebView();

            // Registracija senzorskih storitev
            builder.Services.AddSingleton<IGPSSensor, GPSSensor>();
            builder.Services.AddSingleton<IAccelerometerSensor, AccelerometerSensor>();
            builder.Services.AddSingleton<ISensorService, SensorService>();
            builder.Services.AddSingleton<ISensorDataRepository, SensorDataRepository>();
            builder.Services.AddSingleton<IMqttSensorPublisher, MqttSensorPublisher>();
            builder.Services.AddSingleton<IUserRegistrationService, UserRegistrationService>();

#if DEBUG
    		builder.Services.AddBlazorWebViewDeveloperTools();
    		builder.Logging.AddDebug();
#endif

            return builder.Build();
        }
    }
}
