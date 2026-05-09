/**
 * JWT utility - signing in verification access in refresh tokenov.
 *
 * Locena secret-a (`JWT_ACCESS_SECRET` vs `JWT_REFRESH_SECRET`) zagotovita,
 * da access token NE more biti uporabljen kot refresh token (in obratno) -
 * tudi ce algorithm ali payload nakljucno sovpadata.
 *
 * Algoritem: HS256 (HMAC SHA-256). Eksplicitno fiksiran in preverjen,
 * da prepreci 'none' algorithm napad in algorithm-confusion napade.
 *
 * `issuer` in `audience` polja so dodatna varnostna mreza: tudi ce nekdo
 * ukrade secret iz drugega projekta z istim algoritmom, token se vedno
 * ne bo veljaven (audience mismatch).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'rai-backend';
const ACCESS_AUDIENCE = 'rai-api';
const REFRESH_AUDIENCE = 'rai-refresh';
const ALGORITHM = 'HS256';

/**
 * Pretvori "15m", "7d", "1h" v sekunde. Ce je vrednost ze stevilo, jo vrne.
 * Privzeto: 0 (nemudoma potece).
 */
function expiresInToSeconds(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const match = value.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * multipliers[unit];
}

/**
 * Podpisi access token. V payloadu samo nujno (sub, role).
 * Access tokeni so kratki -> v primeru kompromisa hitro postanejo neuporabni.
 */
function signAccessToken(user) {
  if (!user || !user._id) throw new Error('signAccessToken: user._id manjka');
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role || 'user',
      type: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    }
  );
}

/**
 * Podpisi refresh token + vrne tudi `expiresAt` (Date), da klicatelj
 * lahko ustvari Session zapis z istim potekom.
 *
 * `jti` (JWT ID) je nakljucni 128-bit identifikator - omogoca identifikacijo
 * specificnega tokena v primeru rotacije.
 */
function signRefreshToken(user) {
  if (!user || !user._id) throw new Error('signRefreshToken: user._id manjka');
  const jti = crypto.randomBytes(16).toString('hex');
  const expiresInSec = expiresInToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  if (expiresInSec <= 0) {
    throw new Error('JWT_REFRESH_EXPIRES_IN ima neveljavno vrednost.');
  }
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      type: 'refresh',
      jti,
    },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: ISSUER,
      audience: REFRESH_AUDIENCE,
    }
  );

  return { token, jti, expiresAt };
}

/**
 * Verificiraj access token. Vrne payload ali vrze JsonWebTokenError /
 * TokenExpiredError, ki ju errorHandler pretvori v 401.
 *
 * Eksplicitno preverimo `type: 'access'` -> blokira uporabo refresh tokena
 * kot access tokena.
 */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
  });
  if (payload.type !== 'access') {
    const err = new Error('Token ni access type.');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

/**
 * Verificiraj refresh token (analogno).
 */
function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: REFRESH_AUDIENCE,
  });
  if (payload.type !== 'refresh') {
    const err = new Error('Token ni refresh type.');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  expiresInToSeconds,
  // Konstante izpostavljene za teste
  _internal: { ISSUER, ACCESS_AUDIENCE, REFRESH_AUDIENCE, ALGORITHM },
};
