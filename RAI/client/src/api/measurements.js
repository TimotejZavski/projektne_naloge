/**
 * Measurements API (SCRUM-29).
 *
 * Bere senzorske meritve iz RAI backend-a.
 * Endpoint-i so v `RAI/server/src/routes/measurements.routes.js`.
 */

import { apiRequest } from './client';

/**
 * GET /api/measurements (filtri + cursor paginacija).
 *
 * @param {object} [query]
 *   - deviceId   user-facing string
 *   - sensorType 'gps' | 'accelerometer' | 'camera'
 *   - from/to    ISO 8601
 *   - limit      1..1000 (default 100)
 *   - cursor     base64url iz prejsne strani
 *   - sort       'asc' | 'desc' (default 'desc')
 */
export function listMeasurements(query = {}, { signal } = {}) {
  return apiRequest('/api/measurements', { query, signal });
}

/**
 * Convenience: zgodovina meritev za doloceno napravo po deviceId stringu.
 * Pod motorjem isti endpoint kot `listMeasurements`, samo z deviceId filterom.
 */
export function listMeasurementsForDevice(deviceId, query = {}, { signal } = {}) {
  if (!deviceId || typeof deviceId !== 'string') {
    return Promise.reject(new TypeError('listMeasurementsForDevice: deviceId je obvezen.'));
  }
  return listMeasurements({ ...query, deviceId }, { signal });
}

/**
 * SCRUM-30: polling-friendly fetch zadnjih meritev.
 *
 * Namenoma je samo tanka ovojnica nad obstojecim read endpointom:
 * SCRUM-30 ne uvaja novega dashboard UI-ja in ne spreminja backend pogodb.
 */
export function fetchLatestMeasurements(query = {}, { signal } = {}) {
  return listMeasurements(
    {
      limit: 20,
      sort: 'desc',
      ...query,
    },
    { signal }
  );
}

/**
 * Convenience za real-time pogled posamezne naprave po user-facing deviceId.
 */
export function fetchLatestMeasurementsForDevice(deviceId, query = {}, { signal } = {}) {
  if (!deviceId || typeof deviceId !== 'string') {
    return Promise.reject(new TypeError('fetchLatestMeasurementsForDevice: deviceId je obvezen.'));
  }
  return fetchLatestMeasurements({ ...query, deviceId }, { signal });
}

/**
 * GET /api/measurements/processed (SCRUM-49) — agregirani/obdelani podatki.
 *
 * Za accelerometer vsebuje izpeljano `activityLevel` in `detectionStatus`
 * (idle | light | active). Rezultat je sortiran po `periodEndUtc` padajoce.
 *
 * @param {object} [query]
 *   - deviceId        user-facing string
 *   - sensorType      'gps' | 'accelerometer'
 *   - aggregationType '5min' | '1hour' | 'daily'
 *   - limit           1..1000 (default 100)
 */
export function listProcessedMeasurements(query = {}, { signal } = {}) {
  return apiRequest('/api/measurements/processed', { query, signal });
}
