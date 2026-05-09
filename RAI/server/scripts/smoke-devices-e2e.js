/**
 * E2E smoke test za devices API.
 * Zahteva: streznik tece na localhost:5000.
 *
 *   1. terminal: npm start
 *   2. terminal: node scripts/smoke-devices-e2e.js
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
  if (condition) { console.log(`  ✓ ${message}`); pass++; }
  else { console.error(`  ❌ FAIL: ${message}`); fail++; failures.push(message); }
}

async function main() {
  const ts = Date.now();
  const userA = { email: `dev-a-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'User A' };
  const userB = { email: `dev-b-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'User B' };

  console.log('\n=== E2E devices smoke test ===\n');

  // Setup uporabnikov
  const ra = await req('POST', '/api/auth/register', { body: userA });
  check(ra.status === 201, `setup: register A (${ra.status})`);
  const ta = ra.body.accessToken;

  const rb = await req('POST', '/api/auth/register', { body: userB });
  check(rb.status === 201, `setup: register B (${rb.status})`);
  const tb = rb.body.accessToken;

  // 1. POST /api/devices brez auth -> 401
  let r = await req('POST', '/api/devices', { body: { deviceId: `dev-${ts}-x` } });
  check(r.status === 401, `1. POST brez auth -> 401 (got ${r.status})`);

  // 2. POST happy path
  r = await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: `dev-${ts}-1`, name: 'Pixel 8', platform: 'android' },
  });
  check(r.status === 201, `2. POST -> 201 (got ${r.status})`);
  check(r.body.device && r.body.device.deviceId === `dev-${ts}-1`, '   - vrne pravi deviceId');
  const deviceA1Id = r.body.device._id;

  // 3. POST z istim deviceId od ISTEGA userja -> 200 (idempotent)
  r = await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: `dev-${ts}-1`, name: 'Renamed Pixel' },
  });
  check(r.status === 200, `3. POST idempotent -> 200 (got ${r.status})`);
  check(r.body.device.name === 'Renamed Pixel', '   - posodobi metapodatke');

  // 4. POST z istim deviceId od DRUGEGA userja -> 409
  r = await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${tb}` },
    body: { deviceId: `dev-${ts}-1` },
  });
  check(r.status === 409, `4. POST collision drugi user -> 409 (got ${r.status})`);
  check(r.body.error.code === 'DEVICE_ID_TAKEN', '   - code DEVICE_ID_TAKEN');

  // 5. POST invalid deviceId
  r = await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: 'has spaces' },
  });
  check(r.status === 400, `5. POST invalid deviceId -> 400 (got ${r.status})`);

  // 6. POST drugi napravi
  await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: `dev-${ts}-2`, platform: 'ios' },
  });
  await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: `dev-${ts}-3`, platform: 'android' },
  });

  // 7. GET /api/devices brez auth -> 401
  r = await req('GET', '/api/devices');
  check(r.status === 401, `7. GET brez auth -> 401 (got ${r.status})`);

  // 8. GET vrne user-jeve naprave (vse 3, ne videti userB-jevih)
  r = await req('GET', '/api/devices', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 200, `8. GET list -> 200 (got ${r.status})`);
  // Ker test ostaja v isti DB kot prejsni runi, lahko obstajajo stare naprave -
  // preverimo SAMO da NASE 3 so notri.
  const myDeviceIds = r.body.devices.map(d => d.deviceId).filter(id => id.startsWith(`dev-${ts}-`));
  check(myDeviceIds.length === 3, `   - 3 nase naprave (${myDeviceIds.length})`);

  // 9. GET vrne SAMO user-jeve, ne tujih (B-jeve registriramo)
  await req('POST', '/api/devices', {
    headers: { Authorization: `Bearer ${tb}` },
    body: { deviceId: `dev-${ts}-bdevice` },
  });
  r = await req('GET', '/api/devices', { headers: { Authorization: `Bearer ${ta}` } });
  const aSeesBs = r.body.devices.find(d => d.deviceId === `dev-${ts}-bdevice`);
  check(!aSeesBs, '9. user A NE vidi user B-jevih naprav');

  // 10. GET filter platform=ios
  r = await req('GET', '/api/devices?platform=ios', { headers: { Authorization: `Bearer ${ta}` } });
  const iosOnly = r.body.devices.filter(d => d.deviceId.startsWith(`dev-${ts}-`));
  check(iosOnly.every(d => d.platform === 'ios'), '10. filter platform=ios deluje');

  // 11. GET cursor paginacija
  r = await req('GET', '/api/devices?limit=1', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.body.devices.length === 1, '11. limit=1 vrne 1 napravo');
  check(r.body.pagination.hasMore === true, '    - hasMore=true');
  check(r.body.pagination.nextCursor, '    - nextCursor podan');

  // 12. GET /api/devices/:id (lastnistvo OK)
  r = await req('GET', `/api/devices/${deviceA1Id}`, { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 200, `12. GET by id (own) -> 200 (got ${r.status})`);

  // 13. GET /api/devices/:id (tuja naprava) -> 404 (anti-enumeration)
  r = await req('GET', `/api/devices/${deviceA1Id}`, { headers: { Authorization: `Bearer ${tb}` } });
  check(r.status === 404, `13. GET by id (tuja) -> 404 (got ${r.status})`);

  // 14. GET /api/devices/:id (neobstojec ObjectId) -> 404
  r = await req('GET', '/api/devices/507f1f77bcf86cd799439011', {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 404, `14. GET by id (neobstojec) -> 404 (got ${r.status})`);

  // 15. GET /api/devices/:id (invalid ObjectId format) -> 400 validation
  r = await req('GET', '/api/devices/not-a-valid-id', {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 400, `15. GET by id (invalid format) -> 400 (got ${r.status})`);

  // 16. PATCH happy
  r = await req('PATCH', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${ta}` },
    body: { name: 'Updated Name', isActive: false },
  });
  check(r.status === 200, `16. PATCH -> 200 (got ${r.status})`);
  check(r.body.device.name === 'Updated Name' && r.body.device.isActive === false, '    - polja posodobljena');

  // 17. PATCH prazno telo -> 400
  r = await req('PATCH', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${ta}` },
    body: {},
  });
  check(r.status === 400, `17. PATCH empty body -> 400 (got ${r.status})`);

  // 18. PATCH tuja naprava -> 404
  r = await req('PATCH', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${tb}` },
    body: { name: 'evil' },
  });
  check(r.status === 404, `18. PATCH tuja -> 404 (got ${r.status})`);

  // 19. PATCH ne sme spreminjati deviceId / userId (mass-assignment block)
  r = await req('PATCH', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${ta}` },
    body: { deviceId: 'EVIL', userId: '507f1f77bcf86cd799439099' },
  });
  // Joi shema te field-e odstrani -> ostane prazno -> 400
  check(r.status === 400, `19. PATCH z deviceId/userId polji -> 400 stripUnknown (got ${r.status})`);

  // 20. DELETE tuja -> 404
  r = await req('DELETE', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${tb}` },
  });
  check(r.status === 404, `20. DELETE tuja -> 404 (got ${r.status})`);

  // 21. DELETE happy
  r = await req('DELETE', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 204, `21. DELETE -> 204 (got ${r.status})`);

  // 22. GET izbrisane -> 404
  r = await req('GET', `/api/devices/${deviceA1Id}`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 404, `22. GET izbrisane -> 404 (got ${r.status})`);

  // 23. NoSQL injection v query string
  r = await req('GET', '/api/devices?platform[$ne]=android', {
    headers: { Authorization: `Bearer ${ta}` },
  });
  // mongo-sanitize strip-i $ne, Joi pa potem zavrne objekt-platform
  check([200, 400].includes(r.status) && r.status !== 500, `23. NoSQL inj v query: ne 500 (got ${r.status})`);

  console.log(`\n=== ${pass} passed / ${fail} failed ===`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(err => { console.error('E2E error:', err); process.exit(1); });
