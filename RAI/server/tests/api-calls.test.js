/**
 * SCRUM-22: testiranje osnovnih API klicev.
 *
 * Testi uporabljajo Express app brez app.listen() in supertest HTTP klice.
 */

const request = require('supertest');

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

jest.setTimeout(120000);

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

describe('Auth API klici', () => {
  const userPayload = {
    email: 'api-tester@example.com',
    password: 'StrongP@ss123',
    displayName: 'API Tester',
  };

  it('registracija vrne uporabnika in access token', async () => {
    const res = await request(app).post('/api/auth/register').send(userPayload);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(userPayload.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('access token omogoca klic GET /api/auth/me', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(userPayload);
    const token = registerRes.body.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(userPayload.email);
  });

  it('napacen login vrne 401 brez access tokena', async () => {
    await request(app).post('/api/auth/register').send(userPayload);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userPayload.email, password: 'WrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
