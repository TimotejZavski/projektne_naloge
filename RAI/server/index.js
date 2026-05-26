/**
 * Vstopna tocka RAI backend streznika.
 *
 * Vrstni red:
 *   1. nalozimo env (validacija obveznih spremenljivk)
 *   2. povezava na MongoDB
 *   3. zazenemo Express app
 *   4. graceful shutdown na SIGINT/SIGTERM
 */

const env = require('./src/config/env');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const createApp = require('./src/app');
const MqttListener = require('./src/services/MqttListener');
const DataAggregationScheduler = require('./src/services/DataAggregationScheduler');

let server;
let mqttListener;
let aggregationScheduler;

async function start() {
  try {
    await connectDatabase();
    const app = createApp();

    server = app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] RAI backend posluha na http://localhost:${env.PORT}`);
      console.log(`[server] NODE_ENV=${env.NODE_ENV}`);
    });

    // Zaženi MQTT listener (opcijsko; na Render brez brokerja nastavi MQTT_ENABLED=false)
    const isDefaultLocalBroker =
      env.MQTT_BROKER_URL === "mqtt://localhost:1883";
    const skipMqtt =
      !env.MQTT_ENABLED ||
      (isDefaultLocalBroker &&
        (env.NODE_ENV === "production" || process.env.RENDER));
    if (skipMqtt) {
      if (isDefaultLocalBroker && process.env.RENDER) {
        console.log("[server] MQTT skipped (Render, no MQTT_BROKER_URL set)");
      }
    } else {
      try {
      mqttListener = new MqttListener();
      await mqttListener.connect();
      // eslint-disable-next-line no-console
      console.log('[server] MQTT listener started');

      // Očisti deduplikacijski cache vsake 5 minut
      setInterval(() => {
        mqttListener.cleanDeduplicationCache();
      }, 5 * 60 * 1000);
      } catch (mqttErr) {
        // eslint-disable-next-line no-console
        console.warn(
          "[server] MQTT listener failed to connect:",
          mqttErr.message,
        );
        // Ne prekini servera, samo opozori
      }
    }

    // Zaženi Data Aggregation Scheduler
    try {
      aggregationScheduler = new DataAggregationScheduler();
      await aggregationScheduler.start();
      // eslint-disable-next-line no-console
      console.log('[server] Data aggregation scheduler started');
    } catch (aggErr) {
      // eslint-disable-next-line no-console
      console.warn('[server] Data aggregation scheduler failed to start:', aggErr.message);
      // Ne prekini servera
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Zagon strezniku ni uspel:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n[server] Prejet ${signal}, zaustavitev...`);

  // Zaustavi Data Aggregation Scheduler
  if (aggregationScheduler) {
    try {
      await aggregationScheduler.stop();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[server] Error stopping aggregation scheduler:', err.message);
    }
  }

  // Zaustavi MQTT listener
  if (mqttListener) {
    try {
      await mqttListener.disconnect();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[server] Error disconnecting MQTT:', err.message);
    }
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDatabase();
  // eslint-disable-next-line no-console
  console.log('[server] Cisto zaustavljen.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
  shutdown('unhandledRejection');
});

start();
