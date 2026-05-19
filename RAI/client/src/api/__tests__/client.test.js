/**
 * Unit testi za API klient (SCRUM-29).
 *
 * Mockamo `global.fetch`. Vsak test poskrbi za reset stanja:
 *   - cisto fetch mock
 *   - cist sessionStorage (token-i)
 *   - cist in-memory token
 */

import {
  ApiError,
  apiRequest,
  getAccessToken,
  setAccessToken,
} from '../client';

function makeJsonResponse(status, body, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('apiRequest', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.sessionStorage.clear();
    setAccessToken(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET vrne payload za 2xx', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { device: { deviceId: 'a' } }));

    const result = await apiRequest('/api/devices/by-device-id/a');

    expect(result).toEqual({ device: { deviceId: 'a' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/devices/by-device-id/a');
    expect(init.method).toBe('GET');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.credentials).toBe('include');
  });

  it('pripeti Bearer token, ce je v sessionStorage', async () => {
    setAccessToken('my-token-123');
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));

    await apiRequest('/api/auth/me');

    const init = fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer my-token-123');
  });

  it('NE pripeti Authorization header pri auth:false', async () => {
    setAccessToken('my-token-123');
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));

    await apiRequest('/api/auth/login', { method: 'POST', body: { e: 1 }, auth: false });

    const init = fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('POST serializira body in nastavi Content-Type', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(201, { device: { deviceId: 'a' } }));

    await apiRequest('/api/devices', { method: 'POST', body: { deviceId: 'a' } });

    const init = fetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ deviceId: 'a' }));
  });

  it('query parametre zlepi v URL in preskoci undefined/null/empty', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { measurements: [] }));

    await apiRequest('/api/measurements', {
      query: { deviceId: 'x', sensorType: 'gps', limit: 50, cursor: undefined, sort: '' },
    });

    const url = fetch.mock.calls[0][0];
    expect(url).toMatch(/^\/api\/measurements\?/);
    expect(url).toContain('deviceId=x');
    expect(url).toContain('sensorType=gps');
    expect(url).toContain('limit=50');
    expect(url).not.toContain('cursor');
    expect(url).not.toContain('sort=');
  });

  it('4xx vrze ApiError s status, code, message', async () => {
    fetch.mockResolvedValueOnce(
      makeJsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Naprava ne obstaja.' } })
    );

    await expect(apiRequest('/api/devices/by-device-id/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Naprava ne obstaja.',
    });
  });

  it('5xx brez JSON body se vede defenzivno', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(500, 'Internal Server Error', 'text/plain'));

    const err = await apiRequest('/api/devices').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  it('204 No Content vrne null', async () => {
    fetch.mockResolvedValueOnce({
      status: 204,
      ok: true,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('no body')),
      text: () => Promise.resolve(''),
    });

    const result = await apiRequest('/api/devices/507f1f77bcf86cd799439099', { method: 'DELETE' });
    expect(result).toBeNull();
  });

  it('omrezna napaka -> ApiError s status=0 in code=NETWORK_ERROR', async () => {
    fetch.mockRejectedValueOnce(new TypeError('failed to fetch'));

    const err = await apiRequest('/api/devices').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('AbortError propagira nesposjeno', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    fetch.mockRejectedValueOnce(abortErr);

    await expect(apiRequest('/api/devices')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('zavrne path, ki se ne zacne z /', async () => {
    await expect(apiRequest('api/devices')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('access token storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setAccessToken(null);
  });

  it('set + get preko sessionStorage', () => {
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
    expect(window.sessionStorage.getItem('rai_access_token')).toBe('abc');
  });

  it('setAccessToken(null) izbrise tudi storage', () => {
    setAccessToken('abc');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem('rai_access_token')).toBeNull();
  });
});
