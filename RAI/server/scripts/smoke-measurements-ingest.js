/**
 * E2E smoke test za POST /api/measurements + /api/measurements/batch.
 *
 * Pricakuje ziv server na localhost:5000.
 */

const http = require('http');

const BASE = 'http://localhost:5000';

let pass = 0; let fail = 0; const failures = [];

function req(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: {
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json; try { json = buf ? JSON.parse(buf) : null; } catch { json = buf; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(c, m) { if (c) { console.log(`  ✓ ${m}`); pass++; } else { console.error(`  ❌ FAIL: ${m}`); fail++; failures.push(m); } }

async function main() {
  const ts = Date.now();
  const userA = { email: `mi-a-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'M Tester A' };
  const userB = { email: `mi-b-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'M Tester B' };

  console.log('\n=== Measurement ingestion E2E ===\n');

  const ra = await req('POST', '/api/auth/register', { body: userA });
  const ta = ra.body.accessToken;
  check(ra.status === 201, `setup A (${ra.status})`);

  const rb = await req('POST', '/api/auth/register', { body: userB });
  const tb = rb.body.accessToken;
  check(rb.status === 201, `setup B (${rb.status})`);

  const devAId = `mi-${ts}-dev-a`;
  const devBId = `mi-${ts}-dev-b`;
  await req('POST', '/api/devices', { headers: { Authorization: `Bearer ${ta}` }, body: { deviceId: devAId, platform: 'android' } });
  await req('POST', '/api/devices', { headers: { Authorization: `Bearer ${tb}` }, body: { deviceId: devBId, platform: 'ios' } });

  const validGps = {
    schemaVersion: '1.0',
    deviceId: devAId,
    sensorType: 'gps',
    timestampUtc: new Date(Date.now() - 1000).toISOString(),
    data: { latitude: 46.5547, longitude: 15.6459, accuracyMeters: 5 },
  };

  const validAccel = {
    schemaVersion: '1.0',
    deviceId: devAId,
    sensorType: 'accelerometer',
    timestampUtc: new Date(Date.now() - 500).toISOString(),
    data: { x: 0.01, y: -0.02, z: 9.81, unit: 'm/s2' },
  };

  // 1. POST single brez auth -> 401
  let r = await req('POST', '/api/measurements', { body: validGps });
  check(r.status === 401, `1. POST single brez auth -> 401 (got ${r.status})`);

  // 2. POST single GPS - happy
  r = await req('POST', '/api/measurements', { headers: { Authorization: `Bearer ${ta}` }, body: validGps });
  check(r.status === 201, `2. POST GPS happy -> 201 (got ${r.status})`);
  check(r.body.measurement && r.body.measurement.sensorType === 'gps', '   - vrne meritev z sensorType=gps');
  check(r.body.measurement.source === 'http', '   - source=http');
  check(r.body.measurement.userId, '   - userId vstavljen');

  // 3. POST single accel - happy
  r = await req('POST', '/api/measurements', { headers: { Authorization: `Bearer ${ta}` }, body: validAccel });
  check(r.status === 201, `3. POST accel happy -> 201 (got ${r.status})`);

  // 4. POST single z TUJI deviceId -> 404 (ownership)
  const stolen = { ...validGps, deviceId: devBId };
  r = await req('POST', '/api/measurements', { headers: { Authorization: `Bearer ${ta}` }, body: stolen });
  check(r.status === 404, `4. POST tuji deviceId -> 404 (got ${r.status})`);
  check(r.body.error.code === 'DEVICE_NOT_FOUND', '   - code DEVICE_NOT_FOUND');

  // 5. POST single z neobstojeco napravo -> 404
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, deviceId: 'nonexistent-device-xyz' },
  });
  check(r.status === 404, `5. POST neobstojec deviceId -> 404 (got ${r.status})`);

  // 6. POST single z napacnim sensorType -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, sensorType: 'temperature' },
  });
  check(r.status === 400, `6. POST nepoznan sensorType -> 400 (got ${r.status})`);

  // 7. POST GPS z latitude izven obsega -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, data: { latitude: 95, longitude: 0 } },
  });
  check(r.status === 400, `7. POST GPS lat>90 -> 400 (got ${r.status})`);

  // 8. POST GPS z manjkajoci longitude -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, data: { latitude: 46.5 } },
  });
  check(r.status === 400, `8. POST GPS bez longitude -> 400 (got ${r.status})`);

  // 9. POST accel z napacno strukturo (lat/lng namesto xyz) -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validAccel, data: { latitude: 46, longitude: 15 } },
  });
  check(r.status === 400, `9. POST accel z gps data -> 400 (got ${r.status})`);

  // 10. POST z timestampUtc v prihodnosti -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, timestampUtc: new Date(Date.now() + 3600_000).toISOString() },
  });
  check(r.status === 400, `10. POST timestamp v prihodnosti -> 400 (got ${r.status})`);

  // 11. POST z napacnim ISO formatom -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, timestampUtc: 'not-a-date' },
  });
  check(r.status === 400, `11. POST timestamp not-iso -> 400 (got ${r.status})`);

  // 12. POST z dodatnim poljem v data (strict) -> 400
  r = await req('POST', '/api/measurements', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { ...validGps, data: { latitude: 46, longitude: 15, evilField: 'x' } },
  });
  check(r.status === 400, `12. POST GPS dodatno polje -> 400 (got ${r.status})`);

  // 13. BATCH brez auth -> 401
  r = await req('POST', '/api/measurements/batch', { body: { measurements: [validGps] } });
  check(r.status === 401, `13. BATCH brez auth -> 401 (got ${r.status})`);

  // 14. BATCH happy
  const batch10 = Array.from({ length: 10 }, (_, i) => ({
    schemaVersion: '1.0',
    deviceId: devAId,
    sensorType: 'gps',
    timestampUtc: new Date(Date.now() - (i + 1) * 1000).toISOString(),
    data: { latitude: 46.5 + i * 0.001, longitude: 15.6 + i * 0.001 },
  }));
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: batch10 },
  });
  check(r.status === 201, `14. BATCH 10 -> 201 (got ${r.status})`);
  check(r.body.insertedCount === 10, `    - insertedCount=10 (got ${r.body.insertedCount})`);
  check(r.body.rejectedCount === 0, '    - rejectedCount=0');

  // 15. BATCH max 100 - happy
  const batch100 = Array.from({ length: 100 }, (_, i) => ({
    schemaVersion: '1.0',
    deviceId: devAId,
    sensorType: 'accelerometer',
    timestampUtc: new Date(Date.now() - (i + 1) * 100).toISOString(),
    data: { x: i * 0.01, y: 0, z: 9.81 },
  }));
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: batch100 },
  });
  check(r.status === 201, `15. BATCH 100 -> 201 (got ${r.status})`);
  check(r.body.insertedCount === 100, `    - insertedCount=100 (got ${r.body.insertedCount})`);

  // 16. BATCH 101 -> 400
  const batch101 = [...batch100, { ...batch100[0], timestampUtc: new Date().toISOString() }];
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: batch101 },
  });
  check(r.status === 400, `16. BATCH 101 -> 400 (got ${r.status})`);

  // 17. BATCH prazen array -> 400
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: [] },
  });
  check(r.status === 400, `17. BATCH empty -> 400 (got ${r.status})`);

  // 18. BATCH partial-success: 5 svojih + 1 tuja
  const mixed = [
    ...batch10.slice(0, 5),
    { ...validGps, deviceId: devBId },
  ];
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: mixed },
  });
  check(r.status === 201, `18. BATCH partial -> 201 (got ${r.status})`);
  check(r.body.insertedCount === 5 && r.body.rejectedCount === 1, `    - 5 vstavljenih, 1 zavrnjena`);
  check(r.body.rejected[0].deviceId === devBId, '    - rejected[0] = tuji deviceId');

  // 19. BATCH vse tuje -> 404
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: [{ ...validGps, deviceId: devBId }] },
  });
  check(r.status === 404, `19. BATCH vse tuje -> 404 (got ${r.status})`);
  check(r.body.error.code === 'NO_OWNED_DEVICES', '    - code NO_OWNED_DEVICES');

  // 20. BATCH z eno nevalidno meritvijo -> 400 (Joi zavrne CELOTEN batch)
  r = await req('POST', '/api/measurements/batch', {
    headers: { Authorization: `Bearer ${ta}` },
    body: { measurements: [validGps, { ...validGps, sensorType: 'temperature' }] },
  });
  check(r.status === 400, `20. BATCH z 1 nevalidno -> 400 (got ${r.status})`);

  // 21. lastSeenAtUtc se posodobi po ingestion-u
  const dr = await req('GET', '/api/devices', { headers: { Authorization: `Bearer ${ta}` } });
  const myDev = dr.body.devices.find(d => d.deviceId === devAId);
  check(myDev && new Date(myDev.lastSeenAtUtc).getTime() > Date.now() - 5000, '21. lastSeenAtUtc je svez');

  console.log(`\n=== ${pass} passed / ${fail} failed ===`);
  if (fail > 0) {
    console.log('\nFailures:'); failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(err => { console.error('E2E error:', err); process.exit(1); });
