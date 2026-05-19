/**
 * Unit testi za TrafficCounterMeasurement model (SCRUM-33).
 */

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let TrafficCounterMeasurement;
let mongoose;

beforeAll(async () => {
  await setupTestDb();
  mongoose = require('mongoose');
  TrafficCounterMeasurement = require('../src/models/TrafficCounterMeasurement');
  // Pocakaj na indekse - unique constraint je takoj relevanten
  await TrafficCounterMeasurement.syncIndexes();
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

function makeDoc(overrides = {}) {
  return {
    sourceId: 'dars-traffic-counters-sample',
    stationId: 'LJ-001',
    stationName: 'Ljubljana center',
    location: { latitude: 46.0569, longitude: 14.5058 },
    metrics: { vehicleCount: 1240, averageSpeedKmh: 42 },
    measuredAt: new Date('2026-05-15T09:55:00.000Z'),
    extractedAt: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  };
}

describe('TrafficCounterMeasurement model', () => {
  it('shrani veljaven dokument z defaults', async () => {
    const doc = await TrafficCounterMeasurement.create(makeDoc());
    expect(doc.schemaVersion).toBe('1.0');
    expect(doc.ingestedAt).toBeInstanceOf(Date);
    expect(doc.location.latitude).toBe(46.0569);
    expect(doc.metrics.vehicleCount).toBe(1240);
    expect(doc.metrics.averageSpeedKmh).toBe(42);
  });

  it('dovoli null averageSpeedKmh', async () => {
    const doc = await TrafficCounterMeasurement.create(
      makeDoc({ metrics: { vehicleCount: 5, averageSpeedKmh: null } })
    );
    expect(doc.metrics.averageSpeedKmh).toBeNull();
  });

  it('zavrne missing required polja', async () => {
    await expect(
      TrafficCounterMeasurement.create({ ...makeDoc(), sourceId: undefined })
    ).rejects.toThrow();
    await expect(
      TrafficCounterMeasurement.create({ ...makeDoc(), stationId: undefined })
    ).rejects.toThrow();
    await expect(
      TrafficCounterMeasurement.create({ ...makeDoc(), measuredAt: undefined })
    ).rejects.toThrow();
  });

  it('zavrne latitude izven obmocja', async () => {
    await expect(
      TrafficCounterMeasurement.create(
        makeDoc({ location: { latitude: 95, longitude: 0 } })
      )
    ).rejects.toThrow();
  });

  it('zavrne negativen vehicleCount', async () => {
    await expect(
      TrafficCounterMeasurement.create(
        makeDoc({ metrics: { vehicleCount: -1 } })
      )
    ).rejects.toThrow();
  });

  it('unique compound (sourceId, stationId, measuredAt) prepreci podvajanje', async () => {
    await TrafficCounterMeasurement.create(makeDoc());
    await expect(
      TrafficCounterMeasurement.create(makeDoc())
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('dovoli iste sourceId/stationId pri razlicnem measuredAt', async () => {
    await TrafficCounterMeasurement.create(makeDoc());
    const doc2 = await TrafficCounterMeasurement.create(
      makeDoc({ measuredAt: new Date('2026-05-15T10:00:00.000Z') })
    );
    expect(doc2._id).toBeDefined();
    expect(await TrafficCounterMeasurement.countDocuments()).toBe(2);
  });
});
