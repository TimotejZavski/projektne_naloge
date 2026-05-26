/**
 * PlaygroundScraper — scrape-a javna igrišča iz maribor.si.
 *
 * Stran: https://maribor.si/mestni-servis/otroci/javna-igrisca/
 * Paginacija: ?stran=1..5
 * Podatki: HTML tabela znotraj div.pins_table_wrap_parent > table > tr > td
 *   Stolpci: Ime igrišča | Naslov | Povezava
 *
 * Po scrape-anju geokodira naslove z Nominatim API-jem (OpenStreetMap),
 * da dobimo latitude/longitude za prikaz na zemljevidu.
 */

const cheerio = require("cheerio");

const BASE_URL = "https://maribor.si/mestni-servis/otroci/javna-igrisca/";
const TOTAL_PAGES = 5;
const REQUEST_DELAY_MS = 500;
const GEOCODE_DELAY_MS = 1100; // Nominatim max 1 req/s
const USER_AGENT = "SmartPlaygrounds/1.0 (student-project)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(pageNumber, fetchImpl) {
  const url = pageNumber === 1 ? BASE_URL : `${BASE_URL}?stran=${pageNumber}`;
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "sl-SI,sl;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} za ${url}`);
  }

  return response.text();
}

function extractPlaygrounds(html) {
  const $ = cheerio.load(html);
  const results = [];

  const table = $(".pins_table_wrap_parent table");
  if (!table.length) return results;

  const rows = table.find("tr");
  rows.each((i, row) => {
    if (i === 0) return;

    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const name = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const address = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!name || !address) return;

    results.push({ name, address });
  });

  return results;
}

async function geocodeAddress(address, fetchImpl) {
  // Naslovi iz HTML-ja že vsebujejo ", Maribor, Slovenija" — ne dodajamo suffixa
  const query = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
  };
}

/**
 * Ročne koordinate za znane lokacije v Mariboru, kjer Nominatim odpove.
 */
const MANUAL_GEOCODE = {
  "Igrišče Mestni park": { latitude: 46.5607, longitude: 15.6451 },
  "Igrišče Slovenska ulica": { latitude: 46.5582, longitude: 15.6467 },
  "Igrišče Gregorčičeva ulica": { latitude: 46.5574, longitude: 15.6452 },
  "Igrišče Trg Borisa Kidriča": { latitude: 46.5621, longitude: 15.6443 },
  "Igrišče Magdalenski park": { latitude: 46.5539, longitude: 15.6494 },
  "Igrišče Magdalenski park – Ljubljanska ulica": {
    latitude: 46.5512,
    longitude: 15.6489,
  },
  "Igrišče Ghegova ulica": { latitude: 46.5532, longitude: 15.6399 },
  "Doživljajsko igrišče (Ertlov gozdič)": {
    latitude: 46.5556,
    longitude: 15.6401,
  },
  "BMX progra Tabor Maribor": { latitude: 46.5573, longitude: 15.6512 },
  "Skate park Maribor": { latitude: 46.5578, longitude: 15.6392 },
  "Naprave za ulično vadbo – Športni park Železničar Tabor": {
    latitude: 46.5553,
    longitude: 15.6507,
  },
  "Naprave za ulično vadbo – Pobrežje": {
    latitude: 46.5472,
    longitude: 15.6704,
  },
  "Naprave za ulično vadbo – Študentski domovi": {
    latitude: 46.5623,
    longitude: 15.6344,
  },
  "Košarkarsko igrišče Ivo Daneu": { latitude: 46.5557, longitude: 15.644 },
  "Igrišče KS Malečnik": { latitude: 46.5557, longitude: 15.6981 },
  "Igrišče Bevkova ulica": { latitude: 46.5381, longitude: 15.6893 },
  "NK Dogoše": { latitude: 46.5275, longitude: 15.7047 },
  "Igrala NK Pobrežje": { latitude: 46.5466, longitude: 15.6653 },
};

async function scrapePlaygrounds(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const logger = options.logger || console;

  const allPlaygrounds = [];
  const errors = [];
  let geoFailed = 0;

  logger.log("[PlaygroundScraper] Začenjam scrape maribor.si...");

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      logger.log(`  Stran ${page}/${TOTAL_PAGES} ...`);
      const html = await fetchPage(page, fetchImpl);
      const extracted = extractPlaygrounds(html);
      logger.log(`    Najdenih: ${extracted.length}`);
      allPlaygrounds.push(...extracted);
      if (page < TOTAL_PAGES) await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      errors.push({ page, message: err.message });
      logger.error(`  Napaka na strani ${page}: ${err.message}`);
    }
  }

  logger.log(`Skupaj ekstrahiranih: ${allPlaygrounds.length} igrišč`);
  logger.log("Začenjam geokodiranje (Nominatim, ~1 req/s)...");

  for (const pg of allPlaygrounds) {
    if (MANUAL_GEOCODE[pg.name]) {
      pg.location = MANUAL_GEOCODE[pg.name];
      continue;
    }
    if (pg.address.startsWith(pg.name) || pg.name.startsWith(pg.address)) {
      pg.location = null;
      geoFailed++;
      continue;
    }
    try {
      await sleep(GEOCODE_DELAY_MS);
      pg.location = await geocodeAddress(pg.address, fetchImpl);
      if (!pg.location) {
        geoFailed++;
        logger.warn(`  Geokodiranje neuspešno: "${pg.name}"`);
      }
    } catch (err) {
      pg.location = null;
      geoFailed++;
      errors.push({
        playground: pg.name,
        phase: "geocode",
        message: err.message,
      });
    }
  }

  const withLocation = allPlaygrounds.filter((p) => p.location !== null);
  logger.log(
    `Geokodiranje končano: ${withLocation.length}/${allPlaygrounds.length} z lokacijo, ${geoFailed} neuspešnih`,
  );

  return {
    playgrounds: allPlaygrounds,
    withLocation,
    errors,
    meta: {
      sourceUrl: BASE_URL,
      totalScraped: allPlaygrounds.length,
      totalGeocoded: withLocation.length,
      geoFailed,
      scrapedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  scrapePlaygrounds,
  extractPlaygrounds,
  BASE_URL,
  TOTAL_PAGES,
};
