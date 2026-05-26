/**
 * Seed skripta — scrape-a igrišča iz maribor.si in jih shrani:
 *   1. V MongoDB (remote, prek MONGODB_URI iz .env)
 *   2. V JSON datoteko kot backup (data/playgrounds.json)
 *
 * Uporaba:
 *   cd RAI/server
 *   node scripts/seed-playgrounds.js
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { scrapePlaygrounds } = require('../src/scraper/PlaygroundScraper');
const Playground = require('../src/models/Playground');

const MONGODB_URI = process.env.MONGODB_URI;
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'playgrounds.json');

if (!MONGODB_URI) {
  console.error('[FATAL] MONGODB_URI ni nastavljen v .env datoteki.');
  process.exit(1);
}

async function main() {
  console.log('[seed] Povezovanje z MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[seed] Povezan.');

  console.log('[seed] Začenjam scrape...');
  const result = await scrapePlaygrounds();

  console.log(`[seed] Scrape-anih: ${result.playgrounds.length}`);
  console.log(`[seed] Z lokacijo: ${result.withLocation.length}`);

  // 1. Shrani v MongoDB (upsert)
  let inserted = 0;
  let updated = 0;
  const skipped = [];

  for (const pg of result.playgrounds) {
    if (!pg.location) {
      skipped.push({ name: pg.name, reason: 'geocoding_failed' });
      continue;
    }

    try {
      const existing = await Playground.findOne({
        sourceId: 'maribor-si-igrisca',
        name: pg.name,
      });

      if (existing) {
        await Playground.updateOne(
          { _id: existing._id },
          {
            $set: {
              address: pg.address,
              location: pg.location,
              scrapedAt: new Date(),
            },
          }
        );
        updated++;
      } else {
        await Playground.create({
          sourceId: 'maribor-si-igrisca',
          name: pg.name,
          address: pg.address,
          location: pg.location,
          sourceUrl: 'https://maribor.si/mestni-servis/otroci/javna-igrisca/',
          scrapedAt: new Date(),
        });
        inserted++;
      }
    } catch (err) {
      skipped.push({ name: pg.name, reason: err.message });
    }
  }

  console.log(`[seed] MongoDB: ${inserted} novih, ${updated} posodobljenih, ${skipped.length} preskočenih`);

  if (skipped.length > 0) {
    console.log('[seed] Preskočeni (brez lokacije):');
    skipped.forEach((s) => console.log(`  - ${s.name}: ${s.reason}`));
  }

  // 2. Izvozi v JSON
  const exported = result.playgrounds.map((pg) => ({
    name: pg.name,
    address: pg.address,
    latitude: pg.location?.latitude ?? null,
    longitude: pg.location?.longitude ?? null,
    geocoded: pg.location !== null,
  }));

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exported, null, 2), 'utf8');
  console.log(`[seed] JSON backup: ${OUTPUT_FILE} (${exported.length} zapisov)`);

  // Povzetek
  console.log('\n=== KONČANO ===');
  console.log(`  MongoDB: ${inserted} vstavljenih, ${updated} posodobljenih`);
  console.log(`  JSON:    ${OUTPUT_FILE}`);
  console.log(`  Total:   ${inserted + updated} igrišč v bazi`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] Napaka:', err);
  process.exit(1);
});
