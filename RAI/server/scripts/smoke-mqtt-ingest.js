/**
 * Smoke test za MQTT ingestijo + raw measurements.
 *
 * Pošilja MQTT sporočila in preveri ali se shranijo v bazo.
 *
 * Predpogoji:
 *   1. Mosquitto MQTT broker na mqtt://localhost:1883
 *   2. RAI server na http://localhost:5000
 *   3. MongoDB na localhost (ali po .env)
 *
 * Uporaba:
 *   node smoke-mqtt-ingest.js
 */

const mqtt = require('mqtt');
const http = require('http');

const BASE = 'http://localhost:5000';
const MQTT_URL = 'mqtt://localhost:1883';

let pass = 0;
let fail = 0;
const failures = [];

function httpReq(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = buf ? JSON.parse(buf) : null;
        } catch {
          json = buf;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(c, m) {
  if (c) {
    console.log(`  ✓ ${m}`);
    pass += 1;
  } else {
    console.error(`  ❌ FAIL: ${m}`);
    fail += 1;
    failures.push(m);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const deviceId = `mqtt-test-device-${Date.now()}`;
  let accessToken = '';

  console.log('\n=== MQTT Ingestion + Raw Measurements Test ===\n');

  // 1. Registracija uporabnika
  console.log('1. Registering user...');
  const regRes = await httpReq('POST', '/api/auth/register', {
    body: {
      email: `mqtt-test-${Date.now()}@example.test`,
      password: 'StrongP@ss123',
      displayName: 'MQTT Tester',
    },
  });
  check(regRes.status === 201, `User registration: ${regRes.status}`);
  accessToken = regRes.body.accessToken;

  // 2. Registracija naprave
  console.log('\n2. Registering device...');
  const devRes = await httpReq('POST', '/api/devices', {
    body: {
      deviceId,
      name: 'Test MQTT Device',
      platform: 'android',
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(devRes.status === 201, `Device registration: ${devRes.status}`);

  // 3. MQTT povezave in pošiljanje sporočil
  console.log('\n3. Connecting to MQTT broker...');
  const mqttClient = mqtt.connect(MQTT_URL, {
    clientId: `test-publisher-${Date.now()}`,
  });

  let mqttConnected = false;
  await new Promise((resolve) => {
    mqttClient.on('connect', () => {
      console.log('  ✓ MQTT connected');
      mqttConnected = true;
      resolve();
    });
    mqttClient.on('error', (err) => {
      console.error(`  ❌ MQTT error: ${err.message}`);
      resolve();
    });
  });

  if (!mqttConnected) {
    console.error('\n❌ Could not connect to MQTT broker. Make sure Mosquitto is running.');
    process.exit(1);
  }

  // 4. Pošiljaš GPS sporočila
  console.log('\n4. Publishing GPS measurements via MQTT...');
  const gpsMessages = [
    { latitude: 46.123456, longitude: 14.987654, accuracyMeters: 5 },
    { latitude: 46.123500, longitude: 14.987700, accuracyMeters: 6 },
    { latitude: 46.123550, longitude: 14.987750, accuracyMeters: 7 },
  ];

  for (let i = 0; i < gpsMessages.length; i += 1) {
    const topic = `smart-playgrounds/devices/${deviceId}/sensors/gps`;
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      data: gpsMessages[i],
    });
    mqttClient.publish(topic, payload);
    console.log(`  → Published GPS #${i + 1}`);
    await sleep(100); // Majhna delay med sporočili
  }

  // 5. Pošiljaš accelerometer sporočila
  console.log('\n5. Publishing accelerometer measurements via MQTT...');
  const accelMessages = [
    { x: 0.5, y: 0.3, z: 9.8 },
    { x: 0.6, y: 0.4, z: 9.9 },
    { x: 0.7, y: 0.5, z: 10.0 },
  ];

  for (let i = 0; i < accelMessages.length; i += 1) {
    const topic = `smart-playgrounds/devices/${deviceId}/sensors/accelerometer`;
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      data: accelMessages[i],
    });
    mqttClient.publish(topic, payload);
    console.log(`  → Published accel #${i + 1}`);
    await sleep(100);
  }

  mqttClient.end();
  console.log('\n  ✓ MQTT disconnected');

  // 6. Čakaj da se podatki shranijo
  console.log('\n6. Waiting for data ingestion (3s)...');
  await sleep(3000);

  // 7. Branje raw measurements
  console.log('\n7. Reading raw measurements from API...');
  const rawRes = await httpReq('GET', `/api/measurements?limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(rawRes.status === 200, `Raw measurements read: ${rawRes.status}`);
  const measurementCount = rawRes.body.measurements ? rawRes.body.measurements.length : 0;
  check(measurementCount >= 6, `Raw measurements count: ${measurementCount} >= 6`);

  // 8. Preveri GPS podatke
  if (rawRes.body.measurements) {
    const gpsData = rawRes.body.measurements.filter((m) => m.sensorType === 'gps');
    check(gpsData.length >= 3, `GPS measurements found: ${gpsData.length} >= 3`);
    if (gpsData.length > 0) {
      const firstGPS = gpsData[0];
      check(
        firstGPS.data.latitude && firstGPS.data.longitude,
        'GPS data has latitude and longitude'
      );
    }
  }

  // 9. Preveri accelerometer podatke
  if (rawRes.body.measurements) {
    const accelData = rawRes.body.measurements.filter((m) => m.sensorType === 'accelerometer');
    check(accelData.length >= 3, `Accelerometer measurements found: ${accelData.length} >= 3`);
    if (accelData.length > 0) {
      const firstAccel = accelData[0];
      check(firstAccel.data.x !== undefined && firstAccel.data.y !== undefined && firstAccel.data.z !== undefined, 'Accelerometer data has x, y, z');
    }
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
