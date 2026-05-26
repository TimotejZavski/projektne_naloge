/**
 * Scraper controller — upravlja scrape in branje igrišč.
 *
 *   POST /api/scraper/run            — sproži scrape iz maribor.si + shrani v DB
 *   GET  /api/scraper/playgrounds    — vrne vsa igrišča (za zemljevid/UI)
 */

const Playground = require("../models/Playground");
const { scrapePlaygrounds } = require("../scraper");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

// ============================================================
// POST /api/scraper/run
// ============================================================
const runScraper = asyncHandler(async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && req.user?.role !== "admin") {
    throw new AppError(
      "Samo administratorji lahko prožijo scrape.",
      403,
      "FORBIDDEN",
    );
  }

  const result = await scrapePlaygrounds();

  // Shrani v bazo (upsert)
  let inserted = 0;
  let updated = 0;
  const skipped = [];

  for (const pg of result.playgrounds) {
    if (!pg.location) {
      skipped.push({ name: pg.name, reason: "geocoding_failed" });
      continue;
    }

    try {
      const doc = await Playground.findOneAndUpdate(
        { sourceId: "maribor-si-igrisca", name: pg.name },
        {
          $set: {
            name: pg.name,
            address: pg.address,
            location: pg.location,
            sourceUrl: "https://maribor.si/mestni-servis/otroci/javna-igrisca/",
            scrapedAt: new Date(),
          },
          $setOnInsert: { sourceId: "maribor-si-igrisca" },
        },
        { upsert: true, new: true },
      );

      if (
        doc.scrapedAt.getTime() === doc._id.getTimestamp().getTime() ||
        Date.now() - doc.scrapedAt.getTime() < 5000
      ) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      skipped.push({ name: pg.name, reason: err.message });
    }
  }

  res.json({
    summary: {
      totalScraped: result.playgrounds.length,
      totalGeocoded: result.playgrounds.filter((p) => p.location).length,
      inserted,
      updated,
      skipped: skipped.length,
      skippedDetails: skipped,
      errors: result.errors,
    },
  });
});

// ============================================================
// GET /api/scraper/playgrounds
// ============================================================
const listPlaygrounds = asyncHandler(async (req, res) => {
  const playgrounds = await Playground.find({}).sort({ name: 1 }).lean();
  res.json({ playgrounds, count: playgrounds.length });
});

module.exports = {
  runScraper,
  listPlaygrounds,
};
