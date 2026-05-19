/**
 * HTTP klient za RAI backend (SCRUM-29).
 *
 * Centraliziran wrapper okrog `fetch`:
 *   - Base URL iz `REACT_APP_API_BASE_URL` (default: '' -> CRA proxy v package.json
 *     preusmeri /api klice na http://localhost:5000).
 *   - JSON request/response (Content-Type, parsing).
 *   - Authorization: Bearer header iz `getAccessToken()` (in-memory + sessionStorage).
 *   - 4xx/5xx -> `ApiError` z `status`, `code`, `message` -> UI ga preprosto razume.
 *   - `AbortSignal` podpora za preklic (npr. ob unmount-u komponente).
 *
 * Klient namenoma NE shrani access tokena v localStorage (XSS surface).
 * sessionStorage je sredina: preživi reload znotraj tab-a, izgine ob zaprtju.
 */

const DEFAULT_BASE_URL =
  // CRA gradi process.env med build-om; v testih je process undefined v jsdom okolju.
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE_URL) || '';

const ACCESS_TOKEN_STORAGE_KEY = 'rai_access_token';

let inMemoryToken = null;

function safeSessionStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  if (inMemoryToken) return inMemoryToken;
  const store = safeSessionStorage();
  if (!store) return null;
  return store.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function setAccessToken(token) {
  inMemoryToken = token || null;
  const store = safeSessionStorage();
  if (!store) return;
  if (token) {
    store.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    store.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

function buildQueryString(query) {
  if (!query || typeof query !== 'object') return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || null;
    this.details = details || null;
  }
}

/**
 * Skupna fetch ovojnica. Vrne JSON ali vrze `ApiError`.
 *
 * @param {string} path        Relativna pot (mora se zaceti z '/'), npr. '/api/devices'.
 * @param {object} [options]
 * @param {string} [options.method]  HTTP metoda (default 'GET').
 * @param {object} [options.body]    JSON body (bo serializiran).
 * @param {object} [options.query]   Query parametri (object -> ?a=1&b=2).
 * @param {AbortSignal} [options.signal] Za preklic.
 * @param {boolean} [options.auth=true]  Ali pripeti Bearer header.
 * @param {string} [options.baseUrl] Override base URL (za teste).
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    signal,
    auth = true,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('apiRequest: path mora biti string, ki se zacne z /');
  }

  // Sestavi target URL:
  // - Ce je baseUrl prazen, ohrani relativno pot (CRA proxy poskrbi za /api/* preusmeritev).
  // - Sicer uporabi absolutno pot (npr. produkcijski API gostuje na drugem domeni).
  const qs = buildQueryString(query);
  const target = `${baseUrl}${path}${qs}`;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Omrezna napaka. Preveri povezavo s strezniku.',
      details: { cause: err && err.message },
    });
  }

  // 204 No Content
  if (response.status === 204) return null;

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    // Backend vedno odgovarja v JSON-u, a defenzivno
    try {
      const text = await response.text();
      payload = text ? { error: { message: text } } : null;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errObj = (payload && payload.error) || {};
    throw new ApiError({
      status: response.status,
      code: errObj.code,
      message: errObj.message || `HTTP ${response.status}`,
      details: errObj.details || null,
    });
  }

  return payload;
}
