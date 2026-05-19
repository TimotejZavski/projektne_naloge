/**
 * Devices API (SCRUM-29).
 *
 * Tanka semanticna plast nad `apiRequest` — vsaka funkcija ustreza enemu
 * endpoint-u v `RAI/server/src/routes/devices.routes.js`.
 *
 * Vsi vracajo "raw" payload backend-a (`{ device }`, `{ devices, pagination }`).
 * UI komponente potem berejo .device / .devices brez dodatne abstrakcije.
 */

import { apiRequest } from './client';

/**
 * SCRUM-29: glavni endpoint za "fetch po device ID".
 * GET /api/devices/by-device-id/:deviceId
 */
export function fetchDeviceByDeviceId(deviceId, { signal } = {}) {
  if (!deviceId || typeof deviceId !== 'string') {
    return Promise.reject(new TypeError('fetchDeviceByDeviceId: deviceId je obvezen.'));
  }
  return apiRequest(`/api/devices/by-device-id/${encodeURIComponent(deviceId)}`, { signal });
}

/**
 * Alternativna pot — fetch po Mongo ObjectId (npr. iz seznama).
 * GET /api/devices/:id
 */
export function fetchDeviceById(id, { signal } = {}) {
  if (!id || typeof id !== 'string') {
    return Promise.reject(new TypeError('fetchDeviceById: id je obvezen.'));
  }
  return apiRequest(`/api/devices/${encodeURIComponent(id)}`, { signal });
}

/**
 * GET /api/devices  (s filtri in cursor paginacijo).
 *
 * @param {object} [query]   { isActive, platform, limit, cursor }
 * @param {object} [options] { signal }
 */
export function listDevices(query = {}, { signal } = {}) {
  return apiRequest('/api/devices', { query, signal });
}
