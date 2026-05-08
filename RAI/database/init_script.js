const mongoose = require('mongoose');

const uri = 'mongodb://localhost:27017';
const databaseName = 'rai';
// README / TODO / TO-DO je to koncna oblika ze? NPO-RAI more bit kompitabilno | kaj pobiramo na napravi == kaj pridobivamo v bazo?
const collections = [
  {
    name: 'users',
    indexes: [
      { fields: { email: 1 }, options: { unique: true, name: 'users_email_unique' } },
    ],
  },
  {
    name: 'devices',
    indexes: [
      { fields: { deviceId: 1 }, options: { unique: true, name: 'devices_deviceId_unique' } },
      { fields: { userId: 1 }, options: { name: 'devices_userId_idx' } },
    ],
  },
  {
    name: 'sensor_measurements',
    indexes: [
      { fields: { deviceId: 1, timestampUtc: 1 }, options: { name: 'sensor_measurements_deviceId_timestampUtc_idx' } },
      { fields: { sensorType: 1, timestampUtc: 1 }, options: { name: 'sensor_measurements_sensorType_timestampUtc_idx' } },
    ],
  },
  {
    name: 'playgrounds',
    indexes: [
      { fields: { location: '2dsphere' }, options: { name: 'playgrounds_location_2dsphere' } },
    ],
  },
  {
    name: 'reservations',
    indexes: [
      { fields: { userId: 1, startsAtUtc: 1 }, options: { name: 'reservations_userId_startsAtUtc_idx' } },
      { fields: { playgroundId: 1, startsAtUtc: 1 }, options: { name: 'reservations_playgroundId_startsAtUtc_idx' } },
    ],
  },
  {
    name: 'weather_logs',
    indexes: [
      { fields: { fetchedAtUtc: 1 }, options: { name: 'weather_logs_fetchedAtUtc_idx' } },
    ],
  },
  {
    name: 'analytics',
    indexes: [
      { fields: { type: 1, periodStartUtc: 1 }, options: { name: 'analytics_type_periodStartUtc_idx' } },
    ],
  },
];

async function main() {
  try {
    await mongoose.connect(`${uri}/${databaseName}`);

    const db = mongoose.connection.db;

    for (const collectionDef of collections) {
      const existingCollections = await db.listCollections({ name: collectionDef.name }).toArray();

      if (existingCollections.length === 0) {
        await db.createCollection(collectionDef.name);
      }

      for (const indexDef of collectionDef.indexes) {
        await db.collection(collectionDef.name).createIndex(indexDef.fields, indexDef.options);
      }
    }

    console.log(`Initialized empty database "${databaseName}" with agreed collections and indexes.`);
    console.log('No seed data was inserted.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to initialize database structure:', error);
  process.exitCode = 1;
});