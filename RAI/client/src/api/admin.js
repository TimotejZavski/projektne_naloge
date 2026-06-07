/**
 * Admin API klient — bere /api/admin/* read-only agregate za dashboard.
 */
import { apiRequest } from './client';

export function listAdminUsers(query = {}, { signal } = {}) {
  return apiRequest('/api/admin/users', { query, signal });
}

export function getAdminUserDetail(id, { signal } = {}) {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { signal });
}

export function getAdminUserLocations(id, { signal } = {}) {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}/locations`, { signal });
}

export function getAdminVisitMeasurements(visitId, { signal } = {}) {
  return apiRequest(`/api/admin/visits/${encodeURIComponent(visitId)}/measurements`, { signal });
}

export function getAdminUsersOverview({ signal } = {}) {
  return apiRequest('/api/admin/overview/users', { signal });
}

export function listAdminCourts({ signal } = {}) {
  return apiRequest('/api/admin/courts', { signal });
}

export function getAdminCourtDetail(id, { signal } = {}) {
  return apiRequest(`/api/admin/courts/${encodeURIComponent(id)}`, { signal });
}
