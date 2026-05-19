/**
 * Integracijski testi za devices + sensor_measurements API.
 *
 * Pokrivajo:
 *  - Device model (validation, indexes, touchLastSeen)
 *  - Devices CRUD (auth, ownership, idempotent register, anti-enumeration)
 *  - SensorMeasurement ingestion (single + batch, ownership, validation)
 *  - SensorMeasurement read (filters, pagination, time range)
 *
 * Uporablja mongodb-memory-server (deli setup z auth.test.js).
 */

const request = require('supertest');

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let app;
let User;
let Device;
let SensorMeasurement;

beforeAll(async () => {
  await setupTestDb();
  app = require('../src/app')();
  User = require('../src/models/User');
  Device = require('../src/models/Device');
  SensorMeasurement = require('../src/models/SensorMeasurement');
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

// ============================================================
// Helperji
// ============================================================

async function registerAndLogin(email = 'tester@example.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'StrongP@ss123', displayName: 'Tester X' });
  return { token: res.body.accessToken, user: res.body.user };
}

async function registerDevice(token, deviceId, overrides = {}) {
  return request(app)
    .post('/api/devices')
    .set('Authorization', `Bearer ${token}`)
    .send({ deviceId, ...overrides });
}

function gpsMeasurement(deviceId, secondsAgo = 1) {
  return {
    schemaVersion: '1.0',
    deviceId,
    sensorType: 'gps',
    timestampUtc: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    data: { latitude: 46.5547, longitude: 15.6459, accuracyMeters: 5 },
  };
}

function accelMeasurement(deviceId, secondsAgo = 1) {
  return {
    schemaVersion: '1.0',
    deviceId,
    sensorType: 'accelerometer',
    timestampUtc: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    data: { x: 0.1, y: -0.2, z: 9.81, unit: 'm/s2' },
  };
}

// ============================================================
// DEVICE MODEL
// ============================================================
describe('Device model', () => {
  it('shrani z defaults (isActive=true, lastSeenAtUtc=now)', async () => {
    const u = new User({ email: 'd@x.com', displayName: 'DDD' });
    u.setPassword('Strong123');
    await u.save();
    const dev = new Device({ deviceId: 'good-id-1', userId: u._id });
    await dev.save();
    expect(dev.isActive).toBe(true);
    expect(dev.lastSeenAtUtc).toBeInstanceOf(Date);
  });

  it('zavrne neveljaven deviceId', async () => {
    const u = new User({ email: 'd2@x.com', displayName: 'DDD' });
    u.setPassword('Strong123');
    await u.save();
    const cases = ['has spaces', 'sl/ash', 'ž', 'a', 'a'.repeat(100), 'wild+', 'wild#'];
    for (const bad of cases) {
      const d = new Device({ deviceId: bad, userId: u._id });
      await expect(d.save()).rejects.toMatchObject({ name: 'ValidationError' });
    }
  });

  it('duplicate deviceId vrne E11000', async () => {
    const u = new User({ email: 'd3@x.com', displayName: 'DDD' });
    u.setPassword('Strong123');
    await u.save();
    const d1 = new Device({ deviceId: 'dup-id', userId: u._id });
    await d1.save();
    const d2 = new Device({ deviceId: 'dup-id', userId: u._id });
    await expect(d2.save()).rejects.toMatchObject({ code: 11000 });
  });

  it('touchLastSeen posodobi lastSeenAtUtc atomicno', async () => {
    const u = new User({ email: 'd4@x.com', displayName: 'DDD' });
    u.setPassword('Strong123');
    await u.save();
    const d = new Device({ deviceId: 'touch-id', userId: u._id });
    await d.save();
    const old = d.lastSeenAtUtc.getTime();
    await new Promise((r) => setTimeout(r, 30));
    await Device.touchLastSeen('touch-id');
    const reloaded = await Device.findById(d._id);
    expect(reloaded.lastSeenAtUtc.getTime()).toBeGreaterThan(old);
  });
});

// ============================================================
// POST /api/devices
// ============================================================
describe('POST /api/devices', () => {
  it('401 brez auth', async () => {
    const res = await request(app).post('/api/devices').send({ deviceId: 'd1' });
    expect(res.status).toBe(401);
  });

  it('201 happy path', async () => {
    const { token } = await registerAndLogin();
    const res = await registerDevice(token, 'pixel-8-azur', { name: 'Pixel 8', platform: 'android' });
    expect(res.status).toBe(201);
    expect(res.body.device.deviceId).toBe('pixel-8-azur');
    expect(res.body.device.platform).toBe('android');
    expect(res.body.device.isActive).toBe(true);
  });

  it('200 idempotent re-register istega userja (posodobi metadata)', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'dev-x', { name: 'Old' });
    const res = await registerDevice(token, 'dev-x', { name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.device.name).toBe('New');
  });

  it('409 DEVICE_ID_TAKEN za drugega userja', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'shared-id');
    const res = await registerDevice(tB, 'shared-id');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_ID_TAKEN');
  });

  it('400 za invalid deviceId', async () => {
    const { token } = await registerAndLogin();
    const res = await registerDevice(token, 'has spaces');
    expect(res.status).toBe(400);
  });

  it('400 za nepoznano platformo', async () => {
    const { token } = await registerAndLogin();
    const res = await registerDevice(token, 'good-id', { platform: 'symbian' });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/devices
// ============================================================
describe('GET /api/devices', () => {
  it('vrne SAMO svoje naprave (isolation)', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-1');
    await registerDevice(tA, 'a-2');
    await registerDevice(tB, 'b-1');

    const ra = await request(app).get('/api/devices').set('Authorization', `Bearer ${tA}`);
    expect(ra.body.devices.map((d) => d.deviceId).sort()).toEqual(['a-1', 'a-2']);
    const rb = await request(app).get('/api/devices').set('Authorization', `Bearer ${tB}`);
    expect(rb.body.devices.map((d) => d.deviceId)).toEqual(['b-1']);
  });

  it('filter platform + isActive', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'and-1', { platform: 'android' });
    await registerDevice(token, 'ios-1', { platform: 'ios' });
    await registerDevice(token, 'and-2', { platform: 'android' });
    const res = await request(app).get('/api/devices?platform=android').set('Authorization', `Bearer ${token}`);
    expect(res.body.devices.every((d) => d.platform === 'android')).toBe(true);
    expect(res.body.devices.length).toBe(2);
  });

  it('cursor paginacija (limit + nextCursor)', async () => {
    const { token } = await registerAndLogin();
    for (let i = 0; i < 5; i++) await registerDevice(token, `pg-${i}`);
    const r1 = await request(app).get('/api/devices?limit=2').set('Authorization', `Bearer ${token}`);
    expect(r1.body.devices.length).toBe(2);
    expect(r1.body.pagination.hasMore).toBe(true);
    expect(r1.body.pagination.nextCursor).toBeTruthy();

    const r2 = await request(app)
      .get(`/api/devices?limit=2&cursor=${r1.body.pagination.nextCursor}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r2.body.devices.length).toBe(2);
    // Razlicne naprave kot prva stran
    const firstIds = r1.body.devices.map((d) => d._id);
    const secondIds = r2.body.devices.map((d) => d._id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('400 za nevalidni cursor', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).get('/api/devices?cursor=garbage').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/devices/:id
// ============================================================
describe('GET /api/devices/:id', () => {
  it('200 own', async () => {
    const { token } = await registerAndLogin();
    const r1 = await registerDevice(token, 'own-1');
    const r2 = await request(app).get(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(200);
  });

  it('404 za tujo (anti-enumeration)', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    const r1 = await registerDevice(tA, 'a-only');
    const r2 = await request(app).get(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${tB}`);
    expect(r2.status).toBe(404);
  });

  it('404 za neobstojec', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).get('/api/devices/507f1f77bcf86cd799439099').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('400 za invalid id format', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).get('/api/devices/notvalid').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/devices/by-device-id/:deviceId  (SCRUM-29)
// ============================================================
describe('GET /api/devices/by-device-id/:deviceId', () => {
  it('401 brez auth', async () => {
    const res = await request(app).get('/api/devices/by-device-id/foo-bar');
    expect(res.status).toBe(401);
  });

  it('200 vrne svojo napravo', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'lookup-1', { name: 'Lookup', platform: 'ios' });
    const res = await request(app)
      .get('/api/devices/by-device-id/lookup-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.device.deviceId).toBe('lookup-1');
    expect(res.body.device.name).toBe('Lookup');
    expect(res.body.device.platform).toBe('ios');
  });

  it('404 za tujo napravo (anti-enumeration)', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-private');
    const res = await request(app)
      .get('/api/devices/by-device-id/a-private')
      .set('Authorization', `Bearer ${tB}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('404 za neobstojec deviceId', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/devices/by-device-id/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('400 za neveljaven deviceId (presledki)', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/devices/by-device-id/has%20spaces')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400 za prekratek deviceId', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/devices/by-device-id/ab')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// PATCH + DELETE /api/devices/:id
// ============================================================
describe('PATCH/DELETE /api/devices/:id', () => {
  it('PATCH posodobi name + isActive', async () => {
    const { token } = await registerAndLogin();
    const r1 = await registerDevice(token, 'p-1', { name: 'Original' });
    const r2 = await request(app)
      .patch(`/api/devices/${r1.body.device._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated', isActive: false });
    expect(r2.status).toBe(200);
    expect(r2.body.device.name).toBe('Updated');
    expect(r2.body.device.isActive).toBe(false);
  });

  it('PATCH 400 za prazno telo', async () => {
    const { token } = await registerAndLogin();
    const r1 = await registerDevice(token, 'p-2');
    const r2 = await request(app).patch(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${token}`).send({});
    expect(r2.status).toBe(400);
  });

  it('PATCH 400 za samo unknown polja (mass-assignment block)', async () => {
    const { token } = await registerAndLogin();
    const r1 = await registerDevice(token, 'p-3');
    const r2 = await request(app)
      .patch(`/api/devices/${r1.body.device._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId: 'EVIL', userId: '507f1f77bcf86cd799439099' });
    expect(r2.status).toBe(400); // stripUnknown -> empty -> .min(1) fails
  });

  it('PATCH 404 tujo', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    const r1 = await registerDevice(tA, 'a-3');
    const r2 = await request(app)
      .patch(`/api/devices/${r1.body.device._id}`)
      .set('Authorization', `Bearer ${tB}`)
      .send({ name: 'evil' });
    expect(r2.status).toBe(404);
  });

  it('DELETE 204 + cascade meritve + 404 po brisanju', async () => {
    const { token } = await registerAndLogin();
    const r1 = await registerDevice(token, 'del-1');
    // Vstavi 3 meritve
    await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ measurements: [gpsMeasurement('del-1'), gpsMeasurement('del-1', 2), gpsMeasurement('del-1', 3)] });
    expect(await SensorMeasurement.countDocuments({ deviceId: 'del-1' })).toBe(3);

    const r2 = await request(app).delete(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(204);
    expect(await SensorMeasurement.countDocuments({ deviceId: 'del-1' })).toBe(0);

    const r3 = await request(app).get(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${token}`);
    expect(r3.status).toBe(404);
  });

  it('DELETE 404 tujo', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    const r1 = await registerDevice(tA, 'a-del');
    const r2 = await request(app).delete(`/api/devices/${r1.body.device._id}`).set('Authorization', `Bearer ${tB}`);
    expect(r2.status).toBe(404);
  });
});

// ============================================================
// POST /api/measurements (single)
// ============================================================
describe('POST /api/measurements', () => {
  it('401 brez auth', async () => {
    const res = await request(app).post('/api/measurements').send(gpsMeasurement('any'));
    expect(res.status).toBe(401);
  });

  it('201 GPS happy', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'gps-dev');
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(gpsMeasurement('gps-dev'));
    expect(res.status).toBe(201);
    expect(res.body.measurement.sensorType).toBe('gps');
    expect(res.body.measurement.source).toBe('http');
    expect(res.body.measurement.userId).toBeTruthy();
  });

  it('201 accel happy', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'acc-dev');
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(accelMeasurement('acc-dev'));
    expect(res.status).toBe(201);
  });

  it('404 DEVICE_NOT_FOUND za neobstojec deviceId', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(gpsMeasurement('nonexistent'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DEVICE_NOT_FOUND');
  });

  it('404 za TUJI deviceId', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-only-dev');
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer tB`).send(gpsMeasurement('a-only-dev'));
    expect(res.status).toBe(401); // bad token -> 401
    const res2 = await request(app).post('/api/measurements').set('Authorization', `Bearer ${tB}`).send(gpsMeasurement('a-only-dev'));
    expect(res2.status).toBe(404);
    expect(res2.body.error.code).toBe('DEVICE_NOT_FOUND');
  });

  it('400 za nepoznan sensorType', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-x');
    const m = { ...gpsMeasurement('d-x'), sensorType: 'temperature' };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za GPS lat>90', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-l');
    const m = { ...gpsMeasurement('d-l'), data: { latitude: 95, longitude: 0 } };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za GPS data brez longitude', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-m');
    const m = { ...gpsMeasurement('d-m'), data: { latitude: 46 } };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za accel z gps data', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-a');
    const m = { ...accelMeasurement('d-a'), data: { latitude: 46, longitude: 15 } };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za timestamp v prihodnosti', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-t');
    const m = { ...gpsMeasurement('d-t'), timestampUtc: new Date(Date.now() + 3600_000).toISOString() };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za neveljaven ISO datum', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-iso');
    const m = { ...gpsMeasurement('d-iso'), timestampUtc: 'not-a-date' };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });

  it('400 za dodatna polja v data (strict)', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'd-extra');
    const m = { ...gpsMeasurement('d-extra'), data: { latitude: 46, longitude: 15, evil: 'x' } };
    const res = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(m);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// POST /api/measurements/batch
// ============================================================
describe('POST /api/measurements/batch', () => {
  it('201 happy 10', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'batch-1');
    const measurements = Array.from({ length: 10 }, (_, i) => gpsMeasurement('batch-1', i + 1));
    const res = await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ measurements });
    expect(res.status).toBe(201);
    expect(res.body.insertedCount).toBe(10);
    expect(res.body.rejectedCount).toBe(0);
  });

  it('201 max 100', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'batch-100');
    const measurements = Array.from({ length: 100 }, (_, i) => accelMeasurement('batch-100', (i + 1) / 10));
    const res = await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ measurements });
    expect(res.status).toBe(201);
    expect(res.body.insertedCount).toBe(100);
  });

  it('400 za 101', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'batch-101');
    const measurements = Array.from({ length: 101 }, (_, i) => gpsMeasurement('batch-101', i + 1));
    const res = await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ measurements });
    expect(res.status).toBe(400);
  });

  it('400 za empty array', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ measurements: [] });
    expect(res.status).toBe(400);
  });

  it('partial-success: 5 svojih + 1 tuja', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-batch');
    await registerDevice(tB, 'b-batch');

    const measurements = [
      ...Array.from({ length: 5 }, (_, i) => gpsMeasurement('a-batch', i + 1)),
      gpsMeasurement('b-batch'),
    ];
    const res = await request(app).post('/api/measurements/batch').set('Authorization', `Bearer ${tA}`).send({ measurements });
    expect(res.status).toBe(201);
    expect(res.body.insertedCount).toBe(5);
    expect(res.body.rejectedCount).toBe(1);
    expect(res.body.rejected[0].deviceId).toBe('b-batch');
    expect(res.body.rejected[0].reason).toBe('DEVICE_NOT_FOUND');
  });

  it('404 NO_OWNED_DEVICES za vse tuje', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-only-batch');
    const res = await request(app)
      .post('/api/measurements/batch')
      .set('Authorization', `Bearer ${tB}`)
      .send({ measurements: [gpsMeasurement('a-only-batch')] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_OWNED_DEVICES');
  });

  it('400 ce ena meritev v batchu nevalidna', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'batch-mix');
    const measurements = [
      gpsMeasurement('batch-mix'),
      { ...gpsMeasurement('batch-mix'), sensorType: 'temperature' },
    ];
    const res = await request(app).post('/api/measurements/batch').set('Authorization', `Bearer ${token}`).send({ measurements });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/measurements
// ============================================================
describe('GET /api/measurements', () => {
  async function seed() {
    const { token: tA, user: uA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'a-dev');
    await registerDevice(tB, 'b-dev');

    const aGps = Array.from({ length: 10 }, (_, i) => gpsMeasurement('a-dev', i + 1));
    const aAccel = Array.from({ length: 5 }, (_, i) => accelMeasurement('a-dev', i + 1));
    const bGps = Array.from({ length: 7 }, (_, i) => gpsMeasurement('b-dev', i + 1));

    await request(app).post('/api/measurements/batch').set('Authorization', `Bearer ${tA}`).send({ measurements: aGps });
    await request(app).post('/api/measurements/batch').set('Authorization', `Bearer ${tA}`).send({ measurements: aAccel });
    await request(app).post('/api/measurements/batch').set('Authorization', `Bearer ${tB}`).send({ measurements: bGps });

    return { tA, tB, uA };
  }

  it('vrne SAMO svoje meritve (isolation)', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?limit=1000').set('Authorization', `Bearer ${tA}`);
    expect(res.body.measurements.length).toBe(15);
    expect(res.body.measurements.every((m) => m.deviceId === 'a-dev')).toBe(true);
  });

  it('filter sensorType=gps', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?sensorType=gps&limit=1000').set('Authorization', `Bearer ${tA}`);
    expect(res.body.measurements.length).toBe(10);
    expect(res.body.measurements.every((m) => m.sensorType === 'gps')).toBe(true);
  });

  it('filter deviceId own', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?deviceId=a-dev&limit=1000').set('Authorization', `Bearer ${tA}`);
    expect(res.body.measurements.length).toBe(15);
  });

  it('404 za filter deviceId tuje (anti-enumeration)', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?deviceId=b-dev').set('Authorization', `Bearer ${tA}`);
    expect(res.status).toBe(404);
  });

  it('404 za filter deviceId neobstojec', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?deviceId=ghost').set('Authorization', `Bearer ${tA}`);
    expect(res.status).toBe(404);
  });

  it('time range filter', async () => {
    const { tA } = await seed();
    const from = new Date(Date.now() - 5500).toISOString();
    const res = await request(app)
      .get(`/api/measurements?from=${encodeURIComponent(from)}&limit=1000`)
      .set('Authorization', `Bearer ${tA}`);
    expect(res.body.measurements.length).toBeGreaterThan(0);
    expect(res.body.measurements.length).toBeLessThan(15);
  });

  it('400 za to<from', async () => {
    const { tA } = await seed();
    const past = new Date(Date.now() - 5000).toISOString();
    const future = new Date(Date.now() - 1000).toISOString();
    const res = await request(app)
      .get(`/api/measurements?from=${encodeURIComponent(future)}&to=${encodeURIComponent(past)}`)
      .set('Authorization', `Bearer ${tA}`);
    expect(res.status).toBe(400);
  });

  it('400 za limit>1000', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?limit=5000').set('Authorization', `Bearer ${tA}`);
    expect(res.status).toBe(400);
  });

  it('cursor paginacija desc (default)', async () => {
    const { tA } = await seed();
    const r1 = await request(app).get('/api/measurements?limit=5').set('Authorization', `Bearer ${tA}`);
    expect(r1.body.measurements.length).toBe(5);
    expect(r1.body.pagination.hasMore).toBe(true);
    const r2 = await request(app)
      .get(`/api/measurements?limit=5&cursor=${r1.body.pagination.nextCursor}`)
      .set('Authorization', `Bearer ${tA}`);
    const firstIds = r1.body.measurements.map((m) => m._id);
    const secondIds = r2.body.measurements.map((m) => m._id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('sort=asc je naracajoc po timestamp', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?sort=asc&limit=1000').set('Authorization', `Bearer ${tA}`);
    const ts = res.body.measurements.map((m) => new Date(m.timestampUtc).getTime());
    expect(ts.every((t, i) => i === 0 || t >= ts[i - 1])).toBe(true);
  });

  it('400 za invalid sort', async () => {
    const { tA } = await seed();
    const res = await request(app).get('/api/measurements?sort=banana').set('Authorization', `Bearer ${tA}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/devices/:id/measurements
// ============================================================
describe('GET /api/devices/:id/measurements', () => {
  it('vrne meritve own naprave', async () => {
    const { token } = await registerAndLogin();
    const r = await registerDevice(token, 'm-dev');
    await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(gpsMeasurement('m-dev'));
    await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(gpsMeasurement('m-dev', 2));
    const res = await request(app).get(`/api/devices/${r.body.device._id}/measurements`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.measurements.length).toBe(2);
  });

  it('404 za tujo napravo', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    const r = await registerDevice(tA, 'a-only');
    const res = await request(app).get(`/api/devices/${r.body.device._id}/measurements`).set('Authorization', `Bearer ${tB}`);
    expect(res.status).toBe(404);
  });
});

// ============================================================
// GET /api/measurements/:id
// ============================================================
describe('GET /api/measurements/:id', () => {
  it('200 own', async () => {
    const { token } = await registerAndLogin();
    await registerDevice(token, 'g-dev');
    const r = await request(app).post('/api/measurements').set('Authorization', `Bearer ${token}`).send(gpsMeasurement('g-dev'));
    const res = await request(app).get(`/api/measurements/${r.body.measurement._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('404 tuja', async () => {
    const { token: tA } = await registerAndLogin('aa@x.com');
    const { token: tB } = await registerAndLogin('bb@x.com');
    await registerDevice(tA, 'g-a');
    const r = await request(app).post('/api/measurements').set('Authorization', `Bearer ${tA}`).send(gpsMeasurement('g-a'));
    const res = await request(app).get(`/api/measurements/${r.body.measurement._id}`).set('Authorization', `Bearer ${tB}`);
    expect(res.status).toBe(404);
  });

  it('404 neobstojec', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).get('/api/measurements/507f1f77bcf86cd799439099').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('400 invalid id', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app).get('/api/measurements/notvalid').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
