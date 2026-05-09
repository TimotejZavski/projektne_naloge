/**
 * E2E smoke test za GET /api/measurements + /api/devices/:id/measurements
 * + /api/measurements/:id.
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
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
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
  const userA = { email: `mr-a-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'M Reader A' };
  const userB = { email: `mr-b-${ts}@example.test`, password: 'StrongP@ss123', displayName: 'M Reader B' };

  console.log('\n=== Measurement read E2E ===\n');

  const ra = await req('POST', '/api/auth/register', { body: userA });
  const ta = ra.body.accessToken;
  const rb = await req('POST', '/api/auth/register', { body: userB });
  const tb = rb.body.accessToken;
  check(ra.status === 201 && rb.status === 201, 'setup users OK');

  const devAId = `mr-${ts}-dev-a`;
  const devBId = `mr-${ts}-dev-b`;
  const devARes = await req('POST', '/api/devices', { headers: { Authorization: `Bearer ${ta}` }, body: { deviceId: devAId } });
  const devBRes = await req('POST', '/api/devices', { headers: { Authorization: `Bearer ${tb}` }, body: { deviceId: devBId } });
  const devAObjectId = devARes.body.device._id;

  // Vstavi 30 GPS meritev za napravo A (5 sekund nazaj, vsako 100ms)
  const gpsBatch = Array.from({ length: 30 }, (_, i) => ({
    schemaVersion: '1.0', deviceId: devAId, sensorType: 'gps',
    timestampUtc: new Date(Date.now() - 5000 + i * 100).toISOString(),
    data: { latitude: 46 + i * 0.001, longitude: 15 + i * 0.001 },
  }));
  await req('POST', '/api/measurements/batch', { headers: { Authorization: `Bearer ${ta}` }, body: { measurements: gpsBatch } });

  // 20 accel za napravo A
  const accelBatch = Array.from({ length: 20 }, (_, i) => ({
    schemaVersion: '1.0', deviceId: devAId, sensorType: 'accelerometer',
    timestampUtc: new Date(Date.now() - 3000 + i * 100).toISOString(),
    data: { x: i * 0.01, y: 0, z: 9.81 },
  }));
  await req('POST', '/api/measurements/batch', { headers: { Authorization: `Bearer ${ta}` }, body: { measurements: accelBatch } });

  // 10 GPS za B
  const bBatch = Array.from({ length: 10 }, (_, i) => ({
    schemaVersion: '1.0', deviceId: devBId, sensorType: 'gps',
    timestampUtc: new Date(Date.now() - 2000 + i * 100).toISOString(),
    data: { latitude: 50, longitude: 14 },
  }));
  await req('POST', '/api/measurements/batch', { headers: { Authorization: `Bearer ${tb}` }, body: { measurements: bBatch } });

  // 1. GET brez auth
  let r = await req('GET', '/api/measurements');
  check(r.status === 401, `1. GET brez auth -> 401 (got ${r.status})`);

  // 2. GET vse - vidi SAMO svoje (50, ne 60)
  r = await req('GET', '/api/measurements?limit=1000', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 200, `2. GET list -> 200 (got ${r.status})`);
  const myCount = r.body.measurements.filter(m => m.deviceId === devAId).length;
  const bCount = r.body.measurements.filter(m => m.deviceId === devBId).length;
  check(myCount === 50, `   - vidi 50 svojih meritev (got ${myCount})`);
  check(bCount === 0, '   - NE vidi B-jevih');

  // 3. Filter sensorType=gps -> 30
  r = await req('GET', '/api/measurements?sensorType=gps&limit=1000', { headers: { Authorization: `Bearer ${ta}` } });
  const gpsCount = r.body.measurements.filter(m => m.deviceId === devAId).length;
  check(gpsCount === 30, `3. filter sensorType=gps -> 30 (got ${gpsCount})`);

  // 4. Filter sensorType=accelerometer -> 20
  r = await req('GET', '/api/measurements?sensorType=accelerometer&limit=1000', { headers: { Authorization: `Bearer ${ta}` } });
  const accelCount = r.body.measurements.filter(m => m.deviceId === devAId).length;
  check(accelCount === 20, `4. filter sensorType=accelerometer -> 20 (got ${accelCount})`);

  // 5. Filter deviceId
  r = await req('GET', `/api/measurements?deviceId=${devAId}&limit=1000`, { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 200 && r.body.measurements.length === 50, `5. filter deviceId own -> 50 (got ${r.body.measurements?.length})`);

  // 6. Filter deviceId tuje -> 404 (anti-enumeration)
  r = await req('GET', `/api/measurements?deviceId=${devBId}`, { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 404, `6. filter deviceId tuje -> 404 (got ${r.status})`);

  // 7. Filter deviceId neobstojec -> 404
  r = await req('GET', '/api/measurements?deviceId=not-existent-xyz', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 404, `7. filter deviceId neobstojec -> 404 (got ${r.status})`);

  // 8. Time range filter
  const from = new Date(Date.now() - 4000).toISOString();
  r = await req('GET', `/api/measurements?from=${encodeURIComponent(from)}&limit=1000`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  // Vsi zapisi z timestampUtc >= from (cca zadnjih 4s)
  const inRange = r.body.measurements.every(m => new Date(m.timestampUtc).getTime() >= new Date(from).getTime() - 1);
  check(inRange, '8. from filter pravilno');
  check(r.body.measurements.length > 0 && r.body.measurements.length < 50, `   - vrne podmnozico (got ${r.body.measurements.length})`);

  // 9. Time range to>from
  const past = new Date(Date.now() - 4000).toISOString();
  const future = new Date(Date.now() - 1000).toISOString();
  r = await req('GET', `/api/measurements?from=${encodeURIComponent(future)}&to=${encodeURIComponent(past)}`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 400, `9. to<from -> 400 (got ${r.status})`);

  // 10. Limit > 1000 -> 400
  r = await req('GET', '/api/measurements?limit=5000', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 400, `10. limit>1000 -> 400 (got ${r.status})`);

  // 11. Cursor paginacija desc (default)
  r = await req('GET', '/api/measurements?limit=10', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.body.measurements.length === 10, `11. limit=10 -> 10 zapisov`);
  check(r.body.pagination.hasMore === true, '    - hasMore=true');
  check(r.body.pagination.nextCursor, '    - nextCursor podan');
  const firstPageLastTs = new Date(r.body.measurements[r.body.measurements.length - 1].timestampUtc).getTime();

  // 12. Naslednja stran
  r = await req('GET', `/api/measurements?limit=10&cursor=${r.body.pagination.nextCursor}`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.body.measurements.length === 10, '12. naslednja stran -> 10 zapisov');
  // Pri sort=desc je naslednja stran starejsa od prejsne
  const secondPageFirstTs = new Date(r.body.measurements[0].timestampUtc).getTime();
  check(secondPageFirstTs <= firstPageLastTs, '    - druga stran je casovno starejsa');

  // 13. Sort=asc
  r = await req('GET', '/api/measurements?limit=5&sort=asc', { headers: { Authorization: `Bearer ${ta}` } });
  const ascDates = r.body.measurements.map(m => new Date(m.timestampUtc).getTime());
  const isAsc = ascDates.every((t, i) => i === 0 || t >= ascDates[i - 1]);
  check(isAsc, '13. sort=asc je naracajoc');

  // 14. Invalid sort
  r = await req('GET', '/api/measurements?sort=banana', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 400, `14. sort=banana -> 400 (got ${r.status})`);

  // 15. GET /api/devices/:id/measurements (own)
  r = await req('GET', `/api/devices/${devAObjectId}/measurements?limit=1000`, {
    headers: { Authorization: `Bearer ${ta}` },
  });
  check(r.status === 200 && r.body.measurements.length === 50, `15. /devices/:id/measurements own -> 50 (got ${r.body.measurements?.length})`);

  // 16. GET /api/devices/:id/measurements (tuja) -> 404
  r = await req('GET', `/api/devices/${devAObjectId}/measurements`, {
    headers: { Authorization: `Bearer ${tb}` },
  });
  check(r.status === 404, `16. /devices/:id/measurements tuja -> 404 (got ${r.status})`);

  // 17. GET /api/measurements/:id (own)
  const allMy = await req('GET', '/api/measurements?limit=1', { headers: { Authorization: `Bearer ${ta}` } });
  const oneId = allMy.body.measurements[0]._id;
  r = await req('GET', `/api/measurements/${oneId}`, { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 200, `17. GET measurement by id (own) -> 200 (got ${r.status})`);

  // 18. GET /api/measurements/:id (tuja) -> 404
  r = await req('GET', `/api/measurements/${oneId}`, { headers: { Authorization: `Bearer ${tb}` } });
  check(r.status === 404, `18. GET measurement by id (tuja) -> 404 (got ${r.status})`);

  // 19. GET /api/measurements/:id (neobstojec) -> 404
  r = await req('GET', '/api/measurements/507f1f77bcf86cd799439099', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 404, `19. GET measurement by id (neobstojec) -> 404 (got ${r.status})`);

  // 20. GET /api/measurements/:id (invalid format) -> 400
  r = await req('GET', '/api/measurements/notvalid', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 400, `20. GET measurement by id (invalid) -> 400 (got ${r.status})`);

  // 21. Invalid cursor v query -> 400
  r = await req('GET', '/api/measurements?cursor=notvalid', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 400, `21. invalid cursor -> 400 (got ${r.status})`);

  // 22. Invalid sensorType -> 400
  r = await req('GET', '/api/measurements?sensorType=temperature', { headers: { Authorization: `Bearer ${ta}` } });
  check(r.status === 400, `22. invalid sensorType -> 400 (got ${r.status})`);

  console.log(`\n=== ${pass} passed / ${fail} failed ===`);
  if (fail > 0) {
    console.log('\nFailures:'); failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(err => { console.error('E2E error:', err); process.exit(1); });
