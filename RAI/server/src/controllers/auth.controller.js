/**
 * Auth controller - register, login, refresh, logout, me.
 *
 * Vsi handlerji so wrappani z asyncHandler -> rejected promises se
 * pravilno propagirajo v errorHandler middleware.
 *
 * Refresh token se VEDNO posilja kot HTTP-only secure cookie:
 *   - HTTP-only: nedostopen JS-u (XSS mitigacija)
 *   - SameSite:  CSRF zascita (lax za navadne, strict za prod priporocljivo)
 *   - Secure:    samo prek HTTPS (na production!)
 *
 * Access token se vraca v JSON odgovoru -> klient ga shrani v memory
 * (NE localStorage zaradi XSS) in posilja v Authorization headerju.
 */

const env = require('../config/env');
const User = require('../models/User');
const Session = require('../models/Session');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');

const REFRESH_COOKIE_NAME = 'rai_refresh_token';

function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    expires: expiresAt,
    // Cookie posiljamo SAMO na refresh/logout poti -> manj exposure surface.
    path: '/api/auth',
  };
}

async function issueTokens(user, req, res) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = signRefreshToken(user);

  await Session.createForToken({
    userId: user._id,
    rawToken: refreshToken,
    expiresAt,
    userAgent: (req.headers['user-agent'] || '').slice(0, 500),
    ipAddress: req.ip,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expiresAt));
  return { accessToken, refreshExpiresAt: expiresAt };
}

// ============================================================
// POST /api/auth/register
// ============================================================
const register = asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;

  // Pre-check za boljse error sporocilo. Brez tega bi dobili 11000
  // duplicate key error - errorHandler ga zna obravnavati, a explicitni
  // check je bolj jasen + omogoca konsistenten 'EMAIL_TAKEN' code.
  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    throw new AppError('Email je ze v uporabi.', 409, 'EMAIL_TAKEN');
  }

  const user = new User({ email, displayName });
  user.setPassword(password);
  await user.save();

  // Po registraciji uporabnika takoj prijavimo (UX), izdamo tokene.
  const { accessToken, refreshExpiresAt } = await issueTokens(user, req, res);

  res.status(201).json({
    user: user.toJSON(),
    accessToken,
    refreshExpiresAt,
  });
});

// ============================================================
// POST /api/auth/login
// ============================================================
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByCredentials(email, password);
  if (!user) {
    // GENERIC napaka - NE razkrivamo ce email obstaja ali ne (anti-enumeration).
    throw new AppError('Napacen email ali geslo.', 401, 'INVALID_CREDENTIALS');
  }

  const { accessToken, refreshExpiresAt } = await issueTokens(user, req, res);

  res.json({
    user: user.toJSON(),
    accessToken,
    refreshExpiresAt,
  });
});

// ============================================================
// POST /api/auth/refresh
// ============================================================
// Refresh tok:
//   1. preberi refresh token iz cookie-ja
//   2. JWT verify
//   3. najdi sejo v DB
//   4. ce seja revokana -> SUSPECT REUSE -> revoke vse seje uporabnika
//   5. ce vse OK -> izda nov access + nov refresh + revokaj staro sejo
//      (rotation), nov refresh nastavi v cookie
const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies[REFRESH_COOKIE_NAME];
  if (!rawToken) {
    throw new AppError('Refresh token ni prisoten.', 401, 'NO_REFRESH_TOKEN');
  }

  // 1. JWT verify
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch (err) {
    // Pocistimo cookie - jasen signal klientu, da naj se ponovno prijavi.
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    throw err;
  }

  // 2. Najdi sejo v DB
  const session = await Session.findByRefreshToken(rawToken);
  if (!session) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    throw new AppError('Seja ne obstaja.', 401, 'SESSION_NOT_FOUND');
  }

  // 3. Reuse detection: ce je seja ZE revokana, je nekdo verjetno
  //    poskusil uporabiti star token -> sumimo na krajo, revokaj VSE
  //    seje uporabnika.
  if (!session.isActive()) {
    await Session.updateMany(
      { userId: session.userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'reuse-detected' } }
    );
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    throw new AppError('Refresh token je bil ze uporabljen. Vse seje so revokane.', 401, 'TOKEN_REUSE');
  }

  // 4. Vse OK -> izdaja novih tokenov (rotation)
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    await session.revoke('user-not-active');
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    throw new AppError('Uporabnik ne obstaja vec.', 401, 'USER_NOT_FOUND');
  }

  const newAccessToken = signAccessToken(user);
  const { token: newRefreshToken, expiresAt: newExpiresAt } = signRefreshToken(user);

  await Session.createForToken({
    userId: user._id,
    rawToken: newRefreshToken,
    expiresAt: newExpiresAt,
    userAgent: (req.headers['user-agent'] || '').slice(0, 500),
    ipAddress: req.ip,
  });

  await session.revoke('rotation', newRefreshToken);

  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions(newExpiresAt));
  res.json({
    accessToken: newAccessToken,
    refreshExpiresAt: newExpiresAt,
  });
});

// ============================================================
// POST /api/auth/logout
// ============================================================
const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies[REFRESH_COOKIE_NAME];
  if (rawToken) {
    const session = await Session.findByRefreshToken(rawToken);
    if (session && session.isActive()) {
      await session.revoke('logout');
    }
  }
  // Pocistimo cookie ne glede na rezultat (idempotent logout).
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.status(204).end();
});

// ============================================================
// GET /api/auth/me
// ============================================================
// Vrne podatke trenutno prijavljenega uporabnika.
// Ta endpoint hkrati sluzi kot "verify access token" check za frontend.
const me = asyncHandler(async (req, res) => {
  const user = await req.loadUser();
  res.json({ user: user.toJSON() });
});

// ============================================================
// POST /api/auth/logout-all
// ============================================================
// Razveljavi VSE aktivne seje uporabnika (npr. ce sumi na kompromis).
const logoutAll = asyncHandler(async (req, res) => {
  await Session.updateMany(
    { userId: req.user.id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout-all' } }
  );
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.status(204).end();
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  REFRESH_COOKIE_NAME,
};
