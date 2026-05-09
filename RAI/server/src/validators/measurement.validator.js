/**
 * Joi sheme za sensor measurement endpoint-e.
 *
 * `data` je shapen glede na `sensorType` (Joi `when` pogojno vejanje).
 *
 * GPS koordinate:
 *   - latitude: -90..+90
 *   - longitude: -180..+180
 *   - accuracyMeters: opcijsko, >= 0
 *
 * Pospeskomer:
 *   - x, y, z: real (m/s2 ali g)
 *   - unit: opcijsko ('m/s2' default)
 *
 * Kamera:
 *   - captureId in mediaType identificirata zajem
 *   - gps je obvezen, ker posnetek brez lokacije ni uporaben za mapo
 *
 * Batch limit: 100 meritev na zahtevo.
 *   - omeji DoS surface (pri 10 Hz pospeskomer = 10 sekundni okvir)
 *   - omeji response time (single insertMany do 100 dokumentov < 50ms)
 *   - klient lahko v eni sekundi naredi vec batch-ev ce treba
 */

const Joi = require('joi');

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;
const SENSOR_TYPES = ['gps', 'accelerometer', 'camera'];

const gpsDataSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracyMeters: Joi.number().min(0).optional(),
}).unknown(false); // strict: dodatna polja zavrnjena

const accelDataSchema = Joi.object({
  x: Joi.number().required(),
  y: Joi.number().required(),
  z: Joi.number().required(),
  unit: Joi.string().valid('m/s2', 'g').optional(),
}).unknown(false);

const cameraGpsSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracyMeters: Joi.number().min(0).optional(),
}).unknown(false);

const cameraDataSchema = Joi.object({
  captureId: Joi.string().trim().min(1).max(120).required(),
  mediaType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp').required(),
  imageUrl: Joi.string().uri().optional(),
  gps: cameraGpsSchema.required(),
}).unknown(false);

const singleMeasurementSchema = Joi.object({
  schemaVersion: Joi.string().valid('1.0').default('1.0'),
  deviceId: Joi.string().pattern(DEVICE_ID_PATTERN).required(),
  sensorType: Joi.string().valid(...SENSOR_TYPES).required(),
  timestampUtc: Joi.date().iso().max('now').required().messages({
    'date.max': 'timestampUtc ne sme biti v prihodnosti.',
    'date.format': 'timestampUtc mora biti veljaven ISO 8601 datetime.',
  }),
  data: Joi.alternatives()
    .conditional('sensorType', [
      { is: 'gps', then: gpsDataSchema.required() },
      { is: 'accelerometer', then: accelDataSchema.required() },
      { is: 'camera', then: cameraDataSchema.required() },
    ])
    .required(),
});

const batchMeasurementsSchema = Joi.object({
  measurements: Joi.array()
    .items(singleMeasurementSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'Vsaj 1 meritev je obvezna.',
      'array.max': 'Maksimalno 100 meritev na zahtevo.',
    }),
});

// Query za GET /api/measurements
const listMeasurementsQuerySchema = Joi.object({
  deviceId: Joi.string().pattern(DEVICE_ID_PATTERN),
  sensorType: Joi.string().valid(...SENSOR_TYPES),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from')).messages({
    'date.greater': 'to mora biti po from.',
  }),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  // Cursor je base64url-encoded compound (timestampUtc + _id). Tukaj
  // samo grobo preverimo dolzino in znake; podrobno dekodiranje opravi
  // controller (s 400 INVALID_CURSOR ce je neveljaven).
  cursor: Joi.string().pattern(/^[A-Za-z0-9_-]{8,256}$/),
  sort: Joi.string().valid('asc', 'desc').default('desc'),
});

const measurementIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const triggerAggregationSchema = Joi.object({
  aggregationType: Joi.string().valid('5min', '1hour', 'daily').required(),
});

module.exports = {
  singleMeasurementSchema,
  batchMeasurementsSchema,
  listMeasurementsQuerySchema,
  measurementIdParamSchema,
  triggerAggregationSchema,
  // Izpostavljeno za teste
  gpsDataSchema,
  accelDataSchema,
  cameraDataSchema,
};
