/**
 * Unit testi za devices API plast (SCRUM-29).
 * Mockamo `apiRequest` (osnovni klient je sam svoj testirian).
 */

jest.mock('../client', () => {
  const actual = jest.requireActual('../client');
  return {
    ...actual,
    apiRequest: jest.fn(),
  };
});

import { apiRequest } from '../client';
import {
  fetchDeviceByDeviceId,
  fetchDeviceById,
  listDevices,
} from '../devices';

beforeEach(() => {
  apiRequest.mockReset();
});

describe('fetchDeviceByDeviceId', () => {
  it('klice GET /api/devices/by-device-id/:deviceId', async () => {
    apiRequest.mockResolvedValueOnce({ device: { deviceId: 'pixel-8-azur' } });

    const result = await fetchDeviceByDeviceId('pixel-8-azur');

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/devices/by-device-id/pixel-8-azur',
      expect.objectContaining({ signal: undefined })
    );
    expect(result.device.deviceId).toBe('pixel-8-azur');
  });

  it('URL-encodira deviceId (varnost & odpornost)', async () => {
    apiRequest.mockResolvedValueOnce({ device: {} });

    await fetchDeviceByDeviceId('weird/.. id');

    const calledPath = apiRequest.mock.calls[0][0];
    expect(calledPath).toBe('/api/devices/by-device-id/weird%2F..%20id');
  });

  it('zavrne brez deviceId', async () => {
    await expect(fetchDeviceByDeviceId()).rejects.toBeInstanceOf(TypeError);
    await expect(fetchDeviceByDeviceId('')).rejects.toBeInstanceOf(TypeError);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('preda AbortSignal', async () => {
    apiRequest.mockResolvedValueOnce({ device: {} });
    const controller = new AbortController();
    await fetchDeviceByDeviceId('id1', { signal: controller.signal });
    expect(apiRequest.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('fetchDeviceById', () => {
  it('klice GET /api/devices/:id z ObjectId', async () => {
    apiRequest.mockResolvedValueOnce({ device: { _id: 'abc' } });
    await fetchDeviceById('507f1f77bcf86cd799439011');
    expect(apiRequest.mock.calls[0][0]).toBe('/api/devices/507f1f77bcf86cd799439011');
  });
});

describe('listDevices', () => {
  it('preda query objekt', async () => {
    apiRequest.mockResolvedValueOnce({ devices: [], pagination: {} });
    await listDevices({ platform: 'android', limit: 25 });
    const [path, opts] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/devices');
    expect(opts.query).toEqual({ platform: 'android', limit: 25 });
  });
});
