/**
 * VisitStatsService — denormalizirani agregati za User.stats.
 *
 * Pravi vir je vedno `visits`. Tukajsnja `recompute(userId)` metoda preracuna:
 *   - totalVisits
 *   - lastVisitAt
 *   - favoritePlaygroundId (+ ime za hitri prikaz)
 *   - streakDays  (najdaljsi tekoci niz zaporednih DNI z vsaj enim obiskom,
 *                  koncan najkasneje danes)
 *
 * Uporabljeno iz seed skripte in (kasneje) iz VisitDeriverja po vsakem novem obisku.
 */

const Visit = require('../models/Visit');
const User = require('../models/User');
const Playground = require('../models/Playground');

function dayKey(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

/** Najdaljsi tekoci niz dni s vsaj enim obiskom, ki se konca DANES. */
function calcStreakFromDays(sortedDayKeysDesc) {
  if (sortedDayKeysDesc.length === 0) return 0;
  const todayKey = dayKey(new Date());
  let streak = 0;
  let cursor = new Date(todayKey + 'T00:00:00.000Z');
  for (const k of sortedDayKeysDesc) {
    const expected = dayKey(cursor);
    if (k === expected) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    } else if (k > expected) {
      // ze preverjen (npr. vec obiskov v istem dnevu) -> preskoci
      continue;
    } else {
      break;
    }
  }
  return streak;
}

async function recompute(userId) {
  const visits = await Visit.find({ userId })
    .select('playgroundId startUtc')
    .sort({ startUtc: -1 })
    .lean();

  if (visits.length === 0) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          stats: {
            totalVisits: 0,
            lastVisitAt: null,
            favoritePlaygroundId: null,
            favoritePlaygroundName: null,
            streakDays: 0,
            updatedAt: new Date(),
          },
        },
      }
    );
    return { totalVisits: 0 };
  }

  // Favorite playground = najvecje stevilo obiskov
  const counts = new Map();
  for (const v of visits) {
    const k = String(v.playgroundId);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let favId = null;
  let favN = 0;
  for (const [k, n] of counts) {
    if (n > favN) {
      favN = n;
      favId = k;
    }
  }
  let favName = null;
  if (favId) {
    const pg = await Playground.findById(favId).select('name').lean();
    favName = pg?.name || null;
  }

  // Streak — vsi obiski po dnevih (DESC), brez ponovitev
  const seen = new Set();
  const days = [];
  for (const v of visits) {
    const k = dayKey(v.startUtc);
    if (!seen.has(k)) {
      seen.add(k);
      days.push(k);
    }
  }
  const streak = calcStreakFromDays(days);

  const stats = {
    totalVisits: visits.length,
    lastVisitAt: visits[0].startUtc,
    favoritePlaygroundId: favId,
    favoritePlaygroundName: favName,
    streakDays: streak,
    updatedAt: new Date(),
  };

  await User.updateOne({ _id: userId }, { $set: { stats } });
  return stats;
}

/** Bulk: preracunaj za sezname uporabnikov. */
async function recomputeMany(userIds) {
  let processed = 0;
  for (const id of userIds) {
    await recompute(id);
    processed += 1;
  }
  return { processed };
}

module.exports = { recompute, recomputeMany };
