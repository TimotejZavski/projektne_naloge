/**
 * Scraper controller (SCRUM-33).
 *
 * Tri javne operacije:
 *   POST /api/scraper/run             - sprozi pipeline (admin only v produkciji)
 *   GET  /api/scraper/measurements    - zgodovinske meritve s filtri
 *   GET  /api/scraper/stations        - distinct seznam postaj (za select v UI)
 *
 * `POST /api/scraper/run` je dopusten ne-adminom v dev/test okolju, da
 * omogocamo lokalno smoke testanje brez seed-anja admin uporabnikov.
 * V produkciji vrne 403, ce ni admin.
 */

const TrafficCounterMeasurement = require('../models/TrafficCounterMeasurement');
const ScraperIngestionService = require('../scraper/ingestion/ScraperIngestionService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Singleton service - poceno, ker je le orchestrator brez per-request state.
let singletonService = null;
function getService() {
  if (!singletonService) singletonService = new ScraperIngestionService();
  return singletonService;
}

// Override za teste (DI).
function setServiceForTesting(svc) {
  singletonService = svc;
}

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// ============================================================
// POST /api/scraper/run
// ============================================================
const runPipeline = asyncHandler(async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !isAdmin(req)) {
    throw new AppError('Samo administratorji imajo dostop.', 403, 'FORBIDDEN');
  }

  const { sourceIds } = req.body || {};
  const service = getService();

  let sources;
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    const all = service.getSources();
    sources = all.filter((s) => sourceIds.includes(s.id));
    if (sources.length === 0) {
      throw new AppError(
        'Noben podani sourceId ne ustreza konfiguriranim virom.',
        400,
        'UNKNOWN_SOURCE_IDS',
        { requested: sourceIds, available: all.map((s) => s.id) }
      );
    }
  }

  const summary = await service.runPipeline({ sources });
  res.status(200).json({ summary });
});

// ============================================================
// GET /api/scraper/measurements
// ============================================================
const listMeasurements = asyncHandler(async (req, res) => {
  const { sourceId, stationId, from, to, limit } = req.query;

  const filter = {};
  if (sourceId) filter.sourceId = sourceId;
  if (stationId) filter.stationId = stationId;
  if (from || to) {
    filter.measuredAt = {};
    if (from) filter.measuredAt.$gte = new Date(from);
    if (to) filter.measuredAt.$lt = new Date(to);
  }

  const docs = await TrafficCounterMeasurement.find(filter)
    .sort({ measuredAt: -1, _id: -1 })
    .limit(limit)
    .lean();

  res.json({
    measurements: docs,
    count: docs.length,
  });
});

// ============================================================
// GET /api/scraper/stations
// ============================================================
// Distinct postaje (sourceId + stationId), za izbiro v UI.
const listStations = asyncHandler(async (req, res) => {
  // Agregacija: za vsako (sourceId, stationId) vrni zadnji znan stationName + location + cas.
  const stations = await TrafficCounterMeasurement.aggregate([
    { $sort: { measuredAt: -1 } },
    {
      $group: {
        _id: { sourceId: '$sourceId', stationId: '$stationId' },
        stationName: { $first: '$stationName' },
        location: { $first: '$location' },
        lastMeasuredAt: { $first: '$measuredAt' },
        lastVehicleCount: { $first: '$metrics.vehicleCount' },
        lastAverageSpeedKmh: { $first: '$metrics.averageSpeedKmh' },
      },
    },
    {
      $project: {
        _id: 0,
        sourceId: '$_id.sourceId',
        stationId: '$_id.stationId',
        stationName: 1,
        location: 1,
        lastMeasuredAt: 1,
        lastVehicleCount: 1,
        lastAverageSpeedKmh: 1,
      },
    },
    { $sort: { sourceId: 1, stationId: 1 } },
  ]);

  res.json({ stations, count: stations.length });
});

module.exports = {
  runPipeline,
  listMeasurements,
  listStations,
  setServiceForTesting,
};
