/**
 * ScraperIngestionService (SCRUM-33).
 *
 * Skrbi za vnos ekstrahiranih scraper podatkov v MongoDB. Ima dve
 * ravni javnega API-ja:
 *
 *   1. `ingestExtracted(records)` — vzame ze normalizirane zapise (output
 *      `extractFromRawResult`) in jih zapise z **upsert** semantiko.
 *      Vrne podroben summary: `{ insertedCount, modifiedCount, matchedCount,
 *      skippedCount, totalCount, errors }`.
 *
 *   2. `runPipeline({ sources })` — orchestrator, ki za podane vire
 *      pozene scraper -> extractor -> ingest, vrne kombinirani summary.
 *
 * Pravila:
 *   - Idempotentnost: unique index (sourceId, stationId, measuredAt) +
 *     `updateOne(..., { upsert: true })` -> ponoven run istih podatkov
 *     poveca samo `matchedCount` (NE `insertedCount`).
 *   - Validacija: zapis, ki nima `sourceId/stationId/measuredAt/location/metrics.vehicleCount`,
 *     je preskocen (zabelezen v `skipped`). Nikoli ne vrzemo izjeme za
 *     posamicen slab zapis (en pokvarjen vir ne sme zrusiti celotnega run-a).
 *   - Atomicnost: ni transakcij; vsak upsert je samostojen. Pri ~stotinah
 *     postaj je to dovolj. Za vec tisoc bi razmislili o `bulkWrite`.
 *
 * Konstruktor lahko sprejme dependency injection-e (model, runner, extractor)
 * za teste. Privzeto uporabi modul-level singleton-e.
 */

const defaultTrafficCounterModel = require('../../models/TrafficCounterMeasurement');
const defaultScraperRunner = require('../ScraperRunner');
const defaultExtractors = require('../extractors');
const defaultSources = require('../sources');

class ScraperIngestionService {
  constructor(options = {}) {
    this.model = options.model || defaultTrafficCounterModel;
    this.scraperRunner = options.scraperRunner || new defaultScraperRunner();
    this.extractFromRawResult =
      options.extractFromRawResult || defaultExtractors.extractFromRawResult;
    this.getSources = options.getSources || defaultSources.getSources;
    this.logger = options.logger || console;
  }

  /**
   * Vnos `n` ze normaliziranih zapisov v MongoDB.
   *
   * @param {Array<object>} records  zapis, kot ga vrne `extractFromRawResult`:
   *   { sourceId, stationId, stationName, location:{lat,lng}, metrics:{vehicleCount,averageSpeedKmh}, measuredAt, extractedAt }
   * @returns {Promise<{
   *   totalCount: number,
   *   insertedCount: number,
   *   modifiedCount: number,
   *   matchedCount: number,
   *   skippedCount: number,
   *   skipped: Array<{ index:number, reason:string, record:object }>,
   *   errors: Array<{ index:number, message:string, record:object }>
   * }>}
   */
  async ingestExtracted(records) {
    const summary = {
      totalCount: 0,
      insertedCount: 0,
      modifiedCount: 0,
      matchedCount: 0,
      skippedCount: 0,
      skipped: [],
      errors: [],
    };

    if (!Array.isArray(records)) {
      return summary;
    }
    summary.totalCount = records.length;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const validation = this.validateRecord(record);
      if (!validation.ok) {
        summary.skippedCount += 1;
        summary.skipped.push({ index: i, reason: validation.reason, record });
        continue;
      }

      const doc = validation.value;
      try {
        const res = await this.model.updateOne(
          {
            sourceId: doc.sourceId,
            stationId: doc.stationId,
            measuredAt: doc.measuredAt,
          },
          {
            $set: {
              stationName: doc.stationName,
              location: doc.location,
              metrics: doc.metrics,
              extractedAt: doc.extractedAt,
              schemaVersion: doc.schemaVersion,
            },
            $setOnInsert: {
              sourceId: doc.sourceId,
              stationId: doc.stationId,
              measuredAt: doc.measuredAt,
              ingestedAt: new Date(),
            },
          },
          { upsert: true }
        );

        // Mongoose vrne `upsertedCount` + `matchedCount` + `modifiedCount`.
        if (res.upsertedCount && res.upsertedCount > 0) {
          summary.insertedCount += 1;
        } else {
          summary.matchedCount += 1;
          if (res.modifiedCount) summary.modifiedCount += res.modifiedCount;
        }
      } catch (err) {
        summary.errors.push({
          index: i,
          message: err && err.message ? err.message : 'unknown error',
          record,
        });
      }
    }

    return summary;
  }

  /**
   * Pozeni celoten tok: vzemi konfigurirane vire -> scrape -> extract -> ingest.
   *
   * @param {object} [opts]
   * @param {Array} [opts.sources]  override seznam virov (sicer `getSources()`)
   * @returns {Promise<{
   *   sourcesAttempted: number,
   *   sourcesOk: number,
   *   sourcesFailed: number,
   *   extractedCount: number,
   *   ingestion: { insertedCount, modifiedCount, matchedCount, skippedCount, totalCount, skipped, errors },
   *   failedSources: Array<{ sourceId:string, status:number|null, error:string }>
   * }>}
   */
  async runPipeline({ sources } = {}) {
    const sourceList = sources || this.getSources();
    const rawResults = await this.scraperRunner.collect(sourceList);

    const sourcesOk = rawResults.filter((r) => r.ok).length;
    const sourcesFailed = rawResults.length - sourcesOk;
    const failedSources = rawResults
      .filter((r) => !r.ok)
      .map((r) => ({
        sourceId: r.sourceId,
        status: r.status,
        error: r.error || 'unknown',
      }));

    // Iz vseh uspesnih rezultatov izlusci normalizirane zapise.
    const extracted = rawResults.flatMap((r) => this.extractFromRawResult(r));

    const ingestion = await this.ingestExtracted(extracted);

    return {
      sourcesAttempted: rawResults.length,
      sourcesOk,
      sourcesFailed,
      extractedCount: extracted.length,
      ingestion,
      failedSources,
    };
  }

  /**
   * Strogo preverjanje, da zapis ne podre Mongo shematske validacije.
   * Vrne `{ ok:true, value }` ali `{ ok:false, reason }`.
   */
  validateRecord(record) {
    if (!record || typeof record !== 'object') {
      return { ok: false, reason: 'record_not_object' };
    }
    const { sourceId, stationId, stationName, location, metrics, measuredAt, extractedAt } = record;
    if (!sourceId || typeof sourceId !== 'string') return { ok: false, reason: 'missing_sourceId' };
    if (!stationId || typeof stationId !== 'string') return { ok: false, reason: 'missing_stationId' };
    if (!location || typeof location !== 'object') return { ok: false, reason: 'missing_location' };
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      return { ok: false, reason: 'invalid_coordinates' };
    }
    if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
      return { ok: false, reason: 'coordinates_out_of_range' };
    }
    if (!metrics || typeof metrics !== 'object') return { ok: false, reason: 'missing_metrics' };
    if (!Number.isFinite(metrics.vehicleCount) || metrics.vehicleCount < 0) {
      return { ok: false, reason: 'invalid_vehicleCount' };
    }
    const speed = metrics.averageSpeedKmh;
    if (speed != null && !Number.isFinite(speed)) {
      return { ok: false, reason: 'invalid_averageSpeedKmh' };
    }
    if (!measuredAt) return { ok: false, reason: 'missing_measuredAt' };
    const measuredDate = new Date(measuredAt);
    if (Number.isNaN(measuredDate.getTime())) {
      return { ok: false, reason: 'invalid_measuredAt' };
    }

    return {
      ok: true,
      value: {
        sourceId,
        stationId,
        stationName: stationName || stationId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        metrics: {
          vehicleCount: metrics.vehicleCount,
          averageSpeedKmh: speed == null ? null : speed,
        },
        measuredAt: measuredDate,
        extractedAt: extractedAt ? new Date(extractedAt) : new Date(),
        schemaVersion: '1.0',
      },
    };
  }
}

module.exports = ScraperIngestionService;
