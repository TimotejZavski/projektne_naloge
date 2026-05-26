/**
 * Playgrounds API — javna igrišča iz scraper baze (brez avtentikacije).
 */

import { apiRequest } from './client';

/**
 * GET /api/scraper/playgrounds
 * @returns {Promise<{ playgrounds: Array, count: number }>}
 */
export function listPlaygrounds({ signal } = {}) {
  return apiRequest('/api/scraper/playgrounds', { auth: false, signal });
}
