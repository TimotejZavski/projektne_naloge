/**
 * Napolni bazo z GPS + pospeškometer meritvami za obstoječo napravo.
 *
 * Uporaba:
 *   node scripts/seed-device-data.js
 *   node scripts/seed-device-data.js --deviceId=iphone-17-pro
 *   node scripts/seed-device-data.js --deviceId=iphone-17-pro --email=test123123@example.com
 *
 * Če naprava ne obstaja, jo ustvari in poveže z uporabnikom (--email ali prvi user v bazi).
 * Ob ponovnem zagonu izbriše stare meritve za to napravo in vnese sveže (zadnjih 24 ur).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const DEFAULT_DEVICE_ID = 'iphone-17-pro';

const GPS_ROUTE = [
  [46.0511, 14.5063],
  [46.0515, 14.5068],
  [46.052, 14.5074],
  [46.0526, 14.5077],
  [46.0532, 14.5081],
  [46.0538, 14.5086],
  [46.0544, 14.5083],
  [46.0548, 14.5078],
  [46.0552, 14.5072],
  [46.0556, 14.5064],
  [46.056, 14.5052],
  [46.0561, 14.504],
  [46.0559, 14.5026],
  [46.0555, 14.5018],
  [46.055, 14.5012],
  [46.0544, 14.5008],
  [46.0538, 14.501],
  [46.0532, 14.5015],
  [46.0526, 14.5022],
  [46.052, 14.503],
  [46.0515, 14.504],
  [46.051, 14.5052],
];

function parseArgs(argv) {
  const args = { deviceId: DEFAULT_DEVICE_ID, email: null };
  for (const arg of argv) {
    if (arg.startsWith('--deviceId=')) args.deviceId = arg.slice('--deviceId='.length);
    if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
  }
  return args;
}

function randomAround(value, spread) {
  return value + (Math.random() - 0.5) * spread;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stepTimestamps(start, end, steps) {
  const interval = (end.getTime() - start.getTime()) / Math.max(steps - 1, 1);
  return Array.from({ length: steps }, (_, i) => new Date(start.getTime() + i * interval));
}

function generateGpsMeasurements(deviceId, userId, routeCoords, startTime, endTime) {
  const steps = routeCoords.length;
  const timestamps = stepTimestamps(startTime, endTime, steps);

  return routeCoords.map(([baseLat, baseLng], i) => ({
    deviceId,
    userId,
    sensorType: 'gps',
    timestampUtc: timestamps[i],
    data: {
      latitude: parseFloat(randomAround(baseLat, 0.00008).toFixed(6)),
      longitude: parseFloat(randomAround(baseLng, 0.00008).toFixed(6)),
      accuracyMeters: randomInt(3, 12),
    },
    source: 'http',
    schemaVersion: '1.0',
    receivedAtUtc: new Date(timestamps[i].getTime() + 100),
  }));
}

function generateAccelerometerMeasurements(deviceId, userId, startTime, endTime) {
  const totalSeconds = Math.max(1, (endTime.getTime() - startTime.getTime()) / 1000);
  const samples = Math.min(Math.floor(totalSeconds * 10), 600);
  const timestamps = stepTimestamps(startTime, endTime, samples);

  return timestamps.map((timestampUtc, i) => {
    const t = i / 10;
    const walkCycle = Math.sin(2 * Math.PI * 1.6 * t);
    return {
      deviceId,
      userId,
      sensorType: 'accelerometer',
      timestampUtc,
      data: {
        x: parseFloat((walkCycle * 0.25 + (Math.random() - 0.5) * 0.08).toFixed(4)),
        y: parseFloat((walkCycle * 0.12 + (Math.random() - 0.5) * 0.08).toFixed(4)),
        z: parseFloat((9.81 + walkCycle * 0.6 + (Math.random() - 0.5) * 0.12).toFixed(4)),
        unit: 'm/s2',
      },
      source: 'http',
      schemaVersion: '1.0',
      receivedAtUtc: new Date(timestampUtc.getTime() + 50),
    };
  });
}

async function resolveUserId(usersCol, email) {
  if (email) {
    const user = await usersCol.findOne({ email: email.toLowerCase().trim() });
    if (!user) throw new Error(`Uporabnik ${email} ne obstaja.`);
    return user._id;
  }

  const user = await usersCol.findOne({}, { sort: { createdAtUtc: -1 } });
  if (!user) throw new Error('V bazi ni nobenega uporabnika. Najprej se registriraj v MAUI aplikaciji.');
  return user._id;
}

async function main() {
  const { deviceId, email } = parseArgs(process.argv.slice(2));
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (!process.env.MONGODB_URI) {
    throw new Error('Manjka MONGODB_URI v .env');
  }

  console.log(`\n🌱 Polnjenje meritev za napravo: ${deviceId}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const devicesCol = db.collection('devices');
  const measurementsCol = db.collection('sensor_measurements');

  const userId = await resolveUserId(usersCol, email);
  const user = await usersCol.findOne({ _id: userId });
  console.log(`  ✓ Uporabnik: ${user.email}`);

  let device = await devicesCol.findOne({ deviceId });
  if (!device) {
    const doc = {
      deviceId,
      userId,
      name: 'iPhone 17 Pro',
      platform: 'ios',
      appVersion: '1.0.0',
      isActive: true,
      lastSeenAtUtc: now,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    await devicesCol.insertOne(doc);
    device = doc;
    console.log(`  ✓ Ustvarjena naprava: ${deviceId}`);
  } else if (String(device.userId) !== String(userId)) {
    throw new Error(
      `Naprava ${deviceId} pripada drugemu uporabniku. Podaj --email= z ustreznim računom.`
    );
  } else {
    await devicesCol.updateOne(
      { deviceId },
      { $set: { lastSeenAtUtc: now, updatedAtUtc: now, isActive: true } }
    );
    console.log(`  ✓ Obstoječa naprava: ${deviceId}`);
  }

  const deleted = await measurementsCol.deleteMany({ deviceId });
  console.log(`  ✓ Počiščeno starih meritev: ${deleted.deletedCount}`);

  const gpsStart = new Date(now.getTime() - 90 * 60 * 1000);
  const gpsMeasurements = generateGpsMeasurements(deviceId, userId, GPS_ROUTE, gpsStart, now);

  const accelBatches = [];
  for (let i = 0; i < 12; i += 1) {
    const batchStart = new Date(dayAgo.getTime() + i * 2 * 60 * 60 * 1000);
    const batchEnd = new Date(batchStart.getTime() + 30 * 1000);
    if (batchEnd > now) break;
    accelBatches.push(...generateAccelerometerMeasurements(deviceId, userId, batchStart, batchEnd));
  }

  const allMeasurements = [...gpsMeasurements, ...accelBatches];
  if (allMeasurements.length > 0) {
    await measurementsCol.insertMany(allMeasurements, { ordered: false });
  }

  console.log(`  ✓ GPS meritev: ${gpsMeasurements.length}`);
  console.log(`  ✓ Pospeškometer meritev: ${accelBatches.length}`);
  console.log(`\n✅ Koncano. Osveži dashboard in izberi napravo "${deviceId}".\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Napaka:', err.message || err);
  process.exit(1);
});
