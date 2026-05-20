/**
 * Unit testi za measurements API plast (SCRUM-29).
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
  fetchLatestMeasurements,
  fetchLatestMeasurementsForDevice,
  listMeasurements,
  listMeasurementsForDevice,
} from '../measurements';

beforeEach(() => {
  apiRequest.mockReset();
});

describe('listMeasurements', () => {
  it('GET /api/measurements z query', async () => {
    apiRequest.mockResolvedValueOnce({ measurements: [], pagination: {} });
    await listMeasurements({ sensorType: 'gps', limit: 10 });
    const [path, opts] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/measurements');
    expect(opts.query).toEqual({ sensorType: 'gps', limit: 10 });
  });
});

describe('listMeasurementsForDevice', () => {
  it('vsadi deviceId v query', async () => {
    apiRequest.mockResolvedValueOnce({ measurements: [] });
    await listMeasurementsForDevice('phone-1', { limit: 5 });
    expect(apiRequest.mock.calls[0][1].query).toEqual({ deviceId: 'phone-1', limit: 5 });
  });

  it('zavrne brez deviceId', async () => {
    await expect(listMeasurementsForDevice('')).rejects.toBeInstanceOf(TypeError);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('SCRUM-30 realtime measurement helpers', () => {
  it('fetchLatestMeasurements nastavi polling-friendly defaults', async () => {
    apiRequest.mockResolvedValueOnce({ measurements: [] });
    await fetchLatestMeasurements({ sensorType: 'gps' });

    expect(apiRequest.mock.calls[0]).toEqual([
      '/api/measurements',
      {
        query: { limit: 20, sort: 'desc', sensorType: 'gps' },
        signal: undefined,
      },
    ]);
  });

  it('fetchLatestMeasurementsForDevice vsadi deviceId', async () => {
    apiRequest.mockResolvedValueOnce({ measurements: [] });
    await fetchLatestMeasurementsForDevice('phone-1', { limit: 5 });

    expect(apiRequest.mock.calls[0][1].query).toEqual({
      limit: 5,
      sort: 'desc',
      deviceId: 'phone-1',
    });
  });
});
