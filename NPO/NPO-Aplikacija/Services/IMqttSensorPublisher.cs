using NPO_Aplikacija.Models;

namespace NPO_Aplikacija.Services;

/// <summary>
/// MQTT publisher za senzorske podatke z vzdrzevanjem persistentne povezave.
/// Podpira Last Will Testament, heartbeat in status/connect objave.
/// </summary>
public interface IMqttSensorPublisher
{
    /// <summary>
    /// Vzpostavi persistentno MQTT povezavo z Last Will in objavi status/connect + heartbeat.
    /// Idempotentno — ce je povezava ze aktivna, vrne takoj.
    /// </summary>
    Task ConnectAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Objavi senzorski podatek preko obstojece MQTT povezave.
    /// Ce povezava ni aktivna, poskusi ponovno vzpostaviti.
    /// </summary>
    Task PublishAsync(SensorData sensorData, CancellationToken cancellationToken = default);

    /// <summary>
    /// Graciozno prekini MQTT povezavo (poslje DISCONNECT, ne sprozi LWT).
    /// </summary>
    Task DisconnectAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Ali je MQTT povezava trenutno aktivna.
    /// </summary>
    bool IsConnected { get; }
}
