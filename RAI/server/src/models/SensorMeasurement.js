/**
 * SensorMeasurement model.
 *
 * Skladno z `RAI/schemas/sensor-measurement.schema.json` (SCRUM-5) in
 * `RAI/database/mongodb-collections.json` (kolekcija sensor_measurements):
 *   obvezna polja: deviceId, sensorType, timestampUtc, data, source
 *   indexi: (deviceId, timestampUtc), (sensorType, timestampUtc)
 *
 * `data` je raznolik glede na sensorType:
 *   - gps:           { latitude, longitude, accuracyMeters? }
 *   - accelerometer: { x, y, z, unit? }
 *
 * Mongoose `Mixed` tip pusti `data` brez sheme - validacijo opravimo
 * v Joi shemi pred shranjevanjem (boljsi error messages + tighter
 * validacija kot Mongoose Mixed).
 *
 * `source` polje ('http' | 'mqtt') sluzi za revizijo in casnejsi sankcijsko
 * razlikovanje (npr. MQTT podatki se prejmejo brez auth -> nizja zaupljivost).
 */

const mongoose = require('mongoose');

const SENSOR_TYPES = ['gps', 'accelerometer'];
const SOURCES = ['http', 'mqtt'];

const sensorMeasurementSchema = new mongoose.Schema(
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
    timestampUtc: {
      type: Date,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    source: {
      type: String,
      enum: SOURCES,
      required: true,
      default: 'http',
    },
    schemaVersion: {
      type: String,
      default: '1.0',
    },
    receivedAtUtc: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  {
    collection: 'sensor_measurements',
    versionKey: false,
    minimize: false,
  }
);

// Compound indexi (skladno z mongodb-collections.json):
sensorMeasurementSchema.index({ deviceId: 1, timestampUtc: -1 });
sensorMeasurementSchema.index({ sensorType: 1, timestampUtc: -1 });
// Bonus: podpora za "vse meritve uporabnika v casovnem obdobju"
sensorMeasurementSchema.index({ userId: 1, timestampUtc: -1 });

sensorMeasurementSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

sensorMeasurementSchema.statics.SENSOR_TYPES = SENSOR_TYPES;
sensorMeasurementSchema.statics.SOURCES = SOURCES;

module.exports = mongoose.model('SensorMeasurement', sensorMeasurementSchema);
