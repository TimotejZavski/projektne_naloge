/**
 * Auth API (minimalna podpora za SCRUM-29 UI).
 *
 * Backend (SCRUM-13) vraca `{ user, accessToken, refreshExpiresAt }`.
 * Refresh token je nastavljen v HTTP-only cookie na /api/auth, kar pomeni
 * da je login + refresh + logout dovolj za delovanje dashboard-a brez ekspliciten
 * upravljanja refresh tokena na frontend strani.
 */

import { apiRequest, setAccessToken } from './client';

export async function login({ email, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  if (data && data.accessToken) setAccessToken(data.accessToken);
  return data;
}

export async function register({ email, password, displayName }) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
    auth: false,
  });
  if (data && data.accessToken) setAccessToken(data.accessToken);
  return data;
}

export async function refresh() {
  const data = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    auth: false, // refresh stoji na HTTP-only cookie
  });
  if (data && data.accessToken) setAccessToken(data.accessToken);
  return data;
}

export async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', auth: false });
  } finally {
    setAccessToken(null);
  }
}

export async function fetchCurrentUser({ signal } = {}) {
  return apiRequest('/api/auth/me', { signal });
}
