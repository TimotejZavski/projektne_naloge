/**
 * MongoDB inicializacijska skripta za projekt Smart Playgrounds
 * Ustvari vse kolekcije in indekse po ER modelu (SCRUM-7, Azur)
 * 
 * Uporaba:
 *   node init_script.js
 * 
 * Skripta je idempotentna — varen ponovni zagon
 */

const mongoose = require('mongoose');

const uri = 'mongodb://localhost:27017';
const databaseName = 'rai';

const collections = [
  {
    name: 'users',
    description: 'Uporabniski racuni (spletna in mobilna aplikacija)',
    indexes: [
      { fields: { email: 1 }, options: { unique: true, name: 'users_email_unique' } },
    ],
  },
  {
    name: 'devices',
    description: 'Naprave, ki posiljajo senzorske podatke (iz mobilne aplikacije)',
    indexes: [
      { fields: { deviceId: 1 }, options: { unique: true, name: 'devices_deviceId_unique' } },
      { fields: { userId: 1 }, options: { name: 'devices_userId_idx' } },
    ],
  },
  {
    name: 'sensor_measurements',
    description: 'Surove meritve iz senzorjev (GPS, pospeškomer) - direct iz mobilne aplikacije prek MQTT',
    indexes: [
      { fields: { deviceId: 1, timestampUtc: 1 }, options: { name: 'sensor_measurements_deviceId_timestampUtc_idx' } },
      { fields: { sensorType: 1, timestampUtc: 1 }, options: { name: 'sensor_measurements_sensorType_timestampUtc_idx' } },
    ],
  },
  {
    name: 'playgrounds',
    description: 'Javna igrisca in njihove lokacije (za prikaz na zemljevidu)',
    indexes: [
      { fields: { location: '2dsphere' }, options: { name: 'playgrounds_location_2dsphere' } },
    ],
  },
  {
    name: 'reservations',
    description: 'Rezervacije igrisc po uporabnikih',
    indexes: [
      { fields: { userId: 1, startsAtUtc: 1 }, options: { name: 'reservations_userId_startsAtUtc_idx' } },
      { fields: { playgroundId: 1, startsAtUtc: 1 }, options: { name: 'reservations_playgroundId_startsAtUtc_idx' } },
    ],
  },
  {
    name: 'weather_logs',
    description: 'Vremenski podatki iz zunanjih API virov (sur, s TTL za avtomatsko brisanje)',
    indexes: [
      { fields: { fetchedAtUtc: 1 }, options: { name: 'weather_logs_fetchedAtUtc_idx' } },
    ],
  },
  {
    name: 'analytics',
    description: 'Obdelani podatki za vizualizacijo (agregati, popularnost igrisc, statistika)',
    indexes: [
      { fields: { type: 1, periodStartUtc: 1 }, options: { name: 'analytics_type_periodStartUtc_idx' } },
    ],
  },
];

async function main() {
  try {
    console.log(`\n📦 Inicializacija MongoDB baze "${databaseName}"...\n`);
    
    await mongoose.connect(`${uri}/${databaseName}`);
    const db = mongoose.connection.db;

    for (const collectionDef of collections) {
      // Preverimo ali kolekcija ze obstaja
      const existingCollections = await db.listCollections({ name: collectionDef.name }).toArray();

      if (existingCollections.length === 0) {
        await db.createCollection(collectionDef.name);
        console.log(`  ✓ Ustvarjena kolekcija: ${collectionDef.name}`);
      } else {
        console.log(`  ℹ Kolekcija ze obstaja: ${collectionDef.name}`);
      }

      // Ustvarimo indekse
      for (const indexDef of collectionDef.indexes) {
        await db.collection(collectionDef.name).createIndex(indexDef.fields, indexDef.options);
        const indexName = indexDef.options.name || JSON.stringify(indexDef.fields);
        console.log(`    → Indeks: ${indexName}`);
      }
    }

    console.log(`\n✅ Baza je uspesno inicializirana!`);
    console.log(`   Kolekcije: ${collections.length}`);
    console.log(`   Status: PRAZNA (brez seed podatkov)\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to initialize database structure:', error);
  process.exitCode = 1;
});