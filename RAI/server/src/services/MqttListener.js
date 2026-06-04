/**
 * MQTT Listener za prijem senzorskih podatkov IN status sporocil.
 *
 * Senzorski podatki:
 *   `smart-playgrounds/devices/{deviceId}/sensors/{sensorType}`
 *   Validiraj, očisti in shrani v SensorMeasurement (raw).
 *
 * Status sporocila (SCRUM-46 heartbeat, LWT, connect):
 *   `smart-playgrounds/devices/{deviceId}/status/online`  — heartbeat / LWT
 *   `smart-playgrounds/devices/{deviceId}/status/connect` — metapodatki ob povezavi
 *
 * Štetje aktivnih naprav (SCRUM-47):
 *   Ob vsaki spremembi stanja objavi occupancy na:
 *   `smart-playgrounds/analytics/playground/anonymous/occupancy`
 *
 * Uporaba:
 *   const listener = new MqttListener();
 *   await listener.connect();
 */

const mqtt = require("mqtt");
const SensorMeasurement = require("../models/SensorMeasurement");
const ProcessedMeasurement = require("../models/ProcessedMeasurement");
const Device = require("../models/Device");
const MeasurementValidator = require("./MeasurementValidator");
const env = require("../config/env");

class MqttListener {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.messageCount = 0;
    this.deduplicationCache = new Map(); // { key: timestamp }

    // SCRUM-46/47: sledenje aktivnim napravam
    this.onlineDevices = new Map();
    // { deviceId: { online: true, lastSeen, platform, appVersion, lastHeartbeat } }

    this.occupancyTimer = null;
    this.occupancyIntervalMs = 15_000; // 15 sekund
  }

  /**
   * Vrni stevilo trenutno aktivnih ("online") naprav.
   */
  get activeDeviceCount() {
    return this.onlineDevices.size;
  }

  /**
   * Vrni seznam aktivnih deviceId-jev.
   */
  get activeDeviceIds() {
    return Array.from(this.onlineDevices.keys());
  }

  /**
   * Povezavi se s MQTT brokerjem in naroci na senzorske + status teme.
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const brokerUrl = env.MQTT_BROKER_URL || "mqtt://localhost:1883";

      // eslint-disable-next-line no-console
      console.log(`[MQTT] Connecting to ${brokerUrl}...`);

      this.client = mqtt.connect(brokerUrl, {
        clientId: `rai-server-${Date.now()}`,
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      });

      this.client.on("connect", () => {
        // eslint-disable-next-line no-console
        console.log("[MQTT] Connected successfully");
        this.isConnected = true;

        const topics = [
          // Senzorski podatki (obstojece)
          "smart-playgrounds/devices/+/sensors/+",
          // Status sporocila (NOVO — SCRUM-46)
          "smart-playgrounds/devices/+/status/#",
        ];

        this.client.subscribe(topics, (err) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.error(`[MQTT] Subscribe error: ${err}`);
            reject(err);
          } else {
            // eslint-disable-next-line no-console
            console.log(`[MQTT] Subscribed to topics: ${topics.join(", ")}`);

            // Zaženi periodično objavo occupancy podatkov
            this.startOccupancyPublisher();

            resolve();
          }
        });
      });

      this.client.on("message", (topic, payload) => {
        this.handleMessage(topic, payload);
      });

      this.client.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.error("[MQTT] Connection error:", err);
        this.isConnected = false;
        reject(err);
      });

      this.client.on("disconnect", () => {
        // eslint-disable-next-line no-console
        console.log("[MQTT] Disconnected");
        this.isConnected = false;
      });
    });
  }

  /**
   * Usmerjevalnik: senzorski topic → handleSensorMessage,
   *                status topic   → handleStatusMessage.
   */
  async handleMessage(topic, payload) {
    const topicParts = topic.split("/");

    if (
      topicParts.length >= 5 &&
      topicParts[0] === "smart-playgrounds" &&
      topicParts[1] === "devices"
    ) {
      const subType = topicParts[3]; // "sensors" ali "status"

      if (subType === "sensors") {
        await this.handleSensorMessage(topic, topicParts, payload);
      } else if (subType === "status") {
        await this.handleStatusMessage(topic, topicParts, payload);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Unknown sub-type: ${subType} in topic ${topic}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[MQTT] Unhandled topic: ${topic}`);
    }
  }

  /**
   * Obdelaj senzorsko MQTT sporočilo (obstoječa logika).
   */
  async handleSensorMessage(topic, topicParts, payload) {
    try {
      const deviceId = topicParts[2];
      const sensorType = topicParts[4];

      let messageData;
      try {
        messageData = JSON.parse(payload.toString());
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[MQTT] JSON parse error for topic ${topic}:`,
          parseErr.message,
        );
        return;
      }

      if (
        (messageData.deviceId && messageData.deviceId !== deviceId) ||
        (messageData.sensorType && messageData.sensorType !== sensorType)
      ) {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Payload does not match topic: ${topic}`);
        return;
      }

      const measurement = {
        deviceId,
        sensorType,
        timestampUtc:
          messageData.timestampUtc ||
          messageData.timestamp ||
          new Date().toISOString(),
        data: messageData.data || messageData,
        schemaVersion: messageData.schemaVersion || "1.0",
      };

      const validation = MeasurementValidator.validateMeasurement(measurement);
      if (!validation.isValid) {
        // eslint-disable-next-line no-console
        console.warn(
          `[MQTT] Validation failed for ${deviceId}/${sensorType}:`,
          validation.errors,
        );
        return;
      }

      const dedupeKey = `${deviceId}:${sensorType}:${validation.cleanedData.timestampUtc.getTime()}`;
      if (this.deduplicationCache.has(dedupeKey)) {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Duplicate message ignored: ${dedupeKey}`);
        return;
      }

      this.deduplicationCache.set(dedupeKey, Date.now());

      const device = await Device.findOne({
        deviceId: validation.cleanedData.deviceId,
      })
        .select("userId")
        .lean();

      const userId = device ? device.userId : null;

      const rawMeasurement = new SensorMeasurement({
        deviceId: validation.cleanedData.deviceId,
        userId,
        sensorType: validation.cleanedData.sensorType,
        timestampUtc: validation.cleanedData.timestampUtc,
        data: validation.cleanedData.data,
        source: "mqtt",
        schemaVersion: measurement.schemaVersion,
      });

      await rawMeasurement.save();

      // Posodobi lastSeenAtUtc na napravi (ce obstaja)
      if (device) {
        await Device.touchLastSeen(validation.cleanedData.deviceId);
      }

      this.messageCount += 1;

      if (this.messageCount % 100 === 0) {
        // eslint-disable-next-line no-console
        console.log(`[MQTT] Processed ${this.messageCount} sensor messages`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[MQTT] Error handling sensor message:", err.message);
    }
  }

  /**
   * Obdelaj status MQTT sporočilo (SCRUM-46).
   *
   * Podprti status tipi:
   *   - online:  heartbeat (`{"online":true}`) ali LWT (`{"online":false}`)
   *   - connect: metapodatki naprave ob povezavi
   */
  async handleStatusMessage(topic, topicParts, payload) {
    try {
      const deviceId = topicParts[2];
      const statusType = topicParts[4]; // "online" ali "connect"

      let messageData;
      try {
        messageData = JSON.parse(payload.toString());
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[MQTT] Status JSON parse error for ${topic}:`,
          parseErr.message,
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[MQTT] Status ${statusType} from ${deviceId}:`,
        JSON.stringify(messageData),
      );

      switch (statusType) {
        case "online": {
          if (messageData.online === true) {
            // Heartbeat: naprava je aktivna
            const existing = this.onlineDevices.get(deviceId) || {};
            this.onlineDevices.set(deviceId, {
              ...existing,
              online: true,
              lastHeartbeat: new Date(),
              lastSeen: messageData.timestampUtc || new Date().toISOString(),
            });

            // Posodobi device v bazi (isActive=true, lastSeen)
            try {
              const dbDevice = await Device.findOne({ deviceId });
              if (dbDevice) {
                dbDevice.isActive = true;
                dbDevice.lastSeenAtUtc = new Date();
                dbDevice.updatedAtUtc = new Date();
                await dbDevice.save();
              }
            } catch (dbErr) {
              // eslint-disable-next-line no-console
              console.warn(
                `[MQTT] Could not update device ${deviceId}:`,
                dbErr.message,
              );
            }

            // eslint-disable-next-line no-console
            console.log(
              `[MQTT] Device ${deviceId} is ONLINE (total active: ${this.onlineDevices.size})`,
            );
          } else {
            // LWT ali eksplicitni offline: naprava ni vec aktivna
            this.onlineDevices.delete(deviceId);

            // Posodobi device v bazi (isActive=false)
            try {
              const dbDevice2 = await Device.findOne({ deviceId });
              if (dbDevice2) {
                dbDevice2.isActive = false;
                dbDevice2.updatedAtUtc = new Date();
                await dbDevice2.save();
              }
            } catch (dbErr2) {
              // eslint-disable-next-line no-console
              console.warn(
                `[MQTT] Could not update device ${deviceId}:`,
                dbErr2.message,
              );
            }

            // eslint-disable-next-line no-console
            console.log(
              `[MQTT] Device ${deviceId} is OFFLINE (reason: ${messageData.reason || "unknown"}) (total active: ${this.onlineDevices.size})`,
            );
          }

          // Takoj objavi posodobljen occupancy
          this.publishOccupancy();
          break;
        }

        case "connect": {
          // Naprava je poslala metapodatke ob vzpostavitvi povezave
          const platform = messageData.platform || "unknown";
          const appVersion = messageData.appVersion || "unknown";

          this.onlineDevices.set(deviceId, {
            online: true,
            lastSeen: new Date().toISOString(),
            platform,
            appVersion,
          });

          // eslint-disable-next-line no-console
          console.log(
            `[MQTT] Device ${deviceId} CONNECTED (platform: ${platform}, version: ${appVersion})`,
          );

          // Posodobi device v bazi
          try {
            const dbDevice3 = await Device.findOne({ deviceId });
            if (dbDevice3) {
              dbDevice3.isActive = true;
              dbDevice3.lastSeenAtUtc = new Date();
              dbDevice3.updatedAtUtc = new Date();
              if (platform && platform !== "unknown") {
                dbDevice3.platform = platform;
              }
              if (appVersion && appVersion !== "unknown") {
                dbDevice3.appVersion = appVersion;
              }
              await dbDevice3.save();
            }
          } catch (dbErr3) {
            // eslint-disable-next-line no-console
            console.warn(
              `[MQTT] Could not update device ${deviceId}:`,
              dbErr3.message,
            );
          }

          this.publishOccupancy();
          break;
        }

        default:
          // eslint-disable-next-line no-console
          console.warn(`[MQTT] Unknown status type: ${statusType}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[MQTT] Error handling status message:", err.message);
    }
  }

  /**
   * Objavi trenutno število aktivnih naprav na occupancy topic (SCRUM-47).
   */
  publishOccupancy() {
    if (!this.client || !this.isConnected) {
      return;
    }

    const payload = JSON.stringify({
      uniqueDevices: this.onlineDevices.size,
      windowSec: 60,
      timestampUtc: new Date().toISOString(),
    });

    this.client.publish(
      "smart-playgrounds/analytics/playground/anonymous/occupancy",
      payload,
      { qos: 1, retain: true },
      (err) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.warn("[MQTT] Failed to publish occupancy:", err.message);
        }
      },
    );
  }

  /**
   * Zaženi periodično objavljanje occupancy podatkov.
   */
  startOccupancyPublisher() {
    if (this.occupancyTimer) {
      return;
    }

    this.occupancyTimer = setInterval(() => {
      this.publishOccupancy();
    }, this.occupancyIntervalMs);

    // eslint-disable-next-line no-console
    console.log(
      `[MQTT] Occupancy publisher started (interval: ${this.occupancyIntervalMs}ms)`,
    );
  }

  /**
   * Ustavi periodično objavljanje occupancy podatkov.
   */
  stopOccupancyPublisher() {
    if (this.occupancyTimer) {
      clearInterval(this.occupancyTimer);
      this.occupancyTimer = null;
    }
  }

  /**
   * Odstrani naprave, ki niso poslale heartbeata v zadnjih 90 sekundah.
   * Klicano periodično iz index.js.
   */
  expireStaleDevices() {
    const now = Date.now();
    const maxAge = 90_000; // 90 sekund brez heartbeata → offline
    let removed = 0;

    for (const [deviceId, info] of this.onlineDevices.entries()) {
      if (info.lastHeartbeat && now - info.lastHeartbeat.getTime() > maxAge) {
        this.onlineDevices.delete(deviceId);
        removed += 1;

        // eslint-disable-next-line no-console
        console.log(
          `[MQTT] Device ${deviceId} expired (no heartbeat for ${maxAge / 1000}s)`,
        );
      }
    }

    if (removed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[MQTT] Expired ${removed} stale devices (total active: ${this.onlineDevices.size})`,
      );
      this.publishOccupancy();
    }
  }

  /**
   * Očisti deduplikacijski cache.
   */
  cleanDeduplicationCache() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minut

    let cleaned = 0;
    for (const [key, timestamp] of this.deduplicationCache.entries()) {
      if (now - timestamp > maxAge) {
        this.deduplicationCache.delete(key);
        cleaned += 1;
      }
    }

    if (cleaned > 0) {
      // eslint-disable-next-line no-console
      console.log(`[MQTT] Cleaned ${cleaned} old deduplication cache entries`);
    }
  }

  /**
   * Prekini zvezo s MQTT brokerjem.
   */
  async disconnect() {
    return new Promise((resolve) => {
      this.stopOccupancyPublisher();

      if (this.client) {
        this.client.end(() => {
          // eslint-disable-next-line no-console
          console.log("[MQTT] Disconnected");
          this.isConnected = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Vrni status.
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      messageCount: this.messageCount,
      cacheSize: this.deduplicationCache.size,
      activeDevices: this.onlineDevices.size,
      activeDeviceIds: this.activeDeviceIds,
    };
  }
}

module.exports = MqttListener;
