/**
 * seed-mock-visits.js — natlaci ~50 mock uporabnikov + 8 tednov obiskov
 * po realnih 46 mariborskih igriscih, da admin dashboard zazivi.
 *
 * Mock entries imajo `source: 'mock'`. Realne (derived) bodo prihajale iz
 * VisitDeriverja, ki ga dodamo kasneje. Ko zelimo cist reset:
 *   node scripts/seed-mock-visits.js --reset
 *
 * Uporaba:
 *   node scripts/seed-mock-visits.js                # privzeto: 50 users, 8 tednov
 *   node scripts/seed-mock-visits.js --users=60 --weeks=12
 *   node scripts/seed-mock-visits.js --reset        # pred polnjenjem zbrise mock-e
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Playground = require('../src/models/Playground');
const Visit = require('../src/models/Visit');
const Device = require('../src/models/Device');
const SensorMeasurement = require('../src/models/SensorMeasurement');
const { recomputeMany } = require('../src/services/VisitStatsService');

// ──────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = { users: 50, weeks: 8, reset: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--reset') args.reset = true;
    else if (a.startsWith('--users=')) args.users = parseInt(a.slice(8), 10);
    else if (a.startsWith('--weeks=')) args.weeks = parseInt(a.slice(8), 10);
  }
  return args;
}

// ──────────────────────────────────────────────────────────────────────────
// Slovenske persona
// ──────────────────────────────────────────────────────────────────────────
const FIRST = [
  'Maja','Jure','Eva','Luka','Nina','Tilen','Sara','Žan','Ana','Matic',
  'Lara','Nejc','Tina','Jaka','Kaja','Domen','Petra','Rok','Manca','Klemen',
  'Špela','Mark','Iza','Aljaž','Lana','Vid','Neža','Erik','Mojca','Anže',
  'Ema','Filip','Hana','Gašper','Mia','Tim','Lea','Blaž','Pia','Žiga',
  'Maša','Nik','Zala','Bor','Tara','Jan','Ela','Mihael','Ines','Andraž',
  'Nika','Boštjan','Dora','Sebastjan','Maša','Andrej','Lina','Rok','Iva','Tomaž',
];
const LAST = [
  'Novak','Horvat','Krajnc','Kovač','Vidmar','Mlakar','Bizjak','Hribar','Zupan','Štrukelj',
  'Kralj','Žagar','Pirc','Lah','Kos','Vrhovec','Češnovar','Petek','Jereb','Jeram',
  'Demirović','Žavski','Ivanović','Štih','Babnik','Ramšak','Štraus','Gregorič','Sušnik','Murn',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ──────────────────────────────────────────────────────────────────────────
// Devices + meritve
// ──────────────────────────────────────────────────────────────────────────
const PLATFORMS_WEIGHTED = ['ios', 'ios', 'ios', 'android', 'android', 'web'];
const DEVICE_NAMES = {
  ios: ['iPhone 15', 'iPhone 16', 'iPhone 17 Pro', 'iPhone Air', 'iPhone SE'],
  android: ['Pixel 8', 'Pixel 9', 'Galaxy S24', 'Galaxy A55', 'OnePlus 12'],
  web: ['Web Client'],
};

function makeDeviceId(firstSlug, idx) {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${firstSlug.slice(0, 10)}-${idx}-${rand}`;
}

function numberOfDevices(profile) {
  const r = Math.random();
  // Regularni uporabniki imajo malo vec naprav (zamenjava telefonov + tablet ipd.)
  if (profile === 'regular') {
    if (r < 0.45) return 1;
    if (r < 0.85) return 2;
    return 3;
  }
  if (r < 0.78) return 1;
  return 2;
}

function generateDevicesForUser(user, profile, now) {
  const n = numberOfDevices(profile);
  const slug = (user.email.split('@')[0] || 'dev').replace(/[^a-z0-9]/gi, '');
  const out = [];
  for (let i = 0; i < n; i++) {
    const platform = pick(PLATFORMS_WEIGHTED);
    const name = pick(DEVICE_NAMES[platform]);
    // Naprava je bila "registrirana" nekje pred user.createdAtUtc ali kmalu po njej.
    const createdAt = new Date(
      (user.createdAtUtc?.getTime() || now.getTime() - 30 * 24 * 3600_000) +
      Math.floor(Math.random() * 7) * 24 * 3600_000
    );
    out.push({
      deviceId: makeDeviceId(slug, i),
      userId: user._id,
      name,
      platform,
      appVersion: '1.0.0',
      isActive: true,
      lastSeenAtUtc: new Date(now.getTime() - Math.floor(Math.random() * 30) * 24 * 3600_000),
      createdAtUtc: createdAt,
      updatedAtUtc: now,
    });
  }
  return out;
}

/**
 * Za vsak obisk ustvari nekaj GPS pingov v okolici igrisca + par accel
 * vzorcev v casu obiska. Vse povezano na nakljucno user-ovo napravo.
 */
function generateMeasurementsForVisit({ visit, devices, playgroundLoc, durationMin }) {
  if (!devices.length) return [];
  const device = pick(devices);

  // GPS: ~ ena meritev na 4-6 min visita (min 3, max 12)
  const gpsCount = Math.min(12, Math.max(3, Math.round(durationMin / 5)));
  // accel: ~ ena vsakih 2-3 min (min 5, max 18)
  const accelCount = Math.min(18, Math.max(5, Math.round(durationMin / 2.5)));

  const out = [];
  const startMs = new Date(visit.startUtc).getTime();
  const endMs = new Date(visit.endUtc).getTime();
  const span = endMs - startMs;

  for (let i = 0; i < gpsCount; i++) {
    const ts = new Date(startMs + (span * i) / Math.max(1, gpsCount - 1));
    // jitter ~50m
    const jitterLat = (Math.random() - 0.5) * 0.0008;
    const jitterLng = (Math.random() - 0.5) * 0.0012;
    out.push({
      deviceId: device.deviceId,
      userId: visit.userId,
      sensorType: 'gps',
      timestampUtc: ts,
      data: {
        latitude: parseFloat((playgroundLoc.latitude + jitterLat).toFixed(6)),
        longitude: parseFloat((playgroundLoc.longitude + jitterLng).toFixed(6)),
        accuracyMeters: 4 + Math.floor(Math.random() * 9),
      },
      source: 'http',
      schemaVersion: '1.0',
      receivedAtUtc: new Date(ts.getTime() + 200),
    });
  }

  // accel — amplituda izhaja iz activityLevel; gravitacija + osc
  const amp = Math.max(0.2, visit.activityLevel || 1);
  for (let i = 0; i < accelCount; i++) {
    const ts = new Date(startMs + (span * i) / Math.max(1, accelCount - 1));
    const osc = Math.sin(2 * Math.PI * (i / accelCount) * 4);
    out.push({
      deviceId: device.deviceId,
      userId: visit.userId,
      sensorType: 'accelerometer',
      timestampUtc: ts,
      data: {
        x: parseFloat(((Math.random() - 0.5) * amp * 0.7).toFixed(4)),
        y: parseFloat(((Math.random() - 0.5) * amp * 0.7).toFixed(4)),
        z: parseFloat((9.81 + osc * amp + (Math.random() - 0.5) * 0.1).toFixed(4)),
        unit: 'm/s2',
      },
      source: 'http',
      schemaVersion: '1.0',
      receivedAtUtc: new Date(ts.getTime() + 50),
    });
  }
  return out;
}


function makeProfile() {
  // 4 vedenjski tipi — definirajo intenziteto in vzorec obiskov.
  const r = Math.random();
  if (r < 0.30) return 'regular';      // 4-6/teden, 2-3 favoriti
  if (r < 0.60) return 'weekender';    // 1-2/vikend, 1-2 favorita
  if (r < 0.85) return 'casual';       // 1-2/teden, raznoliko
  return 'dormant';                    // aktivni samo v prvih ~2 tednih
}

function visitsPerWeek(profile) {
  switch (profile) {
    case 'regular':   return 4 + Math.floor(Math.random() * 3); // 4..6
    case 'weekender': return 1 + Math.floor(Math.random() * 2); // 1..2
    case 'casual':    return 1 + Math.floor(Math.random() * 2); // 1..2
    case 'dormant':   return 0;
    default:          return 1;
  }
}

function pickStartHour(profile) {
  // Realisticni casi — po soli, zvecer, vikend dopoldne
  const dayIsWeekend = (h) => h % 1 === 0 && false; // placeholder
  const r = Math.random();
  if (profile === 'weekender') return 9 + Math.floor(Math.random() * 5); // 9..13
  if (r < 0.55) return 15 + Math.floor(Math.random() * 4); // 15..18 (po soli)
  if (r < 0.85) return 18 + Math.floor(Math.random() * 3); // 18..20 (zvecer)
  return 10 + Math.floor(Math.random() * 3);               // 10..12
}

// ──────────────────────────────────────────────────────────────────────────
// Generator obiskov za enega uporabnika
// ──────────────────────────────────────────────────────────────────────────
function generateVisitsForUser({ user, playgrounds, profile, weeks }) {
  const favCount = profile === 'casual' ? 4 : 2 + Math.floor(Math.random() * 2);
  const favs = [];
  const used = new Set();
  while (favs.length < favCount && favs.length < playgrounds.length) {
    const p = pick(playgrounds);
    if (!used.has(String(p._id))) {
      used.add(String(p._id));
      favs.push(p);
    }
  }
  const visits = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const effectiveWeeks = profile === 'dormant' ? Math.min(2, weeks) : weeks;

  for (let w = effectiveWeeks - 1; w >= 0; w--) {
    const perWeek = visitsPerWeek(profile);
    for (let i = 0; i < perWeek; i++) {
      // Day-of-week selection
      let dow;
      if (profile === 'weekender') dow = Math.random() < 0.5 ? 6 : 0; // Sat or Sun
      else dow = Math.floor(Math.random() * 7);

      const dayDelta = w * 7 + (Math.floor(Math.random() * 7));
      const day = new Date(now.getTime() - dayDelta * 24 * 60 * 60 * 1000);
      day.setUTCHours(0, 0, 0, 0);
      // adjust to dow (jitter)
      // (keep it simple — dayDelta randomization above already approximates dow distribution)

      const hour = pickStartHour(profile);
      const minute = Math.floor(Math.random() * 60);
      const start = new Date(day.getTime() + hour * 3600_000 + minute * 60_000);

      // Igrisce — 70% iz favoritov, 30% iz preostalih
      const fromFav = Math.random() < 0.7;
      const pg = fromFav
        ? pick(favs)
        : (pick(playgrounds.filter(p => !used.has(String(p._id)))) || pick(favs));

      // Trajanje 15..90 min
      const durationMin = 15 + Math.floor(Math.random() * 76);
      const end = new Date(start.getTime() + durationMin * 60_000);

      // Activity level — krepkejsi za 'regular', mehkejsi za 'casual'
      const baseAct = profile === 'regular' ? 2.2 : profile === 'weekender' ? 1.6 : 1.1;
      const activityLevel = parseFloat((baseAct * (0.6 + Math.random())).toFixed(3));

      visits.push({
        userId: user._id,
        playgroundId: pg._id,
        startUtc: start,
        endUtc: end,
        durationMin,
        activityLevel,
        source: 'mock',
        createdAtUtc: new Date(),
      });
    }
  }
  return visits;
}

// ──────────────────────────────────────────────────────────────────────────
// Glavna funkcija
// ──────────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  if (!process.env.MONGODB_URI) throw new Error('Manjka MONGODB_URI v .env');

  console.log(`\nseed-mock-visits: ${args.users} users, ${args.weeks} weeks${args.reset ? ' (reset first)' : ''}`);
  await mongoose.connect(process.env.MONGODB_URI);

  const playgrounds = await Playground.find({}).lean();
  if (playgrounds.length === 0) throw new Error('Ni playground-ov v bazi — najprej zazeni scraper:seed');
  console.log(`  playgrounds available: ${playgrounds.length}`);

  if (args.reset) {
    const mockUsers = await User.find({ email: { $regex: /@mock\.local$/ } }).select('_id').lean();
    const mockUserIds = mockUsers.map((u) => u._id);
    const r1 = await Visit.deleteMany({ source: 'mock' });
    const r2 = await User.deleteMany({ email: { $regex: /@mock\.local$/ } });
    const r3 = await Device.deleteMany({ userId: { $in: mockUserIds } });
    const r4 = await SensorMeasurement.deleteMany({ userId: { $in: mockUserIds } });
    console.log(
      `  reset -> deleted ${r1.deletedCount} mock visits, ${r2.deletedCount} mock users, ` +
      `${r3.deletedCount} devices, ${r4.deletedCount} measurements`
    );
  }

  // 1) Ustvari mock uporabnike (ce jih ze ni)
  const existingMockCount = await User.countDocuments({ email: { $regex: /@mock\.local$/ } });
  const toCreate = Math.max(0, args.users - existingMockCount);
  console.log(`  existing mock users: ${existingMockCount}; need to create: ${toCreate}`);

  const hash = await bcrypt.hash('MockUserDoNotUse!42', 10);
  const newDocs = [];
  for (let i = 0; i < toCreate; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const slug = (first + last + Math.random().toString(36).slice(2, 6)).toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    newDocs.push({
      email: `${slug}@mock.local`,
      displayName: `${first} ${last}`,
      passwordHash: hash,
      role: 'user',
      isActive: true,
      createdAtUtc: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 3600_000),
      updatedAtUtc: new Date(),
    });
  }
  if (newDocs.length > 0) {
    await User.insertMany(newDocs, { ordered: false });
    console.log(`  inserted ${newDocs.length} mock users`);
  }

  // 2) Generiraj naprave + obiske + meritve za VSE mock uporabnike
  const mockUsers = await User.find({ email: { $regex: /@mock\.local$/ } }).lean();
  console.log(`  mock users to seed for: ${mockUsers.length}`);

  const playgroundById = new Map(playgrounds.map((p) => [String(p._id), p]));
  const now = new Date();

  const allDevices = [];
  const allVisits = [];
  const allMeasurements = [];

  for (const u of mockUsers) {
    const profile = makeProfile();

    // a) naprave (1-3 glede na profil)
    const devs = generateDevicesForUser(u, profile, now);
    allDevices.push(...devs);

    // b) obiski
    const visits = generateVisitsForUser({ user: u, playgrounds, profile, weeks: args.weeks });
    allVisits.push(...visits);

    // c) GPS + accel meritve, vsak obisk povezan z eno user-ovo napravo
    for (const v of visits) {
      const pg = playgroundById.get(String(v.playgroundId));
      if (!pg) continue;
      const meas = generateMeasurementsForVisit({
        visit: v,
        devices: devs,
        playgroundLoc: pg.location,
        durationMin: v.durationMin,
      });
      allMeasurements.push(...meas);
    }
  }

  console.log(
    `  generated -> ${allDevices.length} devices, ${allVisits.length} visits, ` +
    `${allMeasurements.length} measurements`
  );

  // 3) Bulk insert (po chunkih)
  const chunk = 2000;
  console.log(`  inserting devices…`);
  for (let i = 0; i < allDevices.length; i += chunk) {
    await Device.insertMany(allDevices.slice(i, i + chunk), { ordered: false });
  }
  console.log(`  inserting visits…`);
  for (let i = 0; i < allVisits.length; i += chunk) {
    await Visit.insertMany(allVisits.slice(i, i + chunk), { ordered: false });
  }
  console.log(`  inserting measurements…`);
  for (let i = 0; i < allMeasurements.length; i += chunk) {
    await SensorMeasurement.insertMany(allMeasurements.slice(i, i + chunk), { ordered: false });
  }

  // 4) Preracunaj stats
  console.log(`  recomputing stats for ${mockUsers.length} users…`);
  await recomputeMany(mockUsers.map((u) => u._id));

  // 5) Povzetek
  const totalVisits = await Visit.countDocuments({});
  const totalDevices = await Device.countDocuments({});
  const mockUserIds = mockUsers.map((u) => u._id);
  const totalMeas = await SensorMeasurement.countDocuments({ userId: { $in: mockUserIds } });
  const sampleUser = await User.findOne({ email: { $regex: /@mock\.local$/ } }).lean();
  console.log(`\nDone.`);
  console.log(`  totals -> visits: ${totalVisits}, devices: ${totalDevices}, mock measurements: ${totalMeas}`);
  console.log(`  sample user: ${sampleUser.displayName} — stats:`, sampleUser.stats);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
