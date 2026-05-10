/**
 * Smoke test za processed measurements.
 *
 * Testa API endpoint GET /api/measurements/processed in
 * POST /api/measurements/aggregate (triggering aggregacija).
 *
 * Predpogoji:
 *   1. Podatki so že v bazi (preko MQTT ali HTTP ingestion-a)
 *   2. RAI server na http://localhost:5000
 *   3. MongoDB je dostopna
 *
 * Uporaba:
 *   node smoke-processed-measurements.js
 */

const http = require('http');

const BASE = 'http://localhost:5000';

let pass = 0;
let fail = 0;
const failures = [];

function req(method, path, { body, headers = {} } = {}) {
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
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = buf ? JSON.parse(buf) : null;
        } catch {
          json = buf;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(c, m) {
  if (c) {
    console.log(`  ✓ ${m}`);
    pass += 1;
  } else {
    console.error(`  ❌ FAIL: ${m}`);
    fail += 1;
    failures.push(m);
  }
}

async function main() {
  const ts = Date.now();
  const userEmail = `processed-test-${ts}@example.test`;
  let accessToken = '';
  let adminToken = '';

  console.log('\n=== Processed Measurements Test ===\n');

  // 1. Registracija navadnega uporabnika
  console.log('1. Registering user...');
  const regRes = await req('POST', '/api/auth/register', {
    body: {
      email: userEmail,
      password: 'StrongP@ss123',
      displayName: 'Processed Test User',
    },
  });
  check(regRes.status === 201, `User registration: ${regRes.status}`);
  accessToken = regRes.body.accessToken;

  // 2. Preveri da je GET /api/measurements/processed dostopen
  console.log('\n2. Testing GET /api/measurements/processed...');
  const getProcessedRes = await req('GET', '/api/measurements/processed', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(getProcessedRes.status === 200, `GET /api/measurements/processed returns 200`);
  check(
    Array.isArray(getProcessedRes.body.measurements),
    'Response has measurements array'
  );

  // 3. Registracija admin korisnika
  console.log('\n3. Registering admin user...');
  const adminEmail = `admin-test-${ts}@example.test`;
  const regAdminRes = await req('POST', '/api/auth/register', {
    body: {
      email: adminEmail,
      password: 'AdminP@ss123',
      displayName: 'Admin User',
    },
  });
  check(regAdminRes.status === 201, `Admin registration: ${regAdminRes.status}`);
  adminToken = regAdminRes.body.accessToken;

  // 4. Ročno zaži 5min agregiracijo
  console.log('\n4. Triggering 5min aggregation (admin only)...');
  const aggRes = await req('POST', '/api/measurements/aggregate', {
    body: { aggregationType: '5min' },
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  check(aggRes.status === 200, `POST /api/measurements/aggregate returns 200`);
  check(aggRes.body.message !== undefined, 'Response has message');
  if (aggRes.body.result) {
    console.log(
      `    Aggregated ${aggRes.body.result.aggregatedCount} groups, ${aggRes.body.result.devicesProcessed} devices`
    );
  }

  // 5. Preveri da ne-admin ne more triggerati agregiracijo
  console.log('\n5. Testing non-admin access (should be 403)...');
  const nonAdminAggRes = await req('POST', '/api/measurements/aggregate', {
    body: { aggregationType: '5min' },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(nonAdminAggRes.status === 403, 'Non-admin gets 403 Forbidden');

  // 6. Beri processed measurements ponovno
  console.log('\n6. Reading processed measurements after aggregation...');
  const getProcessedRes2 = await req('GET', '/api/measurements/processed', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  check(getProcessedRes2.status === 200, 'GET /api/measurements/processed returns 200');
  const processedCount = getProcessedRes2.body.measurements
    ? getProcessedRes2.body.measurements.length
    : 0;
  console.log(`    Found ${processedCount} processed measurements`);

  // 7. Testiraj filtri
  console.log('\n7. Testing filters...');
  const filteredRes = await req(
    'GET',
    '/api/measurements/processed?sensorType=gps&aggregationType=5min&limit=10',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  check(filteredRes.status === 200, 'Filtered query returns 200');

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
