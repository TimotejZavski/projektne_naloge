/**
 * `requireAuth` middleware - sprejme samo zahteve z veljavnim access tokenom.
 *
 * Pricakovan format:   Authorization: Bearer <jwt>
 *
 * Ce token ni prisoten / je neveljaven / je potekel -> 401.
 * Po uspesni validaciji nastavi:
 *   req.user      = { id, role }   (iz JWT payloada, brez DB klica)
 *   req.userDoc   = User mongoose dokument (lazy-loaded ce ga klicatelj
 *                                            dejansko potrebuje, sicer ne)
 *
 * Privzeto NE delamo DB call-a - JWT je stateless in to je smisel.
 * Ce kontroler potrebuje sveze podatke, lahko poklice `await req.loadUser()`.
 */

const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const User = require('../models/User');

function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  if (parts[0] !== 'Bearer') return null;
  if (!parts[1]) return null;
  return parts[1];
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError('Manjka Authorization Bearer token.', 401, 'NO_TOKEN'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    // errorHandler bo TokenExpiredError / JsonWebTokenError pretvoril v
    // pravilen 401 odgovor (TOKEN_EXPIRED / INVALID_TOKEN).
    return next(err);
  }

  req.user = {
    id: payload.sub,
    role: payload.role || 'user',
  };

  // Lazy loader: kontroler poklice samo ce dejansko potrebuje doc.
  req.loadUser = async () => {
    if (req.userDoc) return req.userDoc;
    const doc = await User.findById(payload.sub);
    if (!doc) {
      throw new AppError('Uporabnik ne obstaja vec.', 401, 'USER_NOT_FOUND');
    }
    if (!doc.isActive) {
      throw new AppError('Uporabnik je deaktiviran.', 401, 'USER_INACTIVE');
    }
    req.userDoc = doc;
    return doc;
  };

  return next();
}

/**
 * `requireRole('admin')` - dodatna preverba role nad `requireAuth`.
 */
function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      return next(new AppError('Avtentikacija je obvezna.', 401, 'NO_AUTH'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Ni dovoljenj za to operacijo.', 403, 'FORBIDDEN'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, extractToken };
