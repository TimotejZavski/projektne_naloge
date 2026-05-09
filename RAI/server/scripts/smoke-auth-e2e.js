/**
 * E2E smoke test za auth API - poganjamo proti zivemu strezniku.
 * Zahteva: streznik tece na localhost:5000.
 *
 * Uporaba:
 *   1. v enem terminalu: npm start
 *   2. v drugem:         node scripts/smoke-auth-e2e.js
 *
 * Lahko pa skripta sama starta in ustavi server (USE_INPROCESS=1).
 */

const http = require('http');

const BASE = 'http://localhost:5000';

let pass = 0;
let fail = 0;
const failures = [];

function req(method, path, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try { json = buf ? JSON.parse(buf) : null; } catch { json = buf; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    fail++;
    failures.push(message);
  }
}

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const c of arr) {
    const m = c.match(new RegExp('^' + name + '=([^;]+)'));
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const EMAIL = `e2e-${Date.now()}@example.test`;
  const PASS = 'StrongP@ss123';
  let accessToken;
  let refreshCookieRaw;     // celoten cookie value
  let refreshCookieAfterLogin;

  console.log(`\n=== E2E auth smoke test (email: ${EMAIL}) ===\n`);

  // 1. REGISTER (happy path)
  let r = await req('POST', '/api/auth/register', {
    body: { email: EMAIL, password: PASS, displayName: 'E2E Tester' },
  });
  check(r.status === 201, `1. REGISTER 201 (got ${r.status})`);
  check(r.body && r.body.accessToken, '   - vrne accessToken');
  check(r.body && r.body.user && r.body.user.email === EMAIL.toLowerCase(), '   - vrne user.email lowercase');
  check(r.body && r.body.user && !r.body.user.passwordHash, '   - user NIMA passwordHash');
  refreshCookieRaw = extractCookie(r.headers['set-cookie'], 'rai_refresh_token');
  check(!!refreshCookieRaw, '   - postavi rai_refresh_token cookie');
  const setCookieHeader = r.headers['set-cookie'] && r.headers['set-cookie'][0];
  check(/HttpOnly/i.test(setCookieHeader || ''), '   - cookie HttpOnly');
  check(/Path=\/api\/auth/i.test(setCookieHeader || ''), '   - cookie Path=/api/auth');
  accessToken = r.body && r.body.accessToken;

  // 2. REGISTER duplicate email -> 409
  r = await req('POST', '/api/auth/register', {
    body: { email: EMAIL, password: PASS, displayName: 'Dup' },
  });
  check(r.status === 409, `2. duplicate email -> 409 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'EMAIL_TAKEN', '   - code EMAIL_TAKEN');

  // 3. REGISTER weak password -> 400
  r = await req('POST', '/api/auth/register', {
    body: { email: `weak-${Date.now()}@x.com`, password: 'short', displayName: 'X' },
  });
  check(r.status === 400, `3. weak password -> 400 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'VALIDATION_ERROR', '   - code VALIDATION_ERROR');

  // 4. REGISTER invalid email -> 400
  r = await req('POST', '/api/auth/register', {
    body: { email: 'not-an-email', password: 'StrongP@ss123', displayName: 'X' },
  });
  check(r.status === 400, `4. invalid email -> 400 (got ${r.status})`);

  // 5. REGISTER missing fields -> 400
  r = await req('POST', '/api/auth/register', { body: { email: 'a@b.com' } });
  check(r.status === 400, `5. missing fields -> 400 (got ${r.status})`);

  // 6. ME with valid token
  r = await req('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
  check(r.status === 200, `6. ME with token -> 200 (got ${r.status})`);
  check(r.body && r.body.user && r.body.user.email === EMAIL.toLowerCase(), '   - vrne pravega usera');

  // 7. ME without token -> 401
  r = await req('GET', '/api/auth/me');
  check(r.status === 401, `7. ME bez tokena -> 401 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'NO_TOKEN', '   - code NO_TOKEN');

  // 8. ME with malformed token -> 401
  r = await req('GET', '/api/auth/me', { headers: { Authorization: 'Bearer junk-token' } });
  check(r.status === 401, `8. ME malformed token -> 401 (got ${r.status})`);

  // 9. ME with wrong scheme -> 401
  r = await req('GET', '/api/auth/me', { headers: { Authorization: 'Basic abc' } });
  check(r.status === 401, `9. ME Basic scheme -> 401 (got ${r.status})`);

  // 10. LOGIN happy path
  r = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASS } });
  check(r.status === 200, `10. LOGIN -> 200 (got ${r.status})`);
  check(r.body && r.body.accessToken, '    - vrne accessToken');
  refreshCookieAfterLogin = extractCookie(r.headers['set-cookie'], 'rai_refresh_token');
  check(!!refreshCookieAfterLogin, '    - postavi nov refresh cookie');
  accessToken = r.body && r.body.accessToken;

  // 11. LOGIN wrong password -> 401, generic
  r = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: 'WrongPass1' } });
  check(r.status === 401, `11. wrong password -> 401 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'INVALID_CREDENTIALS', '    - generic INVALID_CREDENTIALS');

  // 12. LOGIN nonexistent email -> 401, EXACTLY same generic
  r = await req('POST', '/api/auth/login', {
    body: { email: 'nonexistent-' + Date.now() + '@x.com', password: 'WhateverPass1' },
  });
  check(r.status === 401, `12. nonexistent email -> 401 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'INVALID_CREDENTIALS', '    - SAME generic INVALID_CREDENTIALS (anti-enumeration)');

  // 13. LOGIN with NoSQL injection attempt -> 400 (mongo-sanitize odstrani $)
  r = await req('POST', '/api/auth/login', {
    body: { email: { $gt: '' }, password: { $gt: '' } },
  });
  check(r.status === 400 || r.status === 401, `13. NoSQL injection {$gt:''} -> NOT 200 (got ${r.status})`);

  // 14. LOGIN missing body
  r = await req('POST', '/api/auth/login', { body: {} });
  check(r.status === 400, `14. missing body -> 400 (got ${r.status})`);

  // 15. REFRESH with valid cookie -> nov access + nov refresh
  r = await req('POST', '/api/auth/refresh', {
    cookie: `rai_refresh_token=${refreshCookieAfterLogin}`,
  });
  check(r.status === 200, `15. REFRESH valid -> 200 (got ${r.status})`);
  check(r.body && r.body.accessToken && r.body.accessToken !== accessToken, '    - nov access token');
  const refreshCookieAfterRefresh = extractCookie(r.headers['set-cookie'], 'rai_refresh_token');
  check(!!refreshCookieAfterRefresh && refreshCookieAfterRefresh !== refreshCookieAfterLogin, '    - rotated refresh cookie');
  const newAccess = r.body && r.body.accessToken;

  // 16. REFRESH with OLD (now-rotated) cookie -> 401 TOKEN_REUSE
  r = await req('POST', '/api/auth/refresh', {
    cookie: `rai_refresh_token=${refreshCookieAfterLogin}`,
  });
  check(r.status === 401, `16. REUSE old refresh -> 401 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'TOKEN_REUSE', '    - code TOKEN_REUSE');

  // 17. After reuse, EVEN the new refresh should be revoked too -> 401
  r = await req('POST', '/api/auth/refresh', {
    cookie: `rai_refresh_token=${refreshCookieAfterRefresh}`,
  });
  check(r.status === 401, `17. po TOKEN_REUSE: tudi nov refresh -> 401 (got ${r.status})`);

  // 18. REFRESH without cookie -> 401
  r = await req('POST', '/api/auth/refresh');
  check(r.status === 401, `18. REFRESH bez cookie -> 401 (got ${r.status})`);
  check(r.body && r.body.error && r.body.error.code === 'NO_REFRESH_TOKEN', '    - code NO_REFRESH_TOKEN');

  // 19. LOGIN znova za logout test
  r = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASS } });
  check(r.status === 200, `19. relogin -> 200 (got ${r.status})`);
  const refreshForLogout = extractCookie(r.headers['set-cookie'], 'rai_refresh_token');
  const accessForLogout = r.body && r.body.accessToken;

  // 20. LOGOUT -> 204
  r = await req('POST', '/api/auth/logout', { cookie: `rai_refresh_token=${refreshForLogout}` });
  check(r.status === 204, `20. LOGOUT -> 204 (got ${r.status})`);
  const cookieClear = (r.headers['set-cookie'] || []).find((c) => /rai_refresh_token=;/.test(c));
  check(!!cookieClear, '    - clearCookie postavi prazen cookie');

  // 21. REFRESH after logout -> 401
  r = await req('POST', '/api/auth/refresh', { cookie: `rai_refresh_token=${refreshForLogout}` });
  check(r.status === 401, `21. REFRESH po logoutu -> 401 (got ${r.status})`);

  // 22. ME se vedno deluje z access tokenom (kratko zivljenje, ni revokan)
  r = await req('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${accessForLogout}` } });
  check(r.status === 200, `22. ME z access pred poteki -> 200 (got ${r.status})`);
  // To je pravilno - access token je stateless in se ne revoka.
  // V produkciji ga klient ob logoutu zavrze sam.

  // 23. logout je idempotent
  r = await req('POST', '/api/auth/logout');
  check(r.status === 204, `23. LOGOUT bez cookie (idempotent) -> 204 (got ${r.status})`);

  // 24. Reuse of refresh token kot Authorization Bearer -> 401 (cross-type rejection)
  r = await req('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${refreshForLogout}` } });
  check(r.status === 401, `24. refresh token KOT access bearer -> 401 (got ${r.status})`);

  // ===== ZAKLJUCEK =====
  console.log(`\n=== ${pass} passed / ${fail} failed ===`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('E2E test error:', err);
  process.exit(1);
});
