import {
  buildOrvCourtLiveFeedUrl,
  buildOrvUrl,
  getOrvCourtLiveState,
  getOrvHealth,
  listOrvStreams,
} from '../orv';

function makeJsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

describe('ORV API helper', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sestavi absolutni ORV URL', () => {
    expect(buildOrvUrl('/health', 'http://localhost:8000/')).toBe('http://localhost:8000/health');
  });

  it('prebere ORV health payload', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { status: 'ok' }));

    await expect(getOrvHealth({ baseUrl: 'http://orv.test' })).resolves.toEqual({ status: 'ok' });

    expect(fetch).toHaveBeenCalledWith('http://orv.test/health', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json' },
    }));
  });

  it('prebere seznam streamov', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { streams: [{ id: 'demo', url: '/streams/demo' }] }));

    await expect(listOrvStreams({ baseUrl: 'http://orv.test/' })).resolves.toEqual({
      streams: [{ id: 'demo', url: '/streams/demo' }],
    });
  });

  it('prebere live state za igrisce', async () => {
    fetch.mockResolvedValueOnce(makeJsonResponse(200, { players: 4, status: 'ZASEDENO' }));

    await expect(getOrvCourtLiveState('test-court-1', { baseUrl: 'http://orv.test' })).resolves.toEqual({
      players: 4,
      status: 'ZASEDENO',
    });

    expect(fetch.mock.calls[0][0]).toBe('http://orv.test/orv/courts/test-court-1/live/state');
  });

  it('sestavi live feed URL za MJPEG tok', () => {
    expect(buildOrvCourtLiveFeedUrl('test-court-1', 'http://orv.test')).toBe(
      'http://orv.test/orv/courts/test-court-1/live/feed'
    );
  });

  it('zavrne neveljaven path', () => {
    expect(() => buildOrvUrl('health')).toThrow(TypeError);
  });
});
