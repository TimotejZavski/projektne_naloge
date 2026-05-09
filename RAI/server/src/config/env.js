/**
 * Nalozi okoljske spremenljivke iz `.env` (samo enkrat na proces) in
 * jih validira. Manjkajoca obvezna spremenljivka pomeni hard-fail ze
 * ob startu - boljse zdaj kot v produkciji ob prvi prijavi uporabnika.
 *
 * Uporaba:
 *   const env = require('./config/env');
 *   console.log(env.PORT);
 */

const path = require('path');
const dotenv = require('dotenv');

// Naloziti `.env` SAMO ce nismo v testnem okolju (Jest).
// V testih spremenljivke nastavimo direktno v test setupu.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
}

const REQUIRED = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGODB_URI',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.error(`\n[FATAL] Manjkajo obvezne env spremenljivke: ${missing.join(', ')}`);
  console.error('Glej .env.example in pripravi .env datoteko.\n');
  process.exit(1);
}

// Dodatna varnost: secret-a NE smeta biti enaka. Ce sta, je en token
// veljaven kot drugi -> avtentikacija razpade.
if (
  process.env.JWT_ACCESS_SECRET &&
  process.env.JWT_REFRESH_SECRET &&
  process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
) {
  // eslint-disable-next-line no-console
  console.error('[FATAL] JWT_ACCESS_SECRET in JWT_REFRESH_SECRET morata biti razlicna.');
  process.exit(1);
}

// Dodatno priporocilo: opozori, ce je secret prekratek (manj kot 32 znakov).
['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key) => {
  const val = process.env[key];
  if (val && val.length < 32 && process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${key} je krajsi od 32 znakov - to je nevarno za produkcijo.`);
  }
});

const toInt = (val, fallback) => {
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  return String(val).toLowerCase() === 'true';
};

const toList = (val, fallback) => {
  if (!val) return fallback;
  return String(val).split(',').map((s) => s.trim()).filter(Boolean);
};

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: toInt(process.env.PORT, 5000),

  MONGODB_URI: process.env.MONGODB_URI,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  BCRYPT_SALT_ROUNDS: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),

  CORS_ORIGINS: toList(process.env.CORS_ORIGINS, ['http://localhost:3000']),

  RATE_LIMIT_LOGIN_MAX: toInt(process.env.RATE_LIMIT_LOGIN_MAX, 5),
  RATE_LIMIT_LOGIN_WINDOW_MS: toInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
  RATE_LIMIT_GENERAL_MAX: toInt(process.env.RATE_LIMIT_GENERAL_MAX, 100),
  RATE_LIMIT_GENERAL_WINDOW_MS: toInt(process.env.RATE_LIMIT_GENERAL_WINDOW_MS, 15 * 60 * 1000),

  COOKIE_SECURE: toBool(process.env.COOKIE_SECURE, false),
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || 'lax',
};
