/**
 * Unit testi za ScraperIngestionService (SCRUM-33).
 *
 * Pokrivajo:
 *  - ingestExtracted: insert, idempotentni upsert, validacija (skip), errors
 *  - runPipeline: kombinira scraper + extractor + ingestion
 *  - dependency injection (custom scraperRunner / extractor) za teste
 */

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let TrafficCounterMeasurement;
let ScraperIngestionService;

beforeAll(async () => {
  await setupTestDb();
  TrafficCounterMeasurement = require('../src/models/TrafficCounterMeasurement');
  ScraperIngestionService = require('../src/scraper/ingestion/ScraperIngestionService');
  await TrafficCounterMeasurement.syncIndexes();
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

function record(overrides = {}) {
  return {
    sourceId: 'src-1',
    stationId: 'LJ-001',
    stationName: 'Ljubljana center',
    location: { latitude: 46.0569, longitude: 14.5058 },
    metrics: { vehicleCount: 1000, averageSpeedKmh: 40 },
    measuredAt: '2026-05-15T09:55:00.000Z',
    extractedAt: '2026-05-15T10:00:00.000Z',
    ...overrides,
  };
}

const silentLogger = { warn() {}, error() {}, log() {} };

describe('ScraperIngestionService.ingestExtracted', () => {
  it('prazna lista -> vsi counter-ji 0', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([]);
    expect(r.totalCount).toBe(0);
    expect(r.insertedCount).toBe(0);
    expect(r.skippedCount).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it('non-array vhod -> tih no-op', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted(null);
    expect(r.totalCount).toBe(0);
  });

  it('vstavi nove zapise', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([
      record({ stationId: 'LJ-001' }),
      record({ stationId: 'MB-014', location: { latitude: 46.5547, longitude: 15.6459 } }),
    ]);
    expect(r.totalCount).toBe(2);
    expect(r.insertedCount).toBe(2);
    expect(r.matchedCount).toBe(0);
    expect(r.skippedCount).toBe(0);
    expect(await TrafficCounterMeasurement.countDocuments()).toBe(2);
  });

  it('idempotentnost: drugi run ne podvoji', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const batch = [record({ stationId: 'LJ-001' }), record({ stationId: 'MB-014' })];
    await svc.ingestExtracted(batch);
    const r2 = await svc.ingestExtracted(batch);
    expect(r2.insertedCount).toBe(0);
    expect(r2.matchedCount).toBe(2);
    expect(await TrafficCounterMeasurement.countDocuments()).toBe(2);
  });

  it('upsert posodobi spremenljive metrike pri istem (source,station,measuredAt)', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    await svc.ingestExtracted([record({ metrics: { vehicleCount: 100, averageSpeedKmh: 30 } })]);

    const r = await svc.ingestExtracted([
      record({ metrics: { vehicleCount: 200, averageSpeedKmh: 35 } }),
    ]);
    expect(r.insertedCount).toBe(0);
    expect(r.modifiedCount).toBeGreaterThan(0);

    const doc = await TrafficCounterMeasurement.findOne({});
    expect(doc.metrics.vehicleCount).toBe(200);
    expect(doc.metrics.averageSpeedKmh).toBe(35);
  });

  it('preskoci nevaljaven zapis (manjka sourceId)', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([
      record({ sourceId: undefined }),
      record({ stationId: 'OK-1' }),
    ]);
    expect(r.insertedCount).toBe(1);
    expect(r.skippedCount).toBe(1);
    expect(r.skipped[0].reason).toBe('missing_sourceId');
  });

  it('preskoci nevaljaven zapis (vehicleCount=-1)', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([
      record({ metrics: { vehicleCount: -5 } }),
    ]);
    expect(r.insertedCount).toBe(0);
    expect(r.skippedCount).toBe(1);
    expect(r.skipped[0].reason).toBe('invalid_vehicleCount');
  });

  it('preskoci nevaljaven zapis (lat=999)', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([
      record({ location: { latitude: 999, longitude: 0 } }),
    ]);
    expect(r.skippedCount).toBe(1);
    expect(r.skipped[0].reason).toBe('coordinates_out_of_range');
  });

  it('preskoci nevaljaven measuredAt', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([record({ measuredAt: 'not-a-date' })]);
    expect(r.skippedCount).toBe(1);
    expect(r.skipped[0].reason).toBe('invalid_measuredAt');
  });

  it('en nevaljaven zapis ne prekine batch-a', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const r = await svc.ingestExtracted([
      record({ stationId: 'OK-1' }),
      record({ sourceId: undefined }),
      record({ stationId: 'OK-2' }),
    ]);
    expect(r.insertedCount).toBe(2);
    expect(r.skippedCount).toBe(1);
  });
});

describe('ScraperIngestionService.runPipeline', () => {
  it('uporabi injectani scraperRunner + extractor', async () => {
    const fakeRaw = {
      sourceId: 'src-x',
      name: 'Test',
      category: 'traffic',
      ok: true,
      fetchedAt: new Date().toISOString(),
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        updatedAt: '2026-05-15T09:00:00.000Z',
        counters: [
          {
            stationId: 'X-1',
            stationName: 'Test postaja',
            latitude: 46.0569,
            longitude: 14.5058,
            vehicleCount: 500,
            averageSpeedKmh: 40,
            measuredAt: '2026-05-15T08:55:00.000Z',
          },
        ],
      }),
    };

    const fakeRunner = { collect: jest.fn().mockResolvedValue([fakeRaw]) };
    const svc = new ScraperIngestionService({
      scraperRunner: fakeRunner,
      getSources: () => [{ id: 'src-x', name: 'Test', category: 'traffic' }],
      logger: silentLogger,
    });

    const summary = await svc.runPipeline();
    expect(summary.sourcesAttempted).toBe(1);
    expect(summary.sourcesOk).toBe(1);
    expect(summary.sourcesFailed).toBe(0);
    expect(summary.extractedCount).toBe(1);
    expect(summary.ingestion.insertedCount).toBe(1);
    expect(fakeRunner.collect).toHaveBeenCalledTimes(1);
  });

  it('zabelezi failedSources, ce vir ne odgovori', async () => {
    const fakeRunner = {
      collect: jest.fn().mockResolvedValue([
        {
          sourceId: 'broken',
          name: 'Broken',
          category: 'traffic',
          ok: false,
          fetchedAt: new Date().toISOString(),
          status: 500,
          contentType: null,
          body: null,
          error: 'timeout',
        },
      ]),
    };
    const svc = new ScraperIngestionService({
      scraperRunner: fakeRunner,
      getSources: () => [{ id: 'broken' }],
      logger: silentLogger,
    });

    const summary = await svc.runPipeline();
    expect(summary.sourcesFailed).toBe(1);
    expect(summary.sourcesOk).toBe(0);
    expect(summary.extractedCount).toBe(0);
    expect(summary.failedSources[0]).toMatchObject({ sourceId: 'broken', error: 'timeout' });
  });

  it('default pipeline (real fixture) preda podatke do baze', async () => {
    const svc = new ScraperIngestionService({ logger: silentLogger });
    const summary = await svc.runPipeline();
    expect(summary.sourcesOk).toBeGreaterThan(0);
    expect(summary.extractedCount).toBeGreaterThan(0);
    expect(summary.ingestion.insertedCount).toBe(summary.extractedCount);

    // Idempotentnost drugega run-a
    const summary2 = await svc.runPipeline();
    expect(summary2.ingestion.insertedCount).toBe(0);
    expect(summary2.ingestion.matchedCount).toBe(summary.extractedCount);
  });
});
