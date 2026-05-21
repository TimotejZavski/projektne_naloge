/**
 * Integracijski testi za /api/scraper/* (SCRUM-33).
 *
 * Preverja:
 *  - 401 brez tokena
 *  - POST /run sprozi pipeline in vrne summary (200)
 *  - POST /run v NODE_ENV=production zahteva admin role
 *  - GET /measurements: filtri (sourceId, stationId, from/to), limit
 *  - GET /stations: distinct postaje z zadnjo meritvijo
 *  - 400 za nevalidne query / body parametre
 */

const request = require('supertest');

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let app;
let TrafficCounterMeasurement;
let scraperController;

beforeAll(async () => {
  await setupTestDb();
  app = require('../src/app')();
  TrafficCounterMeasurement = require('../src/models/TrafficCounterMeasurement');
  scraperController = require('../src/controllers/scraper.controller');
  await TrafficCounterMeasurement.syncIndexes();
});

afterEach(async () => {
  await clearTestDb();
  // Resetiraj morebitni mockani service iz prejsnjega testa
  scraperController.setServiceForTesting(null);
});

afterAll(teardownTestDb);

async function registerAndLogin(email = 'scraper-tester@example.com', role) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'StrongP@ss123', displayName: 'Scraper T' });

  if (role) {
    // Promote v admin direktno preko DB-ja (admin promotion endpoint ne obstaja)
    const User = require('../src/models/User');
    await User.updateOne({ _id: res.body.user._id || res.body.user.id }, { $set: { role } });
    // Nov access token z admin claim-om: ponoven login
    const relog = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'StrongP@ss123' });
    return { token: relog.body.accessToken, user: relog.body.user };
  }
  return { token: res.body.accessToken, user: res.body.user };
}

function fixtureRecord(overrides = {}) {
  return {
    sourceId: 'src-test',
    stationId: 'LJ-001',
    stationName: 'Ljubljana center',
    location: { latitude: 46.0569, longitude: 14.5058 },
    metrics: { vehicleCount: 1000, averageSpeedKmh: 40 },
    measuredAt: new Date('2026-05-15T09:55:00.000Z'),
    extractedAt: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  };
}

describe('POST /api/scraper/run', () => {
  it('401 brez tokena', async () => {
    const res = await request(app).post('/api/scraper/run').send({});
    expect(res.status).toBe(401);
  });

  it('200 in vrne summary (dev okolje, fixture vir)', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/run')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.ingestion.insertedCount).toBeGreaterThan(0);
    expect(res.body.summary.sourcesOk).toBeGreaterThan(0);
  });

  it('idempotentnost: drugi run insertedCount=0', async () => {
    const { token } = await registerAndLogin();
    await request(app).post('/api/scraper/run').set('Authorization', `Bearer ${token}`).send({});
    const res2 = await request(app)
      .post('/api/scraper/run')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res2.body.summary.ingestion.insertedCount).toBe(0);
    expect(res2.body.summary.ingestion.matchedCount).toBeGreaterThan(0);
  });

  it('400 za neznane sourceIds', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceIds: ['neznan-vir'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_SOURCE_IDS');
  });

  it('400 za nevalidne sourceIds (presledki)', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceIds: ['has spaces'] });
    expect(res.status).toBe(400);
  });

  it('NODE_ENV=production: 403 za navadnega user-a', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { token } = await registerAndLogin();
      const res = await request(app)
        .post('/api/scraper/run')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it('NODE_ENV=production: admin sme', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { token } = await registerAndLogin('admin@example.com', 'admin');
      const res = await request(app)
        .post('/api/scraper/run')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
    } finally {
      process.env.NODE_ENV = orig;
    }
  });
});

describe('POST /api/scraper/output', () => {
  it('401 brez tokena', async () => {
    const res = await request(app)
      .post('/api/scraper/output')
      .send({ records: [fixtureRecord()] });
    expect(res.status).toBe(401);
  });

  it('202 sprejme ze ekstrahiran scraper output in ga shrani', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/output')
      .set('Authorization', `Bearer ${token}`)
      .send({
        records: [
          fixtureRecord({ stationId: 'OUT-1' }),
          fixtureRecord({
            stationId: 'OUT-2',
            location: { latitude: 46.5547, longitude: 15.6459 },
          }),
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.summary.insertedCount).toBe(2);
    expect(res.body.metadata.receivedCount).toBe(2);
    expect(await TrafficCounterMeasurement.countDocuments()).toBe(2);
  });

  it('idempotentnost: isti output drugic ne podvoji zapisov', async () => {
    const { token } = await registerAndLogin();
    const body = { records: [fixtureRecord({ stationId: 'OUT-1' })] };

    await request(app)
      .post('/api/scraper/output')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const second = await request(app)
      .post('/api/scraper/output')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(second.status).toBe(202);
    expect(second.body.summary.insertedCount).toBe(0);
    expect(second.body.summary.matchedCount).toBe(1);
    expect(await TrafficCounterMeasurement.countDocuments()).toBe(1);
  });

  it('neveljavni posamicni zapisi se vrnejo kot skipped, ne zrusijo batcha', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/output')
      .set('Authorization', `Bearer ${token}`)
      .send({
        records: [
          fixtureRecord({ sourceId: undefined }),
          fixtureRecord({ stationId: 'OUT-OK' }),
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.summary.insertedCount).toBe(1);
    expect(res.body.summary.skippedCount).toBe(1);
    expect(res.body.summary.skipped[0].reason).toBe('missing_sourceId');
  });

  it('400 za manjkajoc records array', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/scraper/output')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('NODE_ENV=production: output endpoint zahteva admin role', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { token } = await registerAndLogin();
      const res = await request(app)
        .post('/api/scraper/output')
        .set('Authorization', `Bearer ${token}`)
        .send({ records: [fixtureRecord()] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      process.env.NODE_ENV = orig;
    }
  });
});

describe('GET /api/scraper/measurements', () => {
  it('401 brez tokena', async () => {
    const res = await request(app).get('/api/scraper/measurements');
    expect(res.status).toBe(401);
  });

  it('vrne vse zapise (default limit)', async () => {
    const { token } = await registerAndLogin();
    await TrafficCounterMeasurement.create([
      fixtureRecord({ stationId: 'A', measuredAt: new Date('2026-05-15T08:00:00Z') }),
      fixtureRecord({ stationId: 'B', measuredAt: new Date('2026-05-15T09:00:00Z') }),
    ]);
    const res = await request(app)
      .get('/api/scraper/measurements')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    // Najnovejsi prvi
    expect(res.body.measurements[0].stationId).toBe('B');
  });

  it('filter sourceId', async () => {
    const { token } = await registerAndLogin();
    await TrafficCounterMeasurement.create([
      fixtureRecord({ sourceId: 'src-a', stationId: 'A' }),
      fixtureRecord({ sourceId: 'src-b', stationId: 'B' }),
    ]);
    const res = await request(app)
      .get('/api/scraper/measurements?sourceId=src-a')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.count).toBe(1);
    expect(res.body.measurements[0].sourceId).toBe('src-a');
  });

  it('filter stationId', async () => {
    const { token } = await registerAndLogin();
    await TrafficCounterMeasurement.create([
      fixtureRecord({ stationId: 'STN-X' }),
      fixtureRecord({ stationId: 'STN-Y', measuredAt: new Date('2026-05-15T10:00:00Z') }),
    ]);
    const res = await request(app)
      .get('/api/scraper/measurements?stationId=STN-X')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.count).toBe(1);
    expect(res.body.measurements[0].stationId).toBe('STN-X');
  });

  it('filter from/to', async () => {
    const { token } = await registerAndLogin();
    await TrafficCounterMeasurement.create([
      fixtureRecord({ stationId: 'A', measuredAt: new Date('2026-05-10T00:00:00Z') }),
      fixtureRecord({ stationId: 'B', measuredAt: new Date('2026-05-15T00:00:00Z') }),
      fixtureRecord({ stationId: 'C', measuredAt: new Date('2026-05-20T00:00:00Z') }),
    ]);
    const res = await request(app)
      .get('/api/scraper/measurements?from=2026-05-12T00:00:00Z&to=2026-05-18T00:00:00Z')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.count).toBe(1);
    expect(res.body.measurements[0].stationId).toBe('B');
  });

  it('limit', async () => {
    const { token } = await registerAndLogin();
    const docs = [];
    for (let i = 0; i < 5; i++) {
      docs.push(
        fixtureRecord({
          stationId: `S-${i}`,
          measuredAt: new Date(2026, 4, 15, 10, i),
        })
      );
    }
    await TrafficCounterMeasurement.create(docs);

    const res = await request(app)
      .get('/api/scraper/measurements?limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.count).toBe(2);
  });

  it('400 za to<=from', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/scraper/measurements?from=2026-05-15&to=2026-05-10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400 za limit>1000', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/scraper/measurements?limit=5000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/scraper/stations', () => {
  it('401 brez tokena', async () => {
    const res = await request(app).get('/api/scraper/stations');
    expect(res.status).toBe(401);
  });

  it('vrne distinct postaje z zadnjo meritvijo', async () => {
    const { token } = await registerAndLogin();
    await TrafficCounterMeasurement.create([
      fixtureRecord({
        stationId: 'LJ-001',
        measuredAt: new Date('2026-05-15T08:00:00Z'),
        metrics: { vehicleCount: 100, averageSpeedKmh: 40 },
      }),
      fixtureRecord({
        stationId: 'LJ-001',
        measuredAt: new Date('2026-05-15T09:00:00Z'),
        metrics: { vehicleCount: 200, averageSpeedKmh: 45 },
      }),
      fixtureRecord({
        stationId: 'MB-014',
        measuredAt: new Date('2026-05-15T09:00:00Z'),
        metrics: { vehicleCount: 50 },
      }),
    ]);

    const res = await request(app)
      .get('/api/scraper/stations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const lj = res.body.stations.find((s) => s.stationId === 'LJ-001');
    expect(lj.lastVehicleCount).toBe(200);
    expect(lj.lastAverageSpeedKmh).toBe(45);
  });
});
