/**
 * DEMO seed za SCRUM-49 vizualizacijo aktivnosti.
 *
 * Ustvari napravo 'demo-court-01' in 24h pospeškometer podatkov z RAZLICNIMI
 * fazami aktivnosti (noc = mirovanje, dan = rahlo, popoldne = aktivno), nato
 * backfilla 5-min ProcessedMeasurement agregate prek iste detekcijske logike
 * (DataAggregationService.aggregateAccelerometer), da graf prikaze prehode
 * idle -> light -> active.
 *
 *   node scripts/seed-activity-demo.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const ProcessedMeasurement = require('../src/models/ProcessedMeasurement');
const DataAggregationService = require('../src/services/DataAggregationService');

const DEVICE_ID = 'demo-court-01';
const BUCKET_MS = 5 * 60 * 1000;
const SAMPLES_PER_BUCKET = 12;

function targetActivity(tMs) {
  const d = new Date(tMs);
  const hod = d.getHours() + d.getMinutes() / 60;
  if (hod < 7 || hod > 21.5) return 0.05;             // noc -> mirovanje
  if (hod < 9) return 0.4 + Math.random() * 0.3;       // jutro -> rahlo
  if (hod < 16) return 0.6 + Math.random() * 1.2;      // dan -> meso
  if (hod < 20) return 2.6 + Math.random() * 1.6;      // popoldne -> aktivno
  return 0.5 + Math.random() * 0.5;                    // vecer -> rahlo
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Manjka MONGODB_URI v .env');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({}, { sort: { createdAtUtc: -1 } });
  if (!user) throw new Error('V bazi ni uporabnika — najprej registracija.');
  const userId = user._id;
  console.log(`  user: ${user.email}`);

  await db.collection('devices').updateOne(
    { deviceId: DEVICE_ID },
    {
      $set: { userId, name: 'Demo igrišče (senzor)', platform: 'sensor', isActive: true, lastSeenAtUtc: new Date(), updatedAtUtc: new Date() },
      $setOnInsert: { deviceId: DEVICE_ID, appVersion: '1.0.0', createdAtUtc: new Date() },
    },
    { upsert: true }
  );

  await db.collection('sensor_measurements').deleteMany({ deviceId: DEVICE_ID });
  await ProcessedMeasurement.deleteMany({ deviceId: DEVICE_ID });

  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const nBuckets = Math.floor((now - start) / BUCKET_MS);

  const rawDocs = [];
  const processedDocs = [];
  const dist = { idle: 0, light: 0, active: 0 };

  for (let i = 0; i < nBuckets; i++) {
    const bStart = new Date(start + i * BUCKET_MS);
    const bEnd = new Date(start + (i + 1) * BUCKET_MS);
    const amp = targetActivity(bStart.getTime());

    const bucket = [];
    for (let s = 0; s < SAMPLES_PER_BUCKET; s++) {
      const ts = new Date(bStart.getTime() + (s * BUCKET_MS) / SAMPLES_PER_BUCKET);
      const osc = Math.sin(2 * Math.PI * 4 * (s / SAMPLES_PER_BUCKET)) * amp;
      const doc = {
        deviceId: DEVICE_ID, userId, sensorType: 'accelerometer', timestampUtc: ts,
        data: {
          x: +(((Math.random() - 0.5) * amp * 0.6)).toFixed(4),
          y: +(((Math.random() - 0.5) * amp * 0.6)).toFixed(4),
          z: +((9.81 + osc + (Math.random() - 0.5) * 0.05)).toFixed(4),
          unit: 'm/s2',
        },
        source: 'http', schemaVersion: '1.0', receivedAtUtc: ts,
      };
      rawDocs.push(doc);
      bucket.push(doc);
    }

    const agg = DataAggregationService.aggregateAccelerometer(bucket);
    dist[agg.detectionStatus] = (dist[agg.detectionStatus] || 0) + 1;
    processedDocs.push({
      deviceId: DEVICE_ID, userId, sensorType: 'accelerometer', aggregationType: '5min',
      periodStartUtc: bStart, periodEndUtc: bEnd, aggregatedData: agg,
      sampleCount: bucket.length, rawMeasurementIds: [], schemaVersion: '1.0', processedAtUtc: new Date(),
    });
  }

  await db.collection('sensor_measurements').insertMany(rawDocs, { ordered: false });
  await ProcessedMeasurement.insertMany(processedDocs, { ordered: false });

  console.log(`  device: ${DEVICE_ID}`);
  console.log(`  raw accel: ${rawDocs.length} | processed 5min: ${processedDocs.length}`);
  console.log(`  status distribution:`, dist);
  await mongoose.disconnect();
  console.log('  done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
