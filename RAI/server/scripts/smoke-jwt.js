/**
 * Smoke test za JWT utilities.
 * Zazeni z: node scripts/smoke-jwt.js
 */

const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  expiresInToSeconds,
} = require('../src/utils/jwt');

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    fail++;
  }
}

function expectThrow(fn, expectedName, message) {
  try {
    fn();
    check(false, `${message} (pricakovan throw, dobil success)`);
  } catch (err) {
    check(err.name === expectedName, `${message} (throw ${err.name})`);
  }
}

function main() {
  console.log('\n=== JWT smoke test ===\n');

  const fakeUser = { _id: { toString: () => '507f1f77bcf86cd799439011' }, role: 'user' };

  // 1. expiresInToSeconds
  check(expiresInToSeconds('15m') === 900, '15m -> 900s');
  check(expiresInToSeconds('7d') === 7 * 86400, '7d -> 604800s');
  check(expiresInToSeconds('1h') === 3600, '1h -> 3600s');
  check(expiresInToSeconds('30s') === 30, '30s -> 30s');
  check(expiresInToSeconds('garbage') === 0, 'garbage -> 0');
  check(expiresInToSeconds(120) === 120, 'integer pass-through');

  // 2. Sign + verify access
  const accessToken = signAccessToken(fakeUser);
  check(typeof accessToken === 'string' && accessToken.split('.').length === 3, 'access token je validen JWT format');
  const accessPayload = verifyAccessToken(accessToken);
  check(accessPayload.sub === '507f1f77bcf86cd799439011', 'access payload sub');
  check(accessPayload.type === 'access', 'access payload type');
  check(accessPayload.role === 'user', 'access payload role');
  check(accessPayload.iss === 'rai-backend', 'access payload issuer');
  check(accessPayload.aud === 'rai-api', 'access payload audience');

  // 3. Sign + verify refresh
  const { token: refreshToken, jti, expiresAt } = signRefreshToken(fakeUser);
  check(typeof refreshToken === 'string', 'refresh token je string');
  check(typeof jti === 'string' && jti.length === 32, 'jti je 16-byte hex (32 znakov)');
  check(expiresAt instanceof Date && expiresAt.getTime() > Date.now(), 'expiresAt v prihodnosti');
  const refreshPayload = verifyRefreshToken(refreshToken);
  check(refreshPayload.type === 'refresh', 'refresh payload type');
  check(refreshPayload.jti === jti, 'jti se ujema');

  // 4. Cross-secret rejection: access NE sme veljati kot refresh
  expectThrow(
    () => verifyRefreshToken(accessToken),
    'JsonWebTokenError',
    'access token ZAVRNJEN kot refresh'
  );
  expectThrow(
    () => verifyAccessToken(refreshToken),
    'JsonWebTokenError',
    'refresh token ZAVRNJEN kot access'
  );

  // 5. Tampered token
  const tampered = accessToken.slice(0, -5) + 'XXXXX';
  expectThrow(() => verifyAccessToken(tampered), 'JsonWebTokenError', 'tampered token zavrnjen');

  // 6. Algorithm 'none' attack: kreiramo token z alg=none in poskusimo verificirati
  const noneToken =
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify({ sub: 'attacker', type: 'access', iss: 'rai-backend', aud: 'rai-api' })).toString('base64url') +
    '.';
  expectThrow(() => verifyAccessToken(noneToken), 'JsonWebTokenError', 'alg=none attack zavrnjen');

  // 7. Wrong audience
  const wrongAudToken = jwt.sign(
    { sub: 'x', type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '5m', issuer: 'rai-backend', audience: 'wrong-aud' }
  );
  expectThrow(() => verifyAccessToken(wrongAudToken), 'JsonWebTokenError', 'napacna audience zavrnjena');

  // 8. Expired token (sign s preteklim expiry)
  const expiredToken = jwt.sign(
    { sub: 'x', type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '-1s', issuer: 'rai-backend', audience: 'rai-api' }
  );
  expectThrow(() => verifyAccessToken(expiredToken), 'TokenExpiredError', 'expired token zavrnjen');

  // 9. Wrong type field even with valid sig
  const wrongTypeToken = jwt.sign(
    { sub: 'x', type: 'refresh' }, // refresh type, ampak podpisan z access secret
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '5m', issuer: 'rai-backend', audience: 'rai-api' }
  );
  expectThrow(() => verifyAccessToken(wrongTypeToken), 'JsonWebTokenError', 'napacen type field zavrnjen');

  console.log(`\n=== ${pass} passed / ${fail} failed ===\n`);
  if (fail > 0) process.exit(1);
}

main();
