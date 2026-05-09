/**
 * Devices controller.
 *
 * Pravila:
 *   - vsi endpoint-i so za prijavljenega uporabnika (requireAuth)
 *   - uporabnik vidi/spreminja SAMO svoje naprave (ownership check)
 *   - admin role lahko vidi vse (placeholder za prihodnost)
 *   - listanje uporablja cursor-paginacijo (po ObjectId, ki je casovno
 *     monotono narascajoc) -> ucinkovito tudi pri 100k+ napravah
 *
 * 404 vs 403:
 *   Ce naprava ne obstaja ALI obstaja a pripada nekomu drugemu, vrnemo
 *   ENAKO 404. To prepreci enumeration tujih device ID-jev.
 */

const mongoose = require('mongoose');

const Device = require('../models/Device');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// ============================================================
// POST /api/devices
// ============================================================
// Registracija nove naprave za prijavljenega uporabnika.
// Ce uporabnik ze ima napravo z istim deviceId-jem (npr. ponovna
// instalacija aplikacije), vrnemo obstojeci dokument (idempotent).
// Ce isti deviceId pripada drugemu uporabniku -> 409 (collision).
const create = asyncHandler(async (req, res) => {
  const { deviceId, name, platform, appVersion } = req.body;
  const userId = req.user.id;

  // Ce naprava ze obstaja:
  const existing = await Device.findOne({ deviceId });
  if (existing) {
    if (String(existing.userId) === String(userId)) {
      // Idempotent re-registracija: posodobimo metapodatke + lastSeen.
      existing.name = name !== undefined ? name : existing.name;
      existing.platform = platform || existing.platform;
      existing.appVersion = appVersion || existing.appVersion;
      existing.lastSeenAtUtc = new Date();
      existing.isActive = true;
      await existing.save();
      return res.status(200).json({ device: existing.toJSON() });
    }
    // Pripada drugemu -> NE razkrivamo, da je rezerviran (vrnemo 409
    // a brez razkrivanja lastnistva)
    throw new AppError('deviceId je ze v uporabi.', 409, 'DEVICE_ID_TAKEN');
  }

  const device = await Device.create({
    deviceId,
    userId,
    name: name || '',
    platform: platform || 'other',
    appVersion: appVersion || '',
  });

  res.status(201).json({ device: device.toJSON() });
});

// ============================================================
// GET /api/devices
// ============================================================
// Listanje naprav s cursor-paginacijo.
// Filtri: isActive, platform.
const list = asyncHandler(async (req, res) => {
  const { isActive, platform, limit, cursor } = req.query;

  const filter = {};
  if (!isAdmin(req)) {
    filter.userId = new mongoose.Types.ObjectId(req.user.id);
  }
  if (isActive !== undefined) filter.isActive = isActive;
  if (platform) filter.platform = platform;
  if (cursor) {
    // Cursor je _id zadnjega zapisa prejsne strani -> vsi novejsi (ali
    // starejsi - odvisno od smeri). Privzeto sortiramo descending po _id
    // (najnovejsi najprej), torej naslednja stran ima _id < cursor.
    filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const docs = await Device.find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();

  const nextCursor = docs.length === limit ? String(docs[docs.length - 1]._id) : null;

  res.json({
    devices: docs,
    pagination: {
      limit,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  });
});

// ============================================================
// GET /api/devices/:id
// ============================================================
const getById = asyncHandler(async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device || (!isAdmin(req) && String(device.userId) !== String(req.user.id))) {
    // Enako 404 v obeh primerih (anti-enumeration)
    throw new AppError('Naprava ne obstaja.', 404, 'NOT_FOUND');
  }
  res.json({ device: device.toJSON() });
});

// ============================================================
// PATCH /api/devices/:id
// ============================================================
const update = asyncHandler(async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device || (!isAdmin(req) && String(device.userId) !== String(req.user.id))) {
    throw new AppError('Naprava ne obstaja.', 404, 'NOT_FOUND');
  }

  // deviceId, userId, _id, createdAtUtc, lastSeenAtUtc so immutable preko API
  // (Joi shema jih je ze odstranila, a defenzivno ne dovolimo niti tukaj).
  const allowed = ['name', 'platform', 'appVersion', 'isActive'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) device[key] = req.body[key];
  }
  await device.save();

  res.json({ device: device.toJSON() });
});

// ============================================================
// DELETE /api/devices/:id
// ============================================================
// Trd brisanje naprave + vseh njenih meritev.
// Razmislek: za revizijske namene bi lahko delali soft-delete, a v skladu
// z GDPR pravicami in projektnim obsegom je hard delete sprejemljiv.
const remove = asyncHandler(async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device || (!isAdmin(req) && String(device.userId) !== String(req.user.id))) {
    throw new AppError('Naprava ne obstaja.', 404, 'NOT_FOUND');
  }

  // Cascade: brisi tudi meritve te naprave.
  // SensorMeasurement model bo obstajal po commitu 3; do takrat samo
  // zbrisemo napravo in pustimo cleanup za cron / migration kasneje.
  let SensorMeasurement = null;
  try { SensorMeasurement = require('../models/SensorMeasurement'); } catch { /* model se ne obstaja */ }
  if (SensorMeasurement) {
    await SensorMeasurement.deleteMany({ deviceId: device.deviceId });
  }

  await Device.deleteOne({ _id: device._id });
  res.status(204).end();
});

module.exports = { create, list, getById, update, remove };
