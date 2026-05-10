/**
 * SensorMeasurements controller.
 *
 * Endpoint-i:
 *   POST /api/measurements          - sprejem ene meritve
 *   POST /api/measurements/batch    - sprejem vec meritev (do 100)
 *   GET  /api/measurements          - branje s filtri (commit 4)
 *
 * Pravila ingestion-a:
 *   - klient MORA biti prijavljen (requireAuth)
 *   - deviceId V meritvi MORA pripadati prijavljenemu uporabniku
 *     (preprecimo, da nekdo posilja meritve "v imenu" tuje naprave)
 *   - ce naprava ne obstaja v `devices` kolekciji, vrnemo 404 -
 *     uporabnik mora najprej napravo registrirat (POST /api/devices)
 *
 * Performance:
 *   - batch uporablja `insertMany({ ordered: false })` -> nadaljuje
 *     tudi ob posameznih napakah (npr. duplicate timestamp)
 *   - za vsak ingestion samodejno posodobimo `device.lastSeenAtUtc`
 *     (atomic, ne blokira)
 */

const mongoose = require('mongoose');

const Device = require('../models/Device');
const SensorMeasurement = require('../models/SensorMeasurement');
const ProcessedMeasurement = require('../models/ProcessedMeasurement');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Preveri lastnistvo naprav za vec deviceId-jev naenkrat.
 * Vrne mapo: deviceId -> { _id, userId } | undefined.
 *
 * Klicemo enkrat na batch (1 query za N naprav) -> izognjenje N+1.
 */
async function loadOwnedDevicesMap(deviceIds, userId) {
  const devices = await Device.find({
    deviceId: { $in: deviceIds },
    userId,
  }).select('_id deviceId userId').lean();

  const map = new Map();
  for (const d of devices) map.set(d.deviceId, d);
  return map;
}

// ============================================================
// POST /api/measurements
// ============================================================
const ingestSingle = asyncHandler(async (req, res) => {
  const m = req.body; // ze validiran z Joi
  const userId = req.user.id;

  // Lastnistvo naprave: preveri da naprava obstaja IN da je uporabnikova.
  const device = await Device.findOne({ deviceId: m.deviceId, userId }).select('_id deviceId');
  if (!device) {
    throw new AppError(
      'Naprava ne obstaja oz. ne pripada uporabniku.',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  const doc = await SensorMeasurement.create({
    deviceId: m.deviceId,
    userId,
    sensorType: m.sensorType,
    timestampUtc: m.timestampUtc,
    data: m.data,
    source: 'http',
    schemaVersion: m.schemaVersion || '1.0',
  });

  // Fire-and-forget posodobitev lastSeen (ne blokiramo response-a, a
  // logirajmo morebitno napako).
  Device.touchLastSeen(m.deviceId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[touchLastSeen] napaka:', err.message);
  });

  res.status(201).json({ measurement: doc.toJSON() });
});

// ============================================================
// POST /api/measurements/batch
// ============================================================
const ingestBatch = asyncHandler(async (req, res) => {
  const { measurements } = req.body; // ze validiran z Joi
  const userId = req.user.id;

  // Vse unikatne naprave v batchu -> 1 query za lookup.
  const uniqueDeviceIds = [...new Set(measurements.map((m) => m.deviceId))];
  const ownedMap = await loadOwnedDevicesMap(uniqueDeviceIds, userId);

  // Zavrnjene naprave (niso uporabnikove): zbiramo a ne vrzemo - boljse
  // je vrniti partial-success kot zavrniti celoten batch zaradi enega
  // tujega deviceId-ja v sredini.
  const rejected = [];
  const accepted = [];
  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i];
    if (!ownedMap.has(m.deviceId)) {
      rejected.push({ index: i, deviceId: m.deviceId, reason: 'DEVICE_NOT_FOUND' });
    } else {
      accepted.push({
        deviceId: m.deviceId,
        userId,
        sensorType: m.sensorType,
        timestampUtc: new Date(m.timestampUtc),
        data: m.data,
        source: 'http',
        schemaVersion: m.schemaVersion || '1.0',
      });
    }
  }

  // Ce so VSE meritve zavrnjene -> 404 (klient verjetno se ni
  // registriral naprav).
  if (accepted.length === 0) {
    throw new AppError(
      'Nobena naprava iz batch-a ne pripada uporabniku.',
      404,
      'NO_OWNED_DEVICES',
      rejected
    );
  }

  const inserted = await SensorMeasurement.insertMany(accepted, { ordered: false });

  // Posodobi lastSeen za vse naprave v batchu (atomic bulk).
  Device.updateMany(
    { deviceId: { $in: uniqueDeviceIds.filter((id) => ownedMap.has(id)) } },
    { $set: { lastSeenAtUtc: new Date(), updatedAtUtc: new Date() } }
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[batch touchLastSeen] napaka:', err.message);
  });

  res.status(201).json({
    insertedCount: inserted.length,
    rejectedCount: rejected.length,
    rejected, // [{ index, deviceId, reason }]
  });
});

// ============================================================
// GET /api/measurements
// ============================================================
// Branje meritev s filtri + cursor-paginacijo PO timestampUtc.
//
// Query parametri (vsi opcijski):
//   deviceId    - posamezna naprava (mora pripadati uporabniku)
//   sensorType  - 'gps' | 'accelerometer'
//   from, to    - casovni okvir (ISO 8601)
//   limit       - 1..1000 (default 100)
//   cursor      - opaque token (compound timestampUtc + _id) iz prejsne strani
//   sort        - 'asc' | 'desc' po timestampUtc (default desc)
//
// Cursor format: base64 JSON `{ ts: <ISO>, id: <hex> }`. Compound (ts + id)
// je nujen za stabilno paginacijo, ker je timestampUtc lahko enak za vec
// meritev iz istega batch-a.
//
// Avtorizacija:
//   - vedno samo uporabnikove meritve (filter.userId)
//   - admin vidi vse (placeholder)
//   - ce klient navede `deviceId`, ki mu NE pripada -> 404
//     (anti-enumeration tujih device ID-jev)

function encodeCursor(timestampUtc, id) {
  const payload = JSON.stringify({ ts: timestampUtc.toISOString(), id: String(id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    if (typeof obj.ts !== 'string' || typeof obj.id !== 'string') return null;
    if (!/^[a-f0-9]{24}$/.test(obj.id)) return null;
    const ts = new Date(obj.ts);
    if (Number.isNaN(ts.getTime())) return null;
    return { ts, id: new mongoose.Types.ObjectId(obj.id) };
  } catch {
    return null;
  }
}

const list = asyncHandler(async (req, res) => {
  const { deviceId, sensorType, from, to, limit, cursor, sort } = req.query;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  // Ce je deviceId podan, preveri lastnistvo PRED query-jem
  // (sicer bi vrnili prazen rezultat, kar bi razkrilo da deviceId
  // obstaja a ni nas).
  if (deviceId) {
    const ownedFilter = isAdmin ? { deviceId } : { deviceId, userId };
    const exists = await Device.exists(ownedFilter);
    if (!exists) {
      throw new AppError('Naprava ne obstaja.', 404, 'NOT_FOUND');
    }
  }

  const filter = {};
  if (!isAdmin) filter.userId = new mongoose.Types.ObjectId(userId);
  if (deviceId) filter.deviceId = deviceId;
  if (sensorType) filter.sensorType = sensorType;
  if (from || to) {
    filter.timestampUtc = {};
    if (from) filter.timestampUtc.$gte = new Date(from);
    if (to) filter.timestampUtc.$lt = new Date(to);
  }

  // Compound cursor:
  // sort=desc: hocemo (ts, _id) < (cursor.ts, cursor.id)
  // sort=asc:  hocemo (ts, _id) > (cursor.ts, cursor.id)
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      throw new AppError('Neveljaven cursor.', 400, 'INVALID_CURSOR');
    }
    const op = sort === 'asc' ? '$gt' : '$lt';
    const cursorClause = {
      $or: [
        { timestampUtc: { [op]: decoded.ts } },
        { timestampUtc: decoded.ts, _id: { [op]: decoded.id } },
      ],
    };
    // Ce je `from`/`to` ze postavil filter.timestampUtc, ohranimo z $and.
    if (filter.timestampUtc) {
      const tsRange = filter.timestampUtc;
      delete filter.timestampUtc;
      filter.$and = [{ timestampUtc: tsRange }, cursorClause];
    } else {
      Object.assign(filter, cursorClause);
    }
  }

  const sortDir = sort === 'asc' ? 1 : -1;

  const docs = await SensorMeasurement.find(filter)
    .sort({ timestampUtc: sortDir, _id: sortDir })
    .limit(limit)
    .lean();

  const nextCursor =
    docs.length === limit
      ? encodeCursor(docs[docs.length - 1].timestampUtc, docs[docs.length - 1]._id)
      : null;

  res.json({
    measurements: docs,
    pagination: { limit, sort, nextCursor, hasMore: nextCursor !== null },
  });
});

// ============================================================
// GET /api/devices/:id/measurements
// ============================================================
// Convenience: enako kot GET /api/measurements?deviceId=...
// a sprejme :id (Device ObjectId) namesto string deviceId.
const listForDevice = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  const device = await Device.findById(req.params.id);
  if (!device || (!isAdmin && String(device.userId) !== String(userId))) {
    throw new AppError('Naprava ne obstaja.', 404, 'NOT_FOUND');
  }

  // Premostimo na `list` z deviceId postavljen v query.
  req.query.deviceId = device.deviceId;
  return list(req, res);
});

// ============================================================
// GET /api/measurements/:id
// ============================================================
// Branje posamezne meritve (npr. za debug ali link iz analitike).
const getById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  const m = await SensorMeasurement.findById(req.params.id);
  if (!m || (!isAdmin && String(m.userId) !== String(userId))) {
    throw new AppError('Meritev ne obstaja.', 404, 'NOT_FOUND');
  }
  res.json({ measurement: m.toJSON() });
});

// ============================================================
// GET /api/measurements/processed
// ============================================================
// Branje agregirani/obdelanih podatkov.
// Query parametri:
//   deviceId       - (opcijsko) naprava
//   sensorType     - (opcijsko) 'gps' | 'accelerometer'
//   aggregationType- (opcijsko) '5min' | '1hour' | 'daily'
//   limit          - default 100, max 1000
const listProcessed = asyncHandler(async (req, res) => {
  const { deviceId, sensorType, aggregationType, limit } = req.query;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  // Validiraj limit
  let limitInt = parseInt(limit, 10) || 100;
  limitInt = Math.min(Math.max(limitInt, 1), 1000);

  // Zgradi query
  const query = {};
  if (!isAdmin) query.userId = userId;
  if (deviceId) query.deviceId = deviceId;
  if (sensorType) query.sensorType = sensorType;
  if (aggregationType) query.aggregationType = aggregationType;

  const measurements = await ProcessedMeasurement.find(query)
    .sort({ periodEndUtc: -1 })
    .limit(limitInt)
    .lean();

  res.json({ measurements, count: measurements.length });
});

// ============================================================
// POST /api/measurements/aggregate (admin only)
// ============================================================
// Ročno zagani agregiracijo - za testiranje/debugging.
// Body: { aggregationType: '5min' | '1hour' | 'daily' }
const triggerAggregation = asyncHandler(async (req, res) => {
  // Preprecimo anonimnim uporabnikom
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Samo administratorji imajo dostop.', 403, 'FORBIDDEN');
  }

  const { aggregationType } = req.body;

  // Validiraj
  if (!['5min', '1hour', 'daily'].includes(aggregationType)) {
    throw new AppError(
      'aggregationType mora biti 5min, 1hour ali daily',
      400,
      'VALIDATION_ERROR'
    );
  }

  // Dinamicno nalozi scheduler
  const DataAggregationService = require('../services/DataAggregationService');

  const result = await DataAggregationService.aggregate(aggregationType);

  res.json({
    message: `Agregacija ${aggregationType} je bila uspesna`,
    result,
  });
});

module.exports = { ingestSingle, ingestBatch, list, listForDevice, getById, listProcessed, triggerAggregation };
