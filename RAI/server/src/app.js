/**
 * Express aplikacija za RAI backend.
 *
 * Loceno od `index.js` (vstopna tocka), da lahko v testih instanciramo
 * `app` brez `app.listen()` in ga uporabimo s supertest.
 */

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const morgan = require("morgan");
const mongoose = require("mongoose");

const env = require("./config/env");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");

function createApp() {
  const app = express();

  // Zaupaj prvemu proxy-ju (CRA dev proxy posilja X-Forwarded-For)
  if (env.NODE_ENV !== "production") {
    app.set("trust proxy", 1);
  }

  // ------------------------------------------------------------------
  // Globalna varnost
  // ------------------------------------------------------------------
  // Helmet: postavi vrsto HTTP varnostnih headerjev (X-Frame-Options,
  // X-Content-Type-Options, Strict-Transport-Security, ...).
  app.use(helmet());

  // CORS: dovoli zgolj eksplicitno navedene origin-e iz `.env`.
  // Wildcard `*` ne sme biti v produkciji ker razbije cookies + credentials.
  app.use(
    cors({
      origin: (origin, callback) => {
        // Dovoli zahteve brez Origin (curl, Postman, server-to-server).
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} ni dovoljen`));
      },
      credentials: true,
    }),
  );

  // ------------------------------------------------------------------
  // Body parsing
  // ------------------------------------------------------------------
  // Limit 128kb je strog (auth payloadi so KB-range, batch meritev pa
  // do ~30kb pri 100 dokumentih). 128kb je se vedno premajhno za DoS,
  // dejanske kvote pa nadzira Joi (batch.max=100, displayName.max=60, ...).
  app.use(express.json({ limit: "128kb" }));
  app.use(express.urlencoded({ extended: true, limit: "128kb" }));
  app.use(cookieParser());

  // NoSQL injection zascita: odstrani `$` in `.` iz vhoda (req.body, req.query, req.params).
  // Brez tega bi lahko { "email": { "$gt": "" } } zaobsel login.
  app.use(mongoSanitize());

  // ------------------------------------------------------------------
  // Logging
  // ------------------------------------------------------------------
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  // ------------------------------------------------------------------
  // Globalni rate limit (nezna meja, varovalka pred zlorabami)
  // ------------------------------------------------------------------
  app.use("/api", generalLimiter);

  // ------------------------------------------------------------------
  // Health check (za monitoring iz SCRUM-43)
  // ------------------------------------------------------------------
  app.get("/health", (req, res) => {
    const dbState = [
      "disconnected",
      "connected",
      "connecting",
      "disconnecting",
    ][mongoose.connection.readyState];
    res.json({
      status: "ok",
      uptimeSec: Math.floor(process.uptime()),
      database: dbState,
      timestamp: new Date().toISOString(),
    });
  });

  // ------------------------------------------------------------------
  // API rute
  // ------------------------------------------------------------------
  app.use("/api", routes);

  // ------------------------------------------------------------------
  // Static files (React build) - samo v produkciji
  // ------------------------------------------------------------------
  if (env.NODE_ENV === "production") {
    const clientBuild = path.join(__dirname, "..", "client", "build");
    app.use(express.static(clientBuild));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientBuild, "index.html"));
    });
  }

  // ------------------------------------------------------------------
  // 404 - karkoli ni ujeto, vrni 404 v JSON formatu
  // ------------------------------------------------------------------
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Pot ${req.method} ${req.originalUrl} ne obstaja.`,
      },
    });
  });

  // ------------------------------------------------------------------
  // Centraliziran error handler (mora biti zadnji)
  // ------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
