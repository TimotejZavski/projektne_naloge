/**
 * seed-database.js — napolni bazo z realističnimi testnimi podatki (SCRUM-41).
 *
 * Generira:
 *   - 1 uporabnika: demo@example.com / geslo123
 *   - 2 napravi:  phone-demo-pixel (Android), phone-demo-iphone (iOS)
 *   - ~120 GPS meritev za Pixel (simulirana hoja po Ljubljani, zadnji 2 uri)
 *   - ~40 GPS meritev za iPhone (krajsa pot)
 *   - ~300 akcelerometer meritev za Pixel (10 Hz batch-i, simulirana hoja)
 *
 * Uporaba:
 *   cd RAI/scripts
 *   node seed-database.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ======================== KONFIGURACIJA ============================

const NOW = new Date();
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

const DEMO_USER = {
  email: 'demo@example.com',
  displayName: 'Demo Uporabnik',
  password: 'geslo123',
  role: 'user',
};

const DEMO_DEVICES = [
  { deviceId: 'phone-demo-pixel', name: 'Demo Pixel 8', platform: 'android', appVersion: '2.1.0' },
  { deviceId: 'phone-demo-iphone', name: 'Demo iPhone 15', platform: 'ios', appVersion: '1.5.2' },
];

// Ljubljana center: sprehod po poti Tromostovje → Kongresni trg → Tivoli
const GPS_ROUTE_PIXEL = [
  [46.0511, 14.5063], [46.0512, 14.5065], [46.0513, 14.5067], [46.0515, 14.5069],
  [46.0517, 14.5071], [46.0519, 14.5072], [46.0520, 14.5074], [46.0522, 14.5075],
  [46.0524, 14.5076], [46.0526, 14.5077], [46.0528, 14.5078], [46.0529, 14.5079],
  [46.0531, 14.5080], [46.0532, 14.5081], [46.0533, 14.5082], [46.0534, 14.5083],
  [46.0535, 14.5084], [46.0536, 14.5085], [46.0537, 14.5085], [46.0538, 14.5086],
  [46.0539, 14.5086], [46.0540, 14.5087], [46.0541, 14.5087], [46.0542, 14.5086],
  [46.0542, 14.5085], [46.0543, 14.5084], [46.0544, 14.5083], [46.0545, 14.5082],
  [46.0546, 14.5081], [46.0546, 14.5080], [46.0547, 14.5079], [46.0548, 14.5078],
  [46.0549, 14.5076], [46.0550, 14.5075], [46.0551, 14.5073], [46.0552, 14.5072],
  [46.0553, 14.5070], [46.0554, 14.5068], [46.0555, 14.5066], [46.0556, 14.5064],
  [46.0557, 14.5062], [46.0557, 14.5060], [46.0558, 14.5058], [46.0559, 14.5056],
  [46.0559, 14.5054], [46.0560, 14.5052], [46.0560, 14.5050], [46.0560, 14.5048],
  [46.0561, 14.5046], [46.0561, 14.5044], [46.0561, 14.5042], [46.0561, 14.5040],
  [46.0561, 14.5038], [46.0561, 14.5036], [46.0561, 14.5034], [46.0561, 14.5032],
  [46.0560, 14.5030], [46.0560, 14.5028], [46.0559, 14.5026], [46.0558, 14.5025],
];

const GPS_ROUTE_IPHONE = [
  [46.0505, 14.5050], [46.0507, 14.5052], [46.0509, 14.5054], [46.0511, 14.5056],
  [46.0513, 14.5058], [46.0515, 14.5060], [46.0517, 14.5062], [46.0519, 14.5063],
  [46.0521, 14.5065], [46.0523, 14.5066], [46.0525, 14.5067], [46.0527, 14.5067],
  [46.0529, 14.5068], [46.0531, 14.5068], [46.0533, 14.5069], [46.0535, 14.5069],
  [46.0537, 14.5068], [46.0539, 14.5067], [46.0541, 14.5066], [46.0543, 14.5065],
];

// ======================== POMOZNE FUNKCIJE ==========================

function randomAround(value, spread) {
  return value + (Math.random() - 0.5) * spread;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stepTimestamps(start, end, steps) {
  const interval = (end.getTime() - start.getTime()) / (steps - 1);
  return Array.from({ length: steps }, (_, i) => new Date(start.getTime() + i * interval));
}

// ======================== GENERATORJI PODATKOV ======================

function generateGpsMeasurements(deviceId, userId, routeCoords, startTime, endTime) {
  const steps = routeCoords.length;
  const timestamps = stepTimestamps(startTime, endTime, steps);
  const measurements = [];

  for (let i = 0; i < steps; i++) {
    const [baseLat, baseLng] = routeCoords[i];
    measurements.push({
      deviceId,
      userId,
      sensorType: 'gps',
      timestampUtc: timestamps[i],
      data: {
        latitude: parseFloat(randomAround(baseLat, 0.00008).toFixed(6)),
        longitude: parseFloat(randomAround(baseLng, 0.00008).toFixed(6)),
        accuracyMeters: randomInt(3, 15),
      },
      source: 'http',
      schemaVersion: '1.0',
      receivedAtUtc: new Date(timestamps[i].getTime() + 100),
    });
  }

  return measurements;
}

function generateAccelerometerMeasurements(deviceId, userId, startTime, endTime, activity) {
  const totalSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
  const samples = Math.floor(totalSeconds * 10); // 10 Hz
  const timestamps = stepTimestamps(startTime, endTime, samples);
  const measurements = [];

  // Simulate patterns: ~9.81 m/s² gravity on Z, ±1 m/s² walking, ±3 m/s² running
  const amplitude = activity === 'walking' ? 1.0 : 2.5;
  const frequency = activity === 'walking' ? 1.5 : 2.8;

  for (let i = 0; i < samples; i++) {
    const t = i / 10; // seconds
    const walkCycle = Math.sin(2 * Math.PI * frequency * t);

    measurements.push({
      deviceId,
      userId,
      sensorType: 'accelerometer',
      timestampUtc: timestamps[i],
      data: {
        x: parseFloat((walkCycle * amplitude * 0.3 + (Math.random() - 0.5) * 0.1).toFixed(4)),
        y: parseFloat((walkCycle * amplitude * 0.15 + (Math.random() - 0.5) * 0.1).toFixed(4)),
        z: parseFloat((9.81 + walkCycle * amplitude * 0.7 + (Math.random() - 0.5) * 0.15).toFixed(4)),
        unit: 'm/s2',
      },
      source: 'http',
      schemaVersion: '1.0',
      receivedAtUtc: new Date(timestamps[i].getTime() + 50),
    });
  }

  return measurements;
}

// ======================== MAIN ======================================

async function main() {
  console.log('\n🌱 Polnjenje baze z realisticnimi testnimi podatki...\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // --- 1. Ustvari uporabnika ---
  const usersCol = db.collection('users');
  const passwordHash = await bcrypt.hash(DEMO_USER.password, 12);
  const userDoc = {
    email: DEMO_USER.email,
    displayName: DEMO_USER.displayName,
    passwordHash,
    role: DEMO_USER.role,
    isActive: true,
    createdAtUtc: TWO_HOURS_AGO,
    updatedAtUtc: TWO_HOURS_AGO,
  };
  const { insertedId: userId } = await usersCol.insertOne(userDoc);
  console.log(`  ✓ Uporabnik: ${DEMO_USER.email} (geslo: ${DEMO_USER.password})`);

  // --- 2. Ustvari naprave ---
  const devicesCol = db.collection('devices');
  const deviceIds = {};
  for (const d of DEMO_DEVICES) {
    const now = new Date();
    const doc = {
      deviceId: d.deviceId,
      userId,
      name: d.name,
      platform: d.platform,
      appVersion: d.appVersion,
      isActive: true,
      lastSeenAtUtc: now,
      createdAtUtc: TWO_HOURS_AGO,
      updatedAtUtc: now,
    };
    await devicesCol.insertOne(doc);
    deviceIds[d.deviceId] = d;
    console.log(`  ✓ Naprava: ${d.deviceId} (${d.name}, ${d.platform})`);
  }

  // --- 3. Generiraj GPS meritve ---
  const measurementsCol = db.collection('sensor_measurements');
  let totalMeasurements = 0;

  // Pixel: GPS hoja
  const pixelGpsStart = new Date(NOW.getTime() - 115 * 60 * 1000); // ~2 uri nazaj
  const gpsPixel = generateGpsMeasurements('phone-demo-pixel', userId, GPS_ROUTE_PIXEL, pixelGpsStart, NOW);
  if (gpsPixel.length > 0) {
    await measurementsCol.insertMany(gpsPixel);
    totalMeasurements += gpsPixel.length;
  }
  console.log(`  ✓ GPS meritve (Pixel): ${gpsPixel.length}`);

  // iPhone: GPS hoja
  const iphoneGpsStart = new Date(NOW.getTime() - 45 * 60 * 1000);
  const gpsIphone = generateGpsMeasurements('phone-demo-iphone', userId, GPS_ROUTE_IPHONE, iphoneGpsStart, new Date(NOW.getTime() - 5 * 60 * 1000));
  if (gpsIphone.length > 0) {
    await measurementsCol.insertMany(gpsIphone);
    totalMeasurements += gpsIphone.length;
  }
  console.log(`  ✓ GPS meritve (iPhone): ${gpsIphone.length}`);

  // --- 4. Generiraj pospeškometer meritve ---
  // Pixel: 20-sekundni batch-i hoje, razporejeni čez zadnji 2 uri
  const batchCount = 15;
  for (let i = 0; i < batchCount; i++) {
    const batchStart = new Date(pixelGpsStart.getTime() + i * 8 * 60 * 1000);
    const batchEnd = new Date(batchStart.getTime() + 20 * 1000); // 20s batch
    if (batchEnd > NOW) break;
    const accelBatch = generateAccelerometerMeasurements(
      'phone-demo-pixel', userId, batchStart, batchEnd, 'walking'
    );
    if (accelBatch.length > 0) {
      await measurementsCol.insertMany(accelBatch);
      totalMeasurements += accelBatch.length;
    }
  }
  console.log(`  ✓ Pospeškometer meritve (Pixel): ~${batchCount}×20s batch-i hoje`);

  // iPhone: kratek batch teka
  const runStart = new Date(NOW.getTime() - 30 * 60 * 1000);
  const runEnd = new Date(runStart.getTime() + 10 * 1000);
  const accelRun = generateAccelerometerMeasurements(
    'phone-demo-iphone', userId, runStart, runEnd, 'running'
  );
  if (accelRun.length > 0) {
    await measurementsCol.insertMany(accelRun);
    totalMeasurements += accelRun.length;
  }
  console.log(`  ✓ Pospeškometer meritve (iPhone): kratek batch teka`);

  console.log(`\n✅ Koncano!`);
  console.log(`   Uporabnik:  ${DEMO_USER.email} / ${DEMO_USER.password}`);
  console.log(`   Naprave:    2`);
  console.log(`   Meritve:    ${totalMeasurements} (GPS + pospeškometer)\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Napaka:', err);
  process.exit(1);
});
