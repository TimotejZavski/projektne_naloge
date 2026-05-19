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
