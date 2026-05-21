const {
  ScraperOutputApiClient,
  ScraperOutputApiError,
} = require('../src/scraper/output/ScraperOutputApiClient');

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

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

describe('ScraperOutputApiClient', () => {
  it('poslje records na /api/scraper/output z Bearer tokenom', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(202, {
        summary: { insertedCount: 1 },
        metadata: { receivedCount: 1 },
      })
    );
    const client = new ScraperOutputApiClient({
      apiBaseUrl: 'http://localhost:5000/',
      accessToken: 'token-123',
      fetchImpl,
    });

    const result = await client.send([record()], {
      metadata: { source: 'smoke-test' },
    });

    expect(result.summary.insertedCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:5000/api/scraper/output');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body)).toEqual({
      records: [record()],
      metadata: { source: 'smoke-test' },
    });
  });

  it('omogoca per-call accessToken override', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(202, { summary: {} }));
    const client = new ScraperOutputApiClient({
      apiBaseUrl: 'http://localhost:5000',
      accessToken: 'old-token',
      fetchImpl,
    });

    await client.send([record()], { accessToken: 'new-token' });

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer new-token');
  });

  it('vrze ScraperOutputApiError za API error response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Vnos ni veljaven.',
          details: [{ path: 'records' }],
        },
      })
    );
    const client = new ScraperOutputApiClient({
      apiBaseUrl: 'http://localhost:5000',
      fetchImpl,
    });

    const error = await client.send([record()]).catch((err) => err);

    expect(error).toBeInstanceOf(ScraperOutputApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'records' }]);
  });

  it('omrezno napako ovije v ScraperOutputApiError status=0', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new ScraperOutputApiClient({
      apiBaseUrl: 'http://localhost:5000',
      fetchImpl,
    });

    const error = await client.send([record()]).catch((err) => err);

    expect(error).toBeInstanceOf(ScraperOutputApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('zavrne prazen records array pred HTTP klicem', async () => {
    const fetchImpl = jest.fn();
    const client = new ScraperOutputApiClient({
      apiBaseUrl: 'http://localhost:5000',
      fetchImpl,
    });

    await expect(client.send([])).rejects.toBeInstanceOf(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
