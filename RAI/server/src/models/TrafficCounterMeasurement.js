/**
 * TrafficCounterMeasurement model (SCRUM-33).
 *
 * Shranjuje meritve iz scraperja prometnih stevcev (SCRUM-31/32).
 * Vsak zapis ustreza eni meritvi na eni stevec-postaji ob enem casu.
 *
 * Indexi:
 *   - unique compound (sourceId, stationId, measuredAt)
 *     -> idempotentnost: ponovni scrape istega snapshot-a ne podvoji.
 *   - (sourceId, measuredAt -1)     -> za "zadnjih N meritev za vir"
 *   - (stationId, measuredAt -1)    -> za "zgodovina ene postaje"
 *
 * Polje `location` je shranjeno kot navaden objekt z latitude/longitude.
 * Namensko NE uporabljam GeoJSON Point + 2dsphere index — trenutni
 * use-case je samo prikaz, ne geo-poizvedovanje. Ce kasneje rabimo
 * "vse postaje v radiju X km", se da brez migracije dodati 2dsphere
 * nad obstojecimi polji (z `Mixed`-style schema spremembo).
 */

const mongoose = require('mongoose');

const SCHEMA_VERSIONS = ['1.0'];

const locationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const metricsSchema = new mongoose.Schema(
  {
    vehicleCount: { type: Number, required: true, min: 0 },
    // averageSpeedKmh je opcijski - nekateri viri ga ne posredujejo.
    averageSpeedKmh: { type: Number, default: null, min: 0, max: 400 },
  },
  { _id: false }
);

const trafficCounterMeasurementSchema = new mongoose.Schema(
  {
    sourceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    stationId: {
      type: String,
      required: true,
      trim: true,
    },
    stationName: {
      type: String,
      trim: true,
      default: '',
    },
    location: { type: locationSchema, required: true },
    metrics: { type: metricsSchema, required: true },

    // Cas, ko je bila meritev opravljena (vir podatka).
    measuredAt: {
      type: Date,
      required: true,
    },
    // Cas, ko jih je scraper ekstrahiral.
    extractedAt: {
      type: Date,
      default: () => new Date(),
    },
    // Cas, ko smo jih dejansko zapisali v bazo.
    ingestedAt: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },

    schemaVersion: {
      type: String,
      enum: SCHEMA_VERSIONS,
      default: '1.0',
    },
  },
  {
    collection: 'traffic_counter_measurements',
    versionKey: false,
    minimize: false,
  }
);

// Unique compound: ista postaja, ista casovna meritev iz istega vira =
// natanko en dokument. Ce pride drugic, naredimo $set (upsert), ne insert.
trafficCounterMeasurementSchema.index(
  { sourceId: 1, stationId: 1, measuredAt: 1 },
  { unique: true, name: 'uniq_source_station_measuredAt' }
);

trafficCounterMeasurementSchema.index({ sourceId: 1, measuredAt: -1 });
trafficCounterMeasurementSchema.index({ stationId: 1, measuredAt: -1 });

trafficCounterMeasurementSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

trafficCounterMeasurementSchema.statics.SCHEMA_VERSIONS = SCHEMA_VERSIONS;

module.exports = mongoose.model(
  'TrafficCounterMeasurement',
  trafficCounterMeasurementSchema
);
