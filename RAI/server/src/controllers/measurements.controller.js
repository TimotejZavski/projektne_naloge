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
// Branje meritev s filtri + cursor-paginacijo.
//
// Query parametri (vsi opcijski):
//   deviceId    - posamezna naprava (mora pripadati uporabniku)
//   sensorType  - 'gps' | 'accelerometer'
//   from, to    - casovni okvir (ISO 8601)
//   limit       - 1..1000 (default 100)
//   cursor      - _id zadnjega zapisa prejsne strani
//   sort        - 'asc' | 'desc' po timestampUtc (default desc)
//
// Avtorizacija:
//   - vedno samo uporabnikove meritve (filter.userId)
//   - admin vidi vse (placeholder)
//   - ce klient navede `deviceId`, ki mu NE pripada -> 404
//     (anti-enumeration tujih device ID-jev)
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

  // Cursor paginacija: cursor je _id zadnjega zapisa.
  // Pri sort=desc gremo nazaj v casu -> naslednja stran ima _id < cursor.
  // Pri sort=asc gremo naprej -> naslednja stran ima _id > cursor.
  if (cursor) {
    const op = sort === 'asc' ? '$gt' : '$lt';
    filter._id = { [op]: new mongoose.Types.ObjectId(cursor) };
  }

  const sortDir = sort === 'asc' ? 1 : -1;

  const docs = await SensorMeasurement.find(filter)
    .sort({ _id: sortDir })
    .limit(limit)
    .lean();

  const nextCursor = docs.length === limit ? String(docs[docs.length - 1]._id) : null;

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

module.exports = { ingestSingle, ingestBatch, list, listForDevice, getById };
