/**
 * Admin controller — agregirani read endpointi za admin dashboard.
 *
 * Trenutno zahteva samo requireAuth (ne admin role), ker je demo uporabnik
 * 'user'. Ko se vzpostavi pravi admin race, doda se requireRole('admin').
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Visit = require('../models/Visit');
const Device = require('../models/Device');
const Playground = require('../models/Playground');
const SensorMeasurement = require('../models/SensorMeasurement');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/users?search=&filter=all|active|admins&limit=&offset=
// ─────────────────────────────────────────────────────────────────────
const listUsers = asyncHandler(async (req, res) => {
  const { search = '', filter = 'all' } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const q = {};
  if (search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    q.$or = [{ displayName: rx }, { email: rx }];
  }
  if (filter === 'admins') q.role = 'admin';
  if (filter === 'active') q['stats.lastVisitAt'] = { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS) };

  const [items, total] = await Promise.all([
    User.find(q)
      .sort({ 'stats.lastVisitAt': -1, createdAtUtc: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    User.countDocuments(q),
  ]);

  res.json({
    users: items.map(normalizeUser),
    meta: { total, limit, offset, filter, search },
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id   — vse, kar profile page potrebuje v 1 klicu
// ─────────────────────────────────────────────────────────────────────
const getUserDetail = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    throw new AppError('Invalid user id.', 400, 'BAD_REQUEST');

  const id = new mongoose.Types.ObjectId(req.params.id);
  const user = await User.findById(id).lean();
  if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');

  const [topCourts, recentVisits, devices, personaAgg] = await Promise.all([
    aggregateTopCourts(id),
    listRecentVisits(id, 12),
    Device.find({ userId: id }).lean(),
    aggregateUserPersonaInputs(id),
  ]);

  const persona = classifyPersona({ ...personaAgg, now: new Date() });

  res.json({
    user: normalizeUser(user),
    persona,
    topCourts,
    recentVisits,
    devices: devices.map(normalizeDevice),
  });
});

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
/** Vrne { count, lastVisit, firstVisit, weekendVisits } za persona klasifikacijo enega userja. */
async function aggregateUserPersonaInputs(userId) {
  const r = await Visit.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        lastVisit: { $max: '$startUtc' },
        firstVisit: { $min: '$startUtc' },
        weekendVisits: {
          $sum: { $cond: [{ $in: [{ $dayOfWeek: '$startUtc' }, [1, 7]] }, 1, 0] },
        },
      },
    },
  ]);
  if (r.length === 0) return { count: 0, lastVisit: null, firstVisit: null, weekendVisits: 0 };
  return r[0];
}

async function aggregateTopCourts(userId) {
  const rows = await Visit.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$playgroundId',
        count: { $sum: 1 },
        totalDurationMin: { $sum: '$durationMin' },
        lastVisitAt: { $max: '$startUtc' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 6 },
  ]);

  if (rows.length === 0) return [];
  const pgs = await Playground.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('name address location')
    .lean();
  const byId = new Map(pgs.map((p) => [String(p._id), p]));

  return rows.map((r) => {
    const pg = byId.get(String(r._id));
    return {
      playgroundId: r._id,
      name: pg?.name || 'Unknown court',
      address: pg?.address || null,
      location: pg?.location || null,
      count: r.count,
      totalDurationMin: r.totalDurationMin,
      lastVisitAt: r.lastVisitAt,
    };
  });
}

async function listRecentVisits(userId, limit = 10) {
  const rows = await Visit.find({ userId })
    .sort({ startUtc: -1 })
    .limit(limit)
    .lean();
  if (rows.length === 0) return [];
  const pgs = await Playground.find({
    _id: { $in: rows.map((r) => r.playgroundId) },
  }).select('name').lean();
  const byId = new Map(pgs.map((p) => [String(p._id), p.name]));
  return rows.map((r) => ({
    _id: r._id,
    playgroundId: r.playgroundId,
    playgroundName: byId.get(String(r.playgroundId)) || 'Unknown',
    startUtc: r.startUtc,
    endUtc: r.endUtc,
    durationMin: r.durationMin,
    activityLevel: r.activityLevel,
    source: r.source,
  }));
}

function normalizeUser(u) {
  return {
    _id: u._id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    createdAtUtc: u.createdAtUtc,
    stats: u.stats || {
      totalVisits: 0,
      lastVisitAt: null,
      favoritePlaygroundId: null,
      favoritePlaygroundName: null,
      streakDays: 0,
    },
  };
}

function normalizeDevice(d) {
  return {
    _id: d._id,
    deviceId: d.deviceId,
    name: d.name,
    platform: d.platform,
    appVersion: d.appVersion,
    isActive: d.isActive,
    lastSeenAtUtc: d.lastSeenAtUtc,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/locations
// Vsa obiskana igrisca + per-obisk session detail z merilnimi povzetki.
// ─────────────────────────────────────────────────────────────────────
const getUserLocations = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    throw new AppError('Invalid user id.', 400, 'BAD_REQUEST');

  const userId = new mongoose.Types.ObjectId(req.params.id);
  const visits = await Visit.find({ userId }).sort({ startUtc: -1 }).lean();
  if (visits.length === 0) return res.json({ locations: [] });

  const playgrounds = await Playground.find({
    _id: { $in: [...new Set(visits.map((v) => String(v.playgroundId)))]
      .map((s) => new mongoose.Types.ObjectId(s)) },
  })
    .select('name address location')
    .lean();
  const pgById = new Map(playgrounds.map((p) => [String(p._id), p]));

  // Za vsak obisk dobimo povzetek meritev (count + povprecen activityLevel
  // iz accel + povprecna GPS natancnost). En sam aggregation za vse obiske.
  const rangeBoundsByVisitId = new Map();
  for (const v of visits) rangeBoundsByVisitId.set(String(v._id), v);

  const visitMeasureSummaries = await summarizeMeasurementsByVisit(userId, visits);

  // Grupiramo obiske po playgroundId
  const grouped = new Map();
  for (const v of visits) {
    const pgKey = String(v.playgroundId);
    if (!grouped.has(pgKey)) grouped.set(pgKey, []);
    grouped.get(pgKey).push(v);
  }

  const locations = [];
  for (const [pgKey, vs] of grouped) {
    const pg = pgById.get(pgKey);
    if (!pg) continue;
    const sessions = vs.map((v) => {
      const m = visitMeasureSummaries.get(String(v._id)) || {
        gpsCount: 0, accelCount: 0, avgActivity: null,
      };
      return {
        _id: v._id,
        startUtc: v.startUtc,
        endUtc: v.endUtc,
        durationMin: v.durationMin,
        activityLevel: v.activityLevel,
        measurements: m,
      };
    });
    locations.push({
      playgroundId: pg._id,
      name: pg.name,
      address: pg.address,
      location: pg.location,
      visitCount: vs.length,
      totalDurationMin: vs.reduce((s, v) => s + (v.durationMin || 0), 0),
      lastVisitAt: vs[0].startUtc, // sorted desc
      sessions,
    });
  }

  // Najpogosteje obiskana prva
  locations.sort((a, b) => b.visitCount - a.visitCount);

  res.json({ locations });
});

// Vrne Map<visitId, { gpsCount, accelCount, avgActivity }>.
async function summarizeMeasurementsByVisit(userId, visits) {
  if (visits.length === 0) return new Map();

  // Najmanjsi/najvecji cas za bulk fetch + locene meje za vsak obisk
  const minStart = new Date(Math.min(...visits.map((v) => new Date(v.startUtc).getTime())));
  const maxEnd = new Date(Math.max(...visits.map((v) => new Date(v.endUtc).getTime())) + 60_000);

  const raw = await SensorMeasurement.find({
    userId,
    timestampUtc: { $gte: minStart, $lte: maxEnd },
  })
    .select('sensorType timestampUtc data')
    .lean();

  // Po datumu sortirano oboje
  raw.sort((a, b) => new Date(a.timestampUtc) - new Date(b.timestampUtc));

  // Za vsak obisk: binarno-/linearno-iskaj v rangu (visits so malo, raw < 1000 obicajno)
  const out = new Map();
  for (const v of visits) {
    const s = new Date(v.startUtc).getTime();
    const e = new Date(v.endUtc).getTime();
    let gpsCount = 0;
    let accelCount = 0;
    let accelMagSum = 0;
    let accelN = 0;
    for (const m of raw) {
      const t = new Date(m.timestampUtc).getTime();
      if (t < s) continue;
      if (t > e) break;
      if (m.sensorType === 'gps') gpsCount += 1;
      else if (m.sensorType === 'accelerometer') {
        accelCount += 1;
        if (m.data) {
          const mag = Math.sqrt(
            (m.data.x || 0) ** 2 + (m.data.y || 0) ** 2 + (m.data.z || 0) ** 2
          );
          accelMagSum += mag;
          accelN += 1;
        }
      }
    }
    out.set(String(v._id), {
      gpsCount,
      accelCount,
      avgActivity: accelN > 0 ? parseFloat((accelMagSum / accelN).toFixed(3)) : null,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/visits/:visitId/measurements
// Surove meritve znotraj casovnega okvira obiska (za grafe).
// ─────────────────────────────────────────────────────────────────────
const getVisitMeasurements = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.visitId))
    throw new AppError('Invalid visit id.', 400, 'BAD_REQUEST');

  const visit = await Visit.findById(req.params.visitId).lean();
  if (!visit) throw new AppError('Visit not found.', 404, 'NOT_FOUND');

  const raw = await SensorMeasurement.find({
    userId: visit.userId,
    timestampUtc: { $gte: visit.startUtc, $lte: visit.endUtc },
  })
    .select('sensorType timestampUtc data deviceId')
    .sort({ timestampUtc: 1 })
    .lean();

  const gps = [];
  const accelerometer = [];
  for (const m of raw) {
    if (m.sensorType === 'gps') gps.push(m);
    else if (m.sensorType === 'accelerometer') accelerometer.push(m);
  }

  res.json({
    visit: {
      _id: visit._id,
      startUtc: visit.startUtc,
      endUtc: visit.endUtc,
      durationMin: visit.durationMin,
      activityLevel: visit.activityLevel,
      playgroundId: visit.playgroundId,
    },
    gps,
    accelerometer,
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/overview/users
// Globalni "empty state" dashboard za Users svet — vse v enem klicu.
// ─────────────────────────────────────────────────────────────────────
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
const EIGHT_WEEKS_MS = 8 * 7 * 24 * 60 * 60 * 1000;

/**
 * Klasifikacija osebnosti uporabnika iz njegovih obiskov.
 * - noVisits: ni obiskov
 * - dormant:  zadnji obisk pred > 14 dnevi
 * - weekender: vec kot 60% obiskov je vikend in skupaj >= 4
 * - regular:  povprecno >= 3 obiski na teden
 * - casual:   ostalo
 */
function classifyPersona({ count, lastVisit, firstVisit, weekendVisits, now = new Date() }) {
  if (!count || count === 0) return 'noVisits';
  if (lastVisit < new Date(now.getTime() - TWO_WEEKS)) return 'dormant';
  const weekendShare = (weekendVisits || 0) / Math.max(1, count);
  const weeksActive = Math.max(
    1,
    Math.min(12, Math.round((now.getTime() - new Date(firstVisit).getTime()) / (7 * 24 * 3600 * 1000)))
  );
  const visitsPerWeek = count / weeksActive;
  if (weekendShare >= 0.6 && count >= 4) return 'weekender';
  if (visitsPerWeek >= 3) return 'regular';
  return 'casual';
}

const getUsersOverview = asyncHandler(async (req, res) => {
  const now = new Date();
  const sinceWeek = new Date(now.getTime() - ONE_WEEK);
  const sinceEightWeeks = new Date(now.getTime() - EIGHT_WEEKS_MS);

  // Paralelno: vsi 5 deli + 1 pomoznik za persona klasifikacijo.
  const [heatmap, topUsers, weeklyTrend, topCourts, personaMix] = await Promise.all([
    aggregateHeatmap(),
    aggregateTopUsersThisWeek(sinceWeek),
    aggregateWeeklyTrend(sinceEightWeeks, now),
    aggregateTopCourts(),
    computePersonaMix(now),
  ]);

  res.json({ heatmap, topUsers, weeklyTrend, topCourts, personaMix });
});

// ── Heatmap: 7×24 grid (dow x hour) z totals ─────────────────────────
async function aggregateHeatmap() {
  // Mongo $dayOfWeek: 1=Sun..7=Sat. Pretvorimo v 0=Mon..6=Sun za naravni prikaz.
  const rows = await Visit.aggregate([
    {
      $group: {
        _id: { dow: { $dayOfWeek: '$startUtc' }, hour: { $hour: '$startUtc' } },
        count: { $sum: 1 },
      },
    },
  ]);

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of rows) {
    const mongoDow = r._id.dow; // 1..7
    const dow = (mongoDow + 5) % 7; // 0=Mon..6=Sun
    const hour = r._id.hour;
    if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
      grid[dow][hour] = r.count;
      if (r.count > max) max = r.count;
    }
  }
  return { grid, max };
}

// ── Top users this week ──────────────────────────────────────────────
async function aggregateTopUsersThisWeek(since) {
  const rows = await Visit.aggregate([
    { $match: { startUtc: { $gte: since } } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  if (rows.length === 0) return [];
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('displayName email stats')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows
    .map((r) => {
      const u = byId.get(String(r._id));
      if (!u) return null;
      return {
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
        visitsThisWeek: r.count,
        favoritePlaygroundName: u.stats?.favoritePlaygroundName || null,
      };
    })
    .filter(Boolean);
}

// ── Weekly trend: 8 tednov zaporedoma ───────────────────────────────
async function aggregateWeeklyTrend(since, now) {
  const rows = await Visit.aggregate([
    { $match: { startUtc: { $gte: since } } },
    {
      $project: {
        weekStart: {
          $dateTrunc: { date: '$startUtc', unit: 'week', binSize: 1, startOfWeek: 'monday' },
        },
      },
    },
    { $group: { _id: '$weekStart', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const byWeek = new Map(rows.map((r) => [r._id.toISOString(), r.count]));

  // Generiraj 8 tednov nazaj od trenutnega tedna
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  const day = monday.getUTCDay(); // 0=Sun
  const offset = (day + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);

  const out = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    out.push({
      weekStart: d,
      label: `W-${i}`,
      count: byWeek.get(d.toISOString()) || 0,
    });
  }
  return out;
}

// ── Top courts (all time) ───────────────────────────────────────────
async function aggregateTopCourts() {
  const rows = await Visit.aggregate([
    { $group: { _id: '$playgroundId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  if (rows.length === 0) return [];
  const pgs = await Playground.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('name address')
    .lean();
  const byId = new Map(pgs.map((p) => [String(p._id), p]));
  return rows.map((r) => {
    const p = byId.get(String(r._id));
    return {
      playgroundId: r._id,
      name: p?.name || 'Unknown',
      count: r.count,
    };
  });
}

// ── Persona mix: classify each user from their visit history ─────────
async function computePersonaMix(now) {
  // 1) Pridobi vse uporabnike z vsaj enim obiskom + njihove obiske.
  const rows = await Visit.aggregate([
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
        lastVisit: { $max: '$startUtc' },
        weekendVisits: {
          $sum: { $cond: [{ $in: [{ $dayOfWeek: '$startUtc' }, [1, 7]] }, 1, 0] },
        },
        firstVisit: { $min: '$startUtc' },
      },
    },
  ]);

  const totalUsersAll = await User.countDocuments({});

  let regular = 0, weekender = 0, casual = 0, dormant = 0;
  const seen = new Set();
  for (const r of rows) {
    seen.add(String(r._id));
    const persona = classifyPersona({
      count: r.count,
      lastVisit: r.lastVisit,
      firstVisit: r.firstVisit,
      weekendVisits: r.weekendVisits,
      now,
    });
    if (persona === 'regular') regular += 1;
    else if (persona === 'weekender') weekender += 1;
    else if (persona === 'dormant') dormant += 1;
    else casual += 1;
  }
  // Uporabniki brez obiskov se ne stejejo kot dormant (lahko niso nikoli zaceli).
  const noVisits = Math.max(0, totalUsersAll - seen.size);

  return {
    regular,
    weekender,
    casual,
    dormant,
    noVisits,
    total: regular + weekender + casual + dormant + noVisits,
  };
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/courts  — vsa igrisca z osnovnimi statistikami za map
// ─────────────────────────────────────────────────────────────────────
const listCourts = asyncHandler(async (req, res) => {
  const playgrounds = await Playground.find({}).lean();

  // Agregirane statistike na ravni igrisca
  const stats = await Visit.aggregate([
    {
      $group: {
        _id: '$playgroundId',
        totalVisits: { $sum: 1 },
        lastVisitAt: { $max: '$startUtc' },
        uniqueVisitors: { $addToSet: '$userId' },
        avgDuration: { $avg: '$durationMin' },
      },
    },
    {
      $project: {
        totalVisits: 1,
        lastVisitAt: 1,
        uniqueVisitors: { $size: '$uniqueVisitors' },
        avgDuration: 1,
      },
    },
  ]);
  const statById = new Map(stats.map((s) => [String(s._id), s]));

  const courts = playgrounds.map((p) => {
    const s = statById.get(String(p._id));
    return {
      _id: p._id,
      name: p.name,
      address: p.address,
      location: p.location,
      sourceUrl: p.sourceUrl,
      totalVisits: s?.totalVisits || 0,
      uniqueVisitors: s?.uniqueVisitors || 0,
      lastVisitAt: s?.lastVisitAt || null,
      avgDurationMin: s ? Math.round(s.avgDuration) : null,
    };
  });

  // Quartile pragova za filtrirat busy/quiet (front end uporabi)
  const visits = courts.map((c) => c.totalVisits).sort((a, b) => a - b);
  const q = (frac) => visits.length ? visits[Math.floor(visits.length * frac)] : 0;

  res.json({
    courts,
    meta: {
      total: courts.length,
      busyThreshold: q(0.75),
      quietThreshold: q(0.25),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/courts/:id  — popoln profil enega igrisca
// ─────────────────────────────────────────────────────────────────────
const getCourtDetail = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    throw new AppError('Invalid court id.', 400, 'BAD_REQUEST');

  const id = new mongoose.Types.ObjectId(req.params.id);
  const court = await Playground.findById(id).lean();
  if (!court) throw new AppError('Court not found.', 404, 'NOT_FOUND');

  const [statsAgg, heatmapAgg, topVisitorsAgg, recentVisits, intensityAgg, busiestHourAgg] =
    await Promise.all([
      Visit.aggregate([
        { $match: { playgroundId: id } },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
            uniqueVisitors: { $addToSet: '$userId' },
            avgDuration: { $avg: '$durationMin' },
            avgActivity: { $avg: '$activityLevel' },
            lastVisit: { $max: '$startUtc' },
            firstVisit: { $min: '$startUtc' },
          },
        },
      ]),
      Visit.aggregate([
        { $match: { playgroundId: id } },
        {
          $group: {
            _id: { dow: { $dayOfWeek: '$startUtc' }, hour: { $hour: '$startUtc' } },
            count: { $sum: 1 },
          },
        },
      ]),
      Visit.aggregate([
        { $match: { playgroundId: id } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Visit.find({ playgroundId: id }).sort({ startUtc: -1 }).limit(10).lean(),
      Visit.aggregate([
        { $match: { playgroundId: id, activityLevel: { $ne: null } } },
        {
          $bucket: {
            groupBy: '$activityLevel',
            boundaries: [0, 1, 2, 3, 4, 100],
            default: 'other',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Visit.aggregate([
        { $match: { playgroundId: id } },
        { $group: { _id: { $hour: '$startUtc' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

  // heatmap grid 7x24 (Mon..Sun)
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of heatmapAgg) {
    const dow = (r._id.dow + 5) % 7;
    grid[dow][r._id.hour] = r.count;
    if (r.count > max) max = r.count;
  }

  const stats = statsAgg[0] || {};

  // top visitors — pridobi displayName
  const topVisitors = await (async () => {
    if (topVisitorsAgg.length === 0) return [];
    const users = await User.find({ _id: { $in: topVisitorsAgg.map((r) => r._id) } })
      .select('displayName email stats')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return topVisitorsAgg.map((r) => {
      const u = byId.get(String(r._id));
      if (!u) return null;
      return {
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
        visitsHere: r.count,
        totalVisits: u.stats?.totalVisits || 0,
      };
    }).filter(Boolean);
  })();

  // recent visits — pridobi visitor names
  const recentVisitsWithNames = await (async () => {
    if (recentVisits.length === 0) return [];
    const users = await User.find({ _id: { $in: recentVisits.map((v) => v.userId) } })
      .select('displayName')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u.displayName]));
    return recentVisits.map((v) => ({
      _id: v._id,
      userId: v.userId,
      userName: byId.get(String(v.userId)) || 'Unknown',
      startUtc: v.startUtc,
      durationMin: v.durationMin,
      activityLevel: v.activityLevel,
    }));
  })();

  // intensity histogram -> rendering-friendly buckets
  const intensityLabels = ['idle', 'light', 'active', 'high', 'peak'];
  const intensityHistogram = intensityLabels.map((label, i) => {
    const found = intensityAgg.find((b) => b._id === i);
    return { label, count: found ? found.count : 0 };
  });

  res.json({
    court: {
      _id: court._id,
      name: court.name,
      address: court.address,
      location: court.location,
      sourceUrl: court.sourceUrl,
      sourceId: court.sourceId,
      scrapedAt: court.scrapedAt,
    },
    stats: {
      totalVisits: stats.totalVisits || 0,
      uniqueVisitors: (stats.uniqueVisitors || []).length || 0,
      avgDurationMin: stats.avgDuration ? Math.round(stats.avgDuration) : null,
      avgActivity: stats.avgActivity != null
        ? parseFloat(stats.avgActivity.toFixed(2))
        : null,
      busiestHour: busiestHourAgg[0]?._id ?? null,
      lastVisitAt: stats.lastVisit || null,
      firstVisitAt: stats.firstVisit || null,
    },
    heatmap: { grid, max },
    topVisitors,
    recentVisits: recentVisitsWithNames,
    intensityHistogram,
  });
});

module.exports = {
  listUsers,
  getUserDetail,
  getUserLocations,
  getVisitMeasurements,
  getUsersOverview,
  listCourts,
  getCourtDetail,
};
