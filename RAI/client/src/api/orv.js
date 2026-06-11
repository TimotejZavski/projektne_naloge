const DEFAULT_ORV_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_ORV_BASE_URL)
  || 'http://localhost:8000';

function normalizeBaseUrl(baseUrl = DEFAULT_ORV_BASE_URL) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

async function fetchOrvJson(path, { signal, baseUrl } = {}) {
  const target = `${normalizeBaseUrl(baseUrl)}${path}`;
  const response = await fetch(target, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`ORV HTTP ${response.status}`);
  }

  return response.json();
}

export function getOrvBaseUrl() {
  return normalizeBaseUrl();
}

export function buildOrvUrl(path, baseUrl = DEFAULT_ORV_BASE_URL) {
  if (!path.startsWith('/')) {
    throw new TypeError('buildOrvUrl: path mora zaceti z /');
  }

  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

export function getOrvHealth(options = {}) {
  return fetchOrvJson('/health', options);
}

export function listOrvStreams(options = {}) {
  return fetchOrvJson('/streams', options);
}

export function getOrvCourtLiveState(courtId, options = {}) {
  if (!courtId) {
    throw new TypeError('getOrvCourtLiveState: courtId je obvezen');
  }

  return fetchOrvJson(`/orv/courts/${encodeURIComponent(courtId)}/live/state`, options);
}

export function buildOrvCourtLiveFeedUrl(courtId, baseUrl = DEFAULT_ORV_BASE_URL) {
  if (!courtId) {
    throw new TypeError('buildOrvCourtLiveFeedUrl: courtId je obvezen');
  }

  return buildOrvUrl(`/orv/courts/${encodeURIComponent(courtId)}/live/feed`, baseUrl);
}
