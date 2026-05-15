const { extractTrafficCounters } = require('../src/scraper');

describe('scraper data extraction', () => {
  test('normalizes valid traffic counter payload', () => {
    const records = extractTrafficCounters({
      sourceId: 'test-source',
      fetchedAt: '2026-05-15T10:00:00.000Z',
      body: JSON.stringify({
        counters: [
          {
            stationId: 'LJ-001',
            stationName: 'Ljubljana center',
            latitude: '46.0569',
            longitude: 14.5058,
            vehicleCount: '1240',
            averageSpeedKmh: 42,
            measuredAt: '2026-05-15T09:55:00.000Z',
          },
        ],
      }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceId: 'test-source',
      stationId: 'LJ-001',
      stationName: 'Ljubljana center',
      location: {
        latitude: 46.0569,
        longitude: 14.5058,
      },
      metrics: {
        vehicleCount: 1240,
        averageSpeedKmh: 42,
      },
      measuredAt: '2026-05-15T09:55:00.000Z',
    });
  });

  test('skips incomplete traffic counter rows', () => {
    const records = extractTrafficCounters({
      sourceId: 'test-source',
      fetchedAt: '2026-05-15T10:00:00.000Z',
      body: {
        counters: [
          { stationId: 'OK-1', latitude: 46.1, longitude: 14.1, vehicleCount: 12 },
          { stationId: 'BAD-1', longitude: 14.1, vehicleCount: 12 },
        ],
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0].stationId).toBe('OK-1');
  });
});
