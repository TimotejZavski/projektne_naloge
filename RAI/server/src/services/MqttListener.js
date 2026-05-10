/**
 * MQTT Listener za prijem senzorskih podatkov.
 *
 * Naslušnaj topic: `smart-playgrounds/devices/{deviceId}/sensors/{sensorType}`
 * Prejeta sporočila validiraj, očisti in shrani v SensorMeasurement (raw).
 *
 * Naročnik se povežbe s MQTT brokerjem in preslušnava sporočila v realnem času.
 *
 * Uporaba:
 *   const listener = new MqttListener();
 *   await listener.connect();
 *   // V app.js ali index.js
 */

const mqtt = require('mqtt');
const SensorMeasurement = require('../models/SensorMeasurement');
const ProcessedMeasurement = require('../models/ProcessedMeasurement');
const MeasurementValidator = require('./MeasurementValidator');
const env = require('../config/env');

class MqttListener {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.messageCount = 0;
    this.deduplicationCache = new Map(); // { key: timestamp }
  }

  /**
   * Povezavi se s MQTT brokerjem
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const brokerUrl = env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

      // eslint-disable-next-line no-console
      console.log(`[MQTT] Connecting to ${brokerUrl}...`);

      this.client = mqtt.connect(brokerUrl, {
        clientId: `rai-server-${Date.now()}`,
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        // eslint-disable-next-line no-console
        console.log('[MQTT] Connected successfully');
        this.isConnected = true;

        // Naročaj se na vse senzorske podatke
        const topic = 'smart-playgrounds/devices/+/sensors/+';
        this.client.subscribe(topic, (err) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.error(`[MQTT] Subscribe error: ${err}`);
            reject(err);
          } else {
            // eslint-disable-next-line no-console
            console.log(`[MQTT] Subscribed to topic: ${topic}`);
            resolve();
          }
        });
      });

      this.client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      });

      this.client.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('[MQTT] Connection error:', err);
        this.isConnected = false;
        reject(err);
      });

      this.client.on('disconnect', () => {
        // eslint-disable-next-line no-console
        console.log('[MQTT] Disconnected');
        this.isConnected = false;
      });
    });
  }

  /**
   * Obdelaj prejeto MQTT sporočilo
   * @param {string} topic - npr. "smart-playgrounds/devices/phone-123/sensors/gps"
   * @param {Buffer} payload - JSON sporočilo
   */
  async handleMessage(topic, payload) {
    try {
      // Parse topic
      const topicParts = topic.split('/');
      if (topicParts.length !== 5 || topicParts[0] !== 'smart-playgrounds') {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Invalid topic format: ${topic}`);
        return;
      }

      const deviceId = topicParts[2];
      const sensorType = topicParts[4];

      // Parse JSON payload
      let messageData;
      try {
        messageData = JSON.parse(payload.toString());
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.error(`[MQTT] JSON parse error for topic ${topic}:`, parseErr.message);
        return;
      }

      // Pripravi measurement objekt
      const measurement = {
        deviceId,
        sensorType,
        timestampUtc: messageData.timestamp || new Date().toISOString(),
        data: messageData.data || messageData,
      };

      // Validiraj podatke
      const validation = MeasurementValidator.validateMeasurement(measurement);
      if (!validation.isValid) {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Validation failed for ${deviceId}/${sensorType}:`, validation.errors);
        return;
      }

      // Deduplikacija: preveri ali je isti podatek že bil prejet
      const dedupeKey = `${deviceId}:${sensorType}:${validation.cleanedData.timestampUtc.getTime()}`;
      if (this.deduplicationCache.has(dedupeKey)) {
        // eslint-disable-next-line no-console
        console.warn(`[MQTT] Duplicate message ignored: ${dedupeKey}`);
        return;
      }

      // Dodaj v cache (čisti ga vsake 5 minut)
      this.deduplicationCache.set(dedupeKey, Date.now());

      // Shrani RAW meritev v bazo
      const rawMeasurement = new SensorMeasurement({
        deviceId: validation.cleanedData.deviceId,
        sensorType: validation.cleanedData.sensorType,
        timestampUtc: validation.cleanedData.timestampUtc,
        data: validation.cleanedData.data,
        source: 'mqtt',
      });

      await rawMeasurement.save();

      this.messageCount += 1;

      if (this.messageCount % 100 === 0) {
        // eslint-disable-next-line no-console
        console.log(`[MQTT] Processed ${this.messageCount} messages`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MQTT] Error handling message:', err.message);
    }
  }

  /**
   * Očisti deduplikacijski cache (so stari vnosi)
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
   * Prekini zvezo s MQTT brokerjem
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(() => {
          // eslint-disable-next-line no-console
          console.log('[MQTT] Disconnected');
          this.isConnected = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Vrni status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      messageCount: this.messageCount,
      cacheSize: this.deduplicationCache.size,
    };
  }
}

module.exports = MqttListener;
