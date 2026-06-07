/**
 * Data Aggregation Service.
 *
 * Agregira raw senzorske podatke v različnih vremenskih periodah.
 * Vzame podatke iz SensorMeasurement in jih obdela v ProcessedMeasurement.
 *
 * Glavne operacije:
 *   - aggregate5min(): povprečja zadnjih 5 minut
 *   - aggregate1hour(): povprečja zadnje ure
 *   - aggregateDaily(): povprečja zadnjega dneva
 */

const SensorMeasurement = require('../models/SensorMeasurement');
const ProcessedMeasurement = require('../models/ProcessedMeasurement');

// Pragova aktivnosti = standardni odklon magnitude pospeska (m/s^2).
//   < IDLE_THRESHOLD               -> 'idle'   (igralo/igrisce prosto)
//   IDLE_THRESHOLD .. ACTIVE_..    -> 'light'  (rahla uporaba)
//   >= ACTIVE_THRESHOLD            -> 'active' (v uporabi)
// Nastavljiva po umerjanju na realnih podatkih.
const IDLE_THRESHOLD = 0.5;
const ACTIVE_THRESHOLD = 2.5;

class DataAggregationService {
  /**
   * Agregira podatke za določen period
   * @param {string} aggregationType - '5min', '1hour', 'daily'
   * @param {string} deviceId - npr. "phone-123" (opcijsko, če je empty -> vse naprave)
   * @returns {Promise<Object>} { aggregatedCount, devicesProcessed }
   */
  static async aggregate(aggregationType, deviceId = null) {
    const now = new Date();
    const { periodStart, periodEnd } = this.getPeriodBounds(aggregationType, now);

    // eslint-disable-next-line no-console
    console.log(
      `[DataAggregation] Starting ${aggregationType} aggregation: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`
    );

    let query = {
      timestampUtc: { $gte: periodStart, $lt: periodEnd },
    };

    if (deviceId) {
      query.deviceId = deviceId;
    }

    // Najdi vse raw podatke v tem periodeu
    const rawMeasurements = await SensorMeasurement.find(query).sort({ deviceId: 1, sensorType: 1 });

    if (rawMeasurements.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[DataAggregation] No raw measurements found for ${aggregationType}`);
      return { aggregatedCount: 0, devicesProcessed: 0 };
    }

    // Grupiraj po deviceId in sensorType
    const grouped = this.groupMeasurements(rawMeasurements);

    let aggregatedCount = 0;
    const devicesProcessed = new Set();

    // Za vsako skupino
    for (const [groupKey, measurements] of Object.entries(grouped)) {
      const [deviceId2, sensorType] = groupKey.split('|');
      devicesProcessed.add(deviceId2);

      const aggregatedData = this.computeAggregation(sensorType, measurements);

      // Najdi userId iz prvega raw dokumenta
      const userId = measurements[0].userId || null;

      // Shrani v processed_measurements
      const processedDoc = new ProcessedMeasurement({
        deviceId: deviceId2,
        userId,
        sensorType,
        aggregationType,
        periodStartUtc: periodStart,
        periodEndUtc: periodEnd,
        aggregatedData,
        sampleCount: measurements.length,
        rawMeasurementIds: measurements.map((m) => m._id),
      });

      await processedDoc.save();
      aggregatedCount += 1;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[DataAggregation] Completed ${aggregationType} aggregation: ${aggregatedCount} groups, ${devicesProcessed.size} devices`
    );

    return { aggregatedCount, devicesProcessed: devicesProcessed.size };
  }

  /**
   * Agregira samo zadnjih 5 minut
   */
  static async aggregate5min(deviceId = null) {
    return this.aggregate('5min', deviceId);
  }

  /**
   * Agregira samo zadnjo uro
   */
  static async aggregate1hour(deviceId = null) {
    return this.aggregate('1hour', deviceId);
  }

  /**
   * Agregira samo zadnji dan
   */
  static async aggregateDaily(deviceId = null) {
    return this.aggregate('daily', deviceId);
  }

  /**
   * Poišči periode znotraj katerih se je dogajala agregacija
   * @param {string} aggregationType
   * @param {Date} now
   * @returns {Object} { periodStart, periodEnd }
   */
  static getPeriodBounds(aggregationType, now = new Date()) {
    let periodStart;
    let periodEnd = new Date(now);

    if (aggregationType === '5min') {
      // Zadnjih 5 minut (zaokroženo)
      periodStart = new Date(now);
      periodStart.setMinutes(periodStart.getMinutes() - 5);
    } else if (aggregationType === '1hour') {
      // Zadnja ura (zaokroženo)
      periodStart = new Date(now);
      periodStart.setHours(periodStart.getHours() - 1);
    } else if (aggregationType === 'daily') {
      // Zadnji dan
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);
    } else {
      throw new Error(`Unknown aggregation type: ${aggregationType}`);
    }

    return { periodStart, periodEnd };
  }

  /**
   * Grupiraj raw meritve po deviceId in sensorType
   * @param {Array} measurements - raw SensorMeasurement dokumenti
   * @returns {Object} { "deviceId|sensorType": [...measurements] }
   */
  static groupMeasurements(measurements) {
    const grouped = {};

    for (const measurement of measurements) {
      const key = `${measurement.deviceId}|${measurement.sensorType}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(measurement);
    }

    return grouped;
  }

  /**
   * Izračunaj agregirane vrednosti na podlagi sensorType
   * @param {string} sensorType - 'gps' ali 'accelerometer'
   * @param {Array} measurements - raw meritve
   * @returns {Object} agregirani podatki
   */
  static computeAggregation(sensorType, measurements) {
    if (sensorType === 'gps') {
      return this.aggregateGPS(measurements);
    } else if (sensorType === 'accelerometer') {
      return this.aggregateAccelerometer(measurements);
    }

    throw new Error(`Unknown sensor type: ${sensorType}`);
  }

  /**
   * Agregira GPS podatke
   * @param {Array} measurements
   * @returns {Object} { avgLatitude, avgLongitude, minAccuracy, maxAccuracy }
   */
  static aggregateGPS(measurements) {
    let sumLat = 0;
    let sumLng = 0;
    let minAccuracy = Infinity;
    let maxAccuracy = 0;

    for (const m of measurements) {
      const { latitude, longitude, accuracyMeters } = m.data;

      sumLat += latitude;
      sumLng += longitude;

      if (accuracyMeters !== null && accuracyMeters !== undefined) {
        minAccuracy = Math.min(minAccuracy, accuracyMeters);
        maxAccuracy = Math.max(maxAccuracy, accuracyMeters);
      }
    }

    const count = measurements.length;

    return {
      avgLatitude: sumLat / count,
      avgLongitude: sumLng / count,
      minAccuracy: minAccuracy === Infinity ? null : minAccuracy,
      maxAccuracy: maxAccuracy === 0 ? null : maxAccuracy,
      sampleCount: count,
    };
  }

  /**
   * Agregira accelerometer podatke v meritev aktivnosti (uporabe igrala/igrisca).
   *
   * Kljucna metrika je `activityLevel` = standardni odklon magnitude pospeska.
   * Std. odklon odstrani konstantno gravitacijo (~9.81 m/s^2), zato deluje ne
   * glede na orientacijo naprave in ne glede na to, ali so podatki v 'm/s2' ali
   * 'g'. Mirujoca naprava ima ~konstantno magnitudo => nizek odklon; uporaba
   * (gibanje igrala) povzroci nihanje magnitude => visok odklon.
   *
   * @param {Array} measurements
   * @returns {Object} { avgX, avgY, avgZ, maxAccel, activityLevel, detectionStatus, sampleCount }
   */
  static aggregateAccelerometer(measurements) {
    const G = 9.81; // m/s^2 — za pretvorbo iz enote 'g'

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    const magnitudes = [];

    for (const m of measurements) {
      let { x, y, z } = m.data;
      // Normaliziraj na m/s^2, ce so podatki podani v enotah 'g'
      if (m.data.unit === 'g') {
        x *= G;
        y *= G;
        z *= G;
      }

      sumX += x;
      sumY += y;
      sumZ += z;
      magnitudes.push(Math.sqrt(x * x + y * y + z * z));
    }

    const count = measurements.length;
    const avgX = sumX / count;
    const avgY = sumY / count;
    const avgZ = sumZ / count;

    // Aktivnost = variabilnost (std. odklon) magnitude pospeska.
    // Konstantna gravitacija se odsteje sama (odklon okoli povprecja).
    const meanMag = magnitudes.reduce((a, b) => a + b, 0) / count;
    const variance =
      magnitudes.reduce((acc, mag) => acc + (mag - meanMag) ** 2, 0) / count;
    const activityLevel = Math.sqrt(variance); // m/s^2; 0 = mirovanje
    const maxAccel = Math.max(...magnitudes);

    let detectionStatus;
    if (activityLevel < IDLE_THRESHOLD) {
      detectionStatus = 'idle'; // prosto
    } else if (activityLevel < ACTIVE_THRESHOLD) {
      detectionStatus = 'light'; // rahla uporaba
    } else {
      detectionStatus = 'active'; // v uporabi
    }

    return {
      avgX: parseFloat(avgX.toFixed(3)),
      avgY: parseFloat(avgY.toFixed(3)),
      avgZ: parseFloat(avgZ.toFixed(3)),
      maxAccel: parseFloat(maxAccel.toFixed(3)),
      activityLevel: parseFloat(activityLevel.toFixed(3)),
      detectionStatus,
      sampleCount: count,
    };
  }
}

module.exports = DataAggregationService;
