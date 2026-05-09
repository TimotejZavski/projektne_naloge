/**
 * AppError - operativna napaka, ki jo errorHandler obravnava posebej.
 *
 * Operativna = pricakovana (validacija, auth, not found),
 * v nasprotju s programsko (bug, unhandled exception).
 *
 * Uporaba:
 *   throw new AppError('Email zaseden', 409, 'EMAIL_TAKEN');
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
