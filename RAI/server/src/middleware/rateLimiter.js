/**
 * Rate limiterji - zascita pred brute force in DoS.
 *
 * Strategija:
 *   - `generalLimiter`: blagi limit za vse `/api/*` poti.
 *   - `loginLimiter`:   strog limit za `/api/auth/login` (5 / 15 min na IP).
 *   - `registerLimiter`: zmeren limit za `/api/auth/register` (10 / 1h na IP).
 *
 * Vsi vrnejo enotno strukturirano JSON napako.
 */

const rateLimit = require("express-rate-limit");
const env = require("../config/env");

function jsonHandler(req, res /* , next, options */) {
  res.status(429).json({
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Prevec zahtev. Poskusite znova kasneje.",
    },
  });
}

const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_GENERAL_WINDOW_MS,
  max: env.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "development",
  handler: jsonHandler,
});

const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Steje samo neuspele zahteve (statusCode >= 400). Uspesna prijava
  // ne porabi kvote - sicer bi normalna uporaba lahko zaklenila uporabnika.
  skipSuccessfulRequests: true,
  handler: jsonHandler,
});

const registerLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_REGISTER_WINDOW_MS,
  max: env.RATE_LIMIT_REGISTER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { generalLimiter, loginLimiter, registerLimiter };
