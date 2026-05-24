/**
 * clear-database.js — izbrise VSE dokumente iz vseh kolekcij (SCRUM-41).
 *
 * Uporaba:
 *   cd RAI/scripts
 *   node clear-database.js
 *
 * Varno: vprasa za potrditev preden izbrise.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const mongoose = require('mongoose');

const ALL_COLLECTIONS = [
  'users',
  'devices',
  'sensor_measurements',
  'sessions',
  'processed_measurements',
  'traffic_counter_measurements',
  'playgrounds',
  'reservations',
  'weather_logs',
  'analytics',
];

async function main() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n⚠️  POZOR: Ta skripta bo izbrisala VSE podatke iz baze.\n');
  console.log(`   Zbirke: ${ALL_COLLECTIONS.join(', ')}`);
  console.log(`   URI:    ${(process.env.MONGODB_URI || '').replace(/\/\/.*@/, '//***@')}\n`);

  const answer = await new Promise((resolve) => {
    readline.question('   Vpisi "DA" za potrditev: ', resolve);
  });
  readline.close();

  if (answer.trim() !== 'DA') {
    console.log('   Preklicano.\n');
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('\n📦 Brisanje...\n');

  let totalDeleted = 0;
  for (const name of ALL_COLLECTIONS) {
    try {
      const result = await db.collection(name).deleteMany({});
      const count = result.deletedCount || 0;
      totalDeleted += count;
      console.log(`  ✓ ${name}: ${count} dokumentov izbrisanih`);
    } catch {
      // kolekcija morda ne obstaja
      console.log(`  - ${name}: ne obstaja (preskoceno)`);
    }
  }

  console.log(`\n✅ Koncano. Skupaj izbrisanih: ${totalDeleted} dokumentov.\n`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Napaka:', err);
  process.exit(1);
});
