/**
 * SCRUM-22: testiranje osnovnih API klicev.
 *
 * Testi uporabljajo Express app brez app.listen() in supertest HTTP klice.
 */

const request = require('supertest');

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let app;

beforeAll(async () => {
  await setupTestDb();
  app = require('../src/app')();
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

describe('Osnovni API klici', () => {
  it('GET /health vrne status aplikacije in stanje baze', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(typeof res.body.uptimeSec).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/_ping vrne enostaven API odziv', async () => {
    const res = await request(app).get('/api/_ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('neznana API pot vrne JSON 404 napako', async () => {
    const res = await request(app).get('/api/neznana-pot');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('GET /api/neznana-pot');
  });
});
