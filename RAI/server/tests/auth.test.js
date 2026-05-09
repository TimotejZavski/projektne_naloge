/**
 * Integracijski testi za auth API.
 *
 * Pokrivamo:
 *  - User model (bcrypt, anti-enumeration, JSON stripping)
 *  - JWT util (sign/verify, cross-secret, alg confusion)
 *  - Auth endpoint-i (register, login, refresh, logout, me, logout-all)
 *  - Edge cases (validation, NoSQL inj, tampered token, reuse detection)
 *
 * Uporablja mongodb-memory-server -> brez zunanje Mongo odvisnosti.
 */

const request = require('supertest');

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

let app;
let User;
let Session;
let jwtUtil;

beforeAll(async () => {
  await setupTestDb();
  // Naloži aplikacijo SELE po setupu env (setupFiles je to ze postoril) +
  // po vzpostavljeni Mongo povezavi.
  app = require('../src/app')();
  User = require('../src/models/User');
  Session = require('../src/models/Session');
  jwtUtil = require('../src/utils/jwt');
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

// ============================================================
// Helperji
// ============================================================
const VALID_USER = {
  email: 'tester@example.com',
  password: 'StrongP@ss123',
  displayName: 'Test User',
};

async function registerUser(overrides = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ ...VALID_USER, ...overrides });
}

function getCookie(res, name) {
  const arr = res.headers['set-cookie'] || [];
  for (const c of arr) {
    const m = c.match(new RegExp('^' + name + '=([^;]+)'));
    if (m) return m[1];
  }
  return null;
}

// ============================================================
// USER MODEL
// ============================================================
describe('User model', () => {
  it('hashira geslo (NE shrani plain text)', async () => {
    const u = new User({ email: 'a@b.com', displayName: 'AA' });
    u.setPassword('Plain12345');
    await u.save();
    const fromDb = await User.findById(u._id).select('+passwordHash');
    expect(fromDb.passwordHash).not.toBe('Plain12345');
    expect(fromDb.passwordHash.startsWith('$2')).toBe(true);
  });

  it('toJSON ne razkrije passwordHash', async () => {
    const u = new User({ email: 'b@c.com', displayName: 'BB' });
    u.setPassword('Plain12345');
    await u.save();
    const json = u.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.email).toBe('b@c.com');
  });

  it('comparePassword: true za pravilno, false za napacno', async () => {
    const u = new User({ email: 'c@d.com', displayName: 'CC' });
    u.setPassword('CorrectPass1');
    await u.save();
    expect(await u.comparePassword('CorrectPass1')).toBe(true);
    expect(await u.comparePassword('WrongPass')).toBe(false);
    expect(await u.comparePassword('')).toBe(false);
    expect(await u.comparePassword(null)).toBe(false);
  });

  it('findByCredentials: vrne null v VSEH napakah (anti-enumeration)', async () => {
    const u = new User({ email: 'd@e.com', displayName: 'DD' });
    u.setPassword('Right12345');
    await u.save();

    expect(await User.findByCredentials('d@e.com', 'Right12345')).not.toBeNull();
    expect(await User.findByCredentials('d@e.com', 'wrong')).toBeNull();
    expect(await User.findByCredentials('does-not-exist@x.com', 'whatever')).toBeNull();
    expect(await User.findByCredentials(null, 'whatever')).toBeNull();
    expect(await User.findByCredentials('d@e.com', null)).toBeNull();
  });

  it('email se shrani lowercase + trim', async () => {
    const u = new User({ email: '  Mixed@CASE.com ', displayName: 'MM' });
    u.setPassword('Strong123');
    await u.save();
    expect(u.email).toBe('mixed@case.com');
  });

  it('email validacija zavrne nepravilen format', async () => {
    const u = new User({ email: 'not-an-email', displayName: 'XX' });
    u.setPassword('Strong123');
    await expect(u.save()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('duplicate email vrne E11000', async () => {
    const u1 = new User({ email: 'dup@x.com', displayName: 'D1' });
    u1.setPassword('Strong123');
    await u1.save();
    const u2 = new User({ email: 'dup@x.com', displayName: 'D2' });
    u2.setPassword('Strong123');
    await expect(u2.save()).rejects.toMatchObject({ code: 11000 });
  });

  it('inactive user ne more skozi findByCredentials', async () => {
    const u = new User({ email: 'inactive@x.com', displayName: 'II', isActive: false });
    u.setPassword('Strong123');
    await u.save();
    expect(await User.findByCredentials('inactive@x.com', 'Strong123')).toBeNull();
  });
});

// ============================================================
// JWT UTILITY
// ============================================================
describe('JWT util', () => {
  const fakeUser = { _id: { toString: () => '507f1f77bcf86cd799439011' }, role: 'user' };

  it('sign + verify access token', () => {
    const token = jwtUtil.signAccessToken(fakeUser);
    const payload = jwtUtil.verifyAccessToken(token);
    expect(payload.sub).toBe('507f1f77bcf86cd799439011');
    expect(payload.type).toBe('access');
    expect(payload.role).toBe('user');
  });

  it('refresh token ima jti in expiresAt', () => {
    const { token, jti, expiresAt } = jwtUtil.signRefreshToken(fakeUser);
    expect(typeof token).toBe('string');
    expect(jti).toMatch(/^[a-f0-9]{32}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('access token ZAVRNJEN kot refresh in obratno (cross-secret)', () => {
    const access = jwtUtil.signAccessToken(fakeUser);
    const { token: refresh } = jwtUtil.signRefreshToken(fakeUser);
    expect(() => jwtUtil.verifyRefreshToken(access)).toThrow();
    expect(() => jwtUtil.verifyAccessToken(refresh)).toThrow();
  });

  it('alg=none token zavrnjen', () => {
    const noneToken =
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ sub: 'attacker', type: 'access' })).toString('base64url') +
      '.';
    expect(() => jwtUtil.verifyAccessToken(noneToken)).toThrow();
  });

  it('tampered token zavrnjen', () => {
    const t = jwtUtil.signAccessToken(fakeUser);
    const tampered = t.slice(0, -5) + 'XXXXX';
    expect(() => jwtUtil.verifyAccessToken(tampered)).toThrow();
  });
});

// ============================================================
// AUTH API: REGISTER
// ============================================================
describe('POST /api/auth/register', () => {
  it('201 + vrne accessToken + nastavi cookie + uporabnik brez passwordHash', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(VALID_USER.email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(getCookie(res, 'rai_refresh_token')).toBeTruthy();

    const cookieHeader = res.headers['set-cookie'][0];
    expect(cookieHeader).toMatch(/HttpOnly/);
    expect(cookieHeader).toMatch(/Path=\/api\/auth/);
  });

  it('409 EMAIL_TAKEN za duplicate', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('400 za sibko geslo', async () => {
    const res = await registerUser({ password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 za geslo brez velike crke', async () => {
    const res = await registerUser({ password: 'lowercaseonly1' });
    expect(res.status).toBe(400);
  });

  it('400 za geslo brez stevilke', async () => {
    const res = await registerUser({ password: 'NoDigitHere!' });
    expect(res.status).toBe(400);
  });

  it('400 za invalid email', async () => {
    const res = await registerUser({ email: 'not-email' });
    expect(res.status).toBe(400);
  });

  it('400 za prazen displayName', async () => {
    const res = await registerUser({ displayName: '' });
    expect(res.status).toBe(400);
  });

  it('400 za displayName <2 znakov', async () => {
    const res = await registerUser({ displayName: 'A' });
    expect(res.status).toBe(400);
  });

  it('email se trima + lowerca', async () => {
    const res = await registerUser({ email: '  TRIM@TEST.COM  ' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('trim@test.com');
  });

  it('odpravi neznana polja iz body-ja (anti mass-assignment)', async () => {
    const res = await registerUser({ role: 'admin', isActive: false, _id: 'x' });
    expect(res.status).toBe(201);
    // role privzeto 'user' - kljub poskusu povzdiga
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.isActive).toBe(true);
  });
});

// ============================================================
// AUTH API: LOGIN
// ============================================================
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('200 + accessToken + refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(getCookie(res, 'rai_refresh_token')).toBeTruthy();
  });

  it('401 INVALID_CREDENTIALS za napacno geslo', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 INVALID_CREDENTIALS za neobstojec email - SAME generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@x.com', password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    // Confirm: identicno sporocilo kot pri napacnem geslu
    expect(res.body.error.message).toMatch(/Napacen email ali geslo/);
  });

  it('NoSQL injection {$gt:""} blocked', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });
    // mongo-sanitize odstrani $ -> Joi pa potem zavrne (ker email NI string)
    expect([400, 401]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('400 za prazno telo', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('case-insensitive email match', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email.toUpperCase(), password: VALID_USER.password });
    expect(res.status).toBe(200);
  });
});

// ============================================================
// AUTH API: ME
// ============================================================
describe('GET /api/auth/me', () => {
  let token;
  beforeEach(async () => {
    const res = await registerUser();
    token = res.body.accessToken;
  });

  it('200 + vrne user-ja s pravilnim tokenom', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_USER.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('401 NO_TOKEN brez Authorization headerja', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('401 brez "Bearer" scheme', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Basic ${token}`);
    expect(res.status).toBe(401);
  });

  it('401 INVALID_TOKEN za malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer junk');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('401 za tampered token', async () => {
    const tampered = token.slice(0, -5) + 'XXXXX';
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('401 USER_NOT_FOUND ce uporabnika izbrisemo', async () => {
    await User.deleteMany({});
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('401 USER_INACTIVE za deaktiviranega uporabnika', async () => {
    await User.updateOne({ email: VALID_USER.email }, { isActive: false });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_INACTIVE');
  });
});

// ============================================================
// AUTH API: REFRESH (rotation + reuse detection)
// ============================================================
describe('POST /api/auth/refresh', () => {
  let refreshCookie;
  beforeEach(async () => {
    const res = await registerUser();
    refreshCookie = getCookie(res, 'rai_refresh_token');
  });

  it('200 + nov access + ROTATED refresh', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    const newCookie = getCookie(res, 'rai_refresh_token');
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(refreshCookie);
  });

  it('401 NO_REFRESH_TOKEN brez cookie-ja', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });

  it('401 za invalid JWT', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'rai_refresh_token=garbage');
    expect(res.status).toBe(401);
  });

  it('REUSE detection: stari refresh po rotaciji -> 401 TOKEN_REUSE', async () => {
    // Prva rotacija
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    // Poskus reuse
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REUSE');
  });

  it('po TOKEN_REUSE: tudi NOVI refresh ne dela vec (entire chain killed)', async () => {
    const r1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    const newCookie = getCookie(r1, 'rai_refresh_token');

    // Sprozi reuse
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);

    // Tudi novi je zdaj revokan
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${newCookie}`);
    expect(res.status).toBe(401);
  });

  it('refresh token kot Bearer access NE dela', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshCookie}`);
    expect(res.status).toBe(401);
  });
});

// ============================================================
// AUTH API: LOGOUT
// ============================================================
describe('POST /api/auth/logout', () => {
  let refreshCookie;
  beforeEach(async () => {
    const res = await registerUser();
    refreshCookie = getCookie(res, 'rai_refresh_token');
  });

  it('204 + revokira sejo', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    expect(res.status).toBe(204);

    // Cookie se pociisti
    const setCookie = res.headers['set-cookie'].find((c) => /rai_refresh_token=;/.test(c));
    expect(setCookie).toBeTruthy();

    // Refresh ne dela vec
    const r = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    expect(r.status).toBe(401);
  });

  it('idempotent: logout brez cookie-ja vseeno 204', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });

  it('idempotent: dvakratni logout 204', async () => {
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `rai_refresh_token=${refreshCookie}`);
    expect(res.status).toBe(204);
  });
});

// ============================================================
// AUTH API: LOGOUT-ALL
// ============================================================
describe('POST /api/auth/logout-all', () => {
  it('revokira VSE aktivne seje uporabnika', async () => {
    const r1 = await registerUser();
    const access1 = r1.body.accessToken;
    const cookie1 = getCookie(r1, 'rai_refresh_token');

    // Drugi login (npr. iz drugega devicea) -> druga seja
    const r2 = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    const cookie2 = getCookie(r2, 'rai_refresh_token');

    expect(await Session.countDocuments({ revokedAt: null })).toBe(2);

    // logout-all z access tokenom prvega
    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${access1}`);
    expect(res.status).toBe(204);

    // Obe seji revokani
    expect(await Session.countDocuments({ revokedAt: null })).toBe(0);

    // Oba refreshov ne delata vec
    const refRes1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${cookie1}`);
    const refRes2 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `rai_refresh_token=${cookie2}`);
    expect(refRes1.status).toBe(401);
    expect(refRes2.status).toBe(401);
  });

  it('401 brez auth tokena', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// SESSION model lastnosti
// ============================================================
describe('Session model', () => {
  it('shrani sha256 hash, NE raw tokena', async () => {
    const user = new User({ email: 's@s.com', displayName: 'SS' });
    user.setPassword('Strong123');
    await user.save();
    const raw = 'super-secret-token-' + Date.now();
    const session = await Session.createForToken({
      userId: user._id,
      rawToken: raw,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(session.refreshTokenHash).not.toBe(raw);
    expect(session.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('isActive() upostevati expiresAt', async () => {
    const user = new User({ email: 's2@s.com', displayName: 'SS' });
    user.setPassword('Strong123');
    await user.save();
    const expired = await Session.createForToken({
      userId: user._id,
      rawToken: 'tok-' + Date.now(),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(expired.isActive()).toBe(false);
  });
});
