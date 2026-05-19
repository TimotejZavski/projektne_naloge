/**
 * Smoke skripta za SCRUM-33: scraper -> extract -> ingest -> read.
 *
 * Uporabi `mongodb-memory-server` da pokaze celoten end-to-end tok brez
 * zunanjega Mongo-ja. Smernik za QA in onboarding.
 */

/* eslint-disable no-console */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { ScraperIngestionService } = require('../src/scraper');
const TrafficCounterMeasurement = require('../src/models/TrafficCounterMeasurement');

async function main() {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  try {
    const service = new ScraperIngestionService();

    console.log('\n[1] Prvi run (clean state)');
    const first = await service.runPipeline();
    console.log(JSON.stringify(first, null, 2));

    console.log('\n[2] Drugi run (idempotentnost: insertedCount mora biti 0)');
    const second = await service.runPipeline();
    console.log(JSON.stringify(second, null, 2));

    if (second.ingestion.insertedCount !== 0) {
      throw new Error('Idempotency check failed: drugic je vstavil nove zapise.');
    }

    const stored = await TrafficCounterMeasurement.find({}).lean();
    console.log(`\n[3] V bazi je ${stored.length} unikatnih zapisov.`);
    for (const doc of stored) {
      console.log(
        `  - ${doc.sourceId}/${doc.stationId} @ ${doc.measuredAt.toISOString()} ` +
          `vehicles=${doc.metrics.vehicleCount} avg=${doc.metrics.averageSpeedKmh}km/h`
      );
    }

    if (stored.length === 0) {
      throw new Error('Smoke failed: v bazi po pipeline-u ni zapisov.');
    }

    console.log('\nScraper ingest smoke OK.');
  } finally {
    await mongoose.disconnect();
    await mem.stop();
  }
}

main().catch((err) => {
  console.error('[smoke-scraper-ingest] FAILED:', err);
  process.exit(1);
});
