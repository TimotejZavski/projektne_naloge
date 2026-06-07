/**
 * ProcessedMeasurement model.
 *
 * Shranjuje agregirane/obdelane podatke - povprečja, statistiko, ipd.
 * Iz raw SensorMeasurement podatkov.
 *
 * Polje `aggregationType` specira kaj je agregirano:
 *   - '5min':  povprečje zadnjih 5 minut
 *   - '1hour': povprečje zadnje ure
 *   - 'daily':  povprečje zadnjega dneva
 *
 * Polje `aggregatedData` je raznolik glede na sensorType:
 *   - gps:           { avgLatitude, avgLongitude, minAccuracy, maxAccuracy, sampleCount }
 *   - accelerometer: { avgX, avgY, avgZ, maxAccel, activityLevel, detectionStatus, sampleCount }
 *
 * `activityLevel` za accelerometer:
 *   - standardni odklon magnitude pospeska (m/s^2); 0 = mirovanje, visje = vec gibanja.
 *
 * `detectionStatus` za accelerometer (stopnja uporabe igrala/igrisca):
 *   - 'idle':   prosto (gibanja ni zaznati)
 *   - 'light':  rahla uporaba
 *   - 'active': v uporabi (aktivno gibanje)
 */

const mongoose = require('mongoose');

const SENSOR_TYPES = ['gps', 'accelerometer'];
const AGGREGATION_TYPES = ['5min', '1hour', 'daily'];

const processedMeasurementSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sensorType: {
      type: String,
      enum: SENSOR_TYPES,
      required: true,
    },
    aggregationType: {
      type: String,
      enum: AGGREGATION_TYPES,
      required: true,
      default: '5min',
    },
    // Cas za katerega je agregacija narejena (npr. 2026-05-10T10:30:00Z za 5min pred tem)
    periodStartUtc: {
      type: Date,
      required: true,
    },
    periodEndUtc: {
      type: Date,
      required: true,
    },
    // Raznoviti agregirani podatki
    aggregatedData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Koliko raw podatkov je bilo vkljucenih
    sampleCount: {
      type: Number,
      required: true,
      min: 1,
    },
    // Kateri raw dokumenti so bili uporabljeni
    rawMeasurementIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SensorMeasurement',
      },
    ],
    schemaVersion: {
      type: String,
      default: '1.0',
    },
    // Cas ko je bila agregacija izvedena
    processedAtUtc: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  {
    collection: 'processed_measurements',
    versionKey: false,
    minimize: false,
  }
);

// Indexi za hitro iskanje
processedMeasurementSchema.index({ deviceId: 1, periodEndUtc: -1 });
processedMeasurementSchema.index({ sensorType: 1, periodEndUtc: -1 });
processedMeasurementSchema.index({ userId: 1, periodEndUtc: -1 });
processedMeasurementSchema.index({ aggregationType: 1, deviceId: 1 });

processedMeasurementSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

processedMeasurementSchema.statics.SENSOR_TYPES = SENSOR_TYPES;
processedMeasurementSchema.statics.AGGREGATION_TYPES = AGGREGATION_TYPES;

module.exports = mongoose.model('ProcessedMeasurement', processedMeasurementSchema);
