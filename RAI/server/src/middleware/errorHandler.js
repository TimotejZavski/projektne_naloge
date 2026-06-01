/**
 * Centraliziran error handler.
 *
 * Pravila:
 * - V produkciji NIKOLI ne uhajajo stack trace ali interna sporocila ven.
 * - Vsi odgovori imajo enotno strukturo: { error: { code, message, details? } }.
 * - Operativne napake (znane: validacija, auth) -> 4xx z ustreznim sporocilom.
 * - Programske napake (neznane) -> 500 z generic sporocilom.
 *
 * Razlikujemo z `err.isOperational` (postavi `AppError`).
 */

const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Notranja napaka streznika.';
  let details;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Vnos ni veljaven.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Mongoose duplicate key (E11000)
  if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'polje';
    message = `Vrednost za "${field}" ze obstaja.`;
    details = err.keyValue;
  }

  // Mongoose CastError (invalid ObjectId, ...)
  if (err.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = `Neveljavna vrednost za "${err.path}".`;
  }

  // JWT napake
  if (err.name === 'JsonWebTokenError') {
    status = 401;
    code = 'INVALID_TOKEN';
    message = 'Neveljaven token.';
  }
  if (err.name === 'TokenExpiredError') {
    status = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token je potekel.';
  }

  // CORS zavrnitev (npr. nedovoljen Origin) -> 403, ne 500.
  if (typeof err.message === "string" && err.message.startsWith("CORS:")) {
    status = 403;
    code = "CORS_FORBIDDEN";
    message = err.message;
  }

  // Logiranje: vse 5xx logiramo, 4xx samo v dev (manj suma).
  if (status >= 500 || env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${status} ${code}: ${err.message}`);
    if (env.NODE_ENV !== 'production' && status >= 500) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
  }

  // V produkciji za 5xx ne lekamo internih detajlov.
  if (status >= 500 && env.NODE_ENV === 'production') {
    message = 'Notranja napaka streznika.';
    details = undefined;
  }

  const payload = { error: { code, message } };
  if (details) payload.error.details = details;

  res.status(status).json(payload);
}

module.exports = errorHandler;
