/**
 * Postavi env spremenljivke ZA jest "setupFiles" hook -> izvede se PRED
 * nalozitev katerega koli modula iz `src/`. Brez tega bi `src/config/env.js`
 * naletel na manjkajoce sekrete in fail-fast.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-please-do-not-use-in-prod-32chars-x';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-please-do-not-use-in-prod-32chars-x';
process.env.JWT_ACCESS_EXPIRES_IN = '5m';
process.env.JWT_REFRESH_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '4'; // hitri testi (NIKOLI v produkciji)
process.env.RATE_LIMIT_LOGIN_MAX = '10000';
process.env.RATE_LIMIT_REGISTER_MAX = '10000';
process.env.RATE_LIMIT_GENERAL_MAX = '100000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/rai-test'; // bo prepisan z memory-server URI
