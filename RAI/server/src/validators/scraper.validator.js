/**
 * Joi sheme za scraper endpointe (SCRUM-33).
 *
 * `POST /api/scraper/run`:
 *   - body: prazen ali { sourceIds: [string] } (filter kateri viri se obdelajo)
 *
 * `GET /api/scraper/measurements`:
 *   - query: sourceId, stationId, from, to, limit (default 100, max 1000)
 */

const Joi = require('joi');

const SOURCE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const STATION_ID_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;

const runScraperSchema = Joi.object({
  sourceIds: Joi.array().items(Joi.string().pattern(SOURCE_ID_PATTERN)).min(1).max(20),
});

const scraperOutputSchema = Joi.object({
  records: Joi.array().items(Joi.object().unknown(true)).min(1).max(1000).required(),
  metadata: Joi.object({
    source: Joi.string().max(100),
    sentAt: Joi.date().iso(),
  }).unknown(true),
});

const listTrafficMeasurementsQuerySchema = Joi.object({
  sourceId: Joi.string().pattern(SOURCE_ID_PATTERN),
  stationId: Joi.string().pattern(STATION_ID_PATTERN),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from')).messages({
    'date.greater': 'to mora biti po from.',
  }),
  limit: Joi.number().integer().min(1).max(1000).default(100),
});

module.exports = {
  runScraperSchema,
  scraperOutputSchema,
  listTrafficMeasurementsQuerySchema,
};
