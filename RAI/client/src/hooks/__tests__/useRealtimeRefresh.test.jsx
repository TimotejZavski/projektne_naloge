/**
 * Unit testi za SCRUM-30 polling hook.
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { MIN_REALTIME_INTERVAL_MS, useRealtimeRefresh } from '../useRealtimeRefresh';

describe('useRealtimeRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ne klice fetcherja, dokler ni enabled', () => {
    const fetcher = jest.fn().mockResolvedValue({ measurements: [] });
    const { result } = renderHook(() => useRealtimeRefresh(fetcher));

    expect(result.current.isRunning).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ob enabled naredi immediate refresh in shrani lastUpdatedAt', async () => {
    const payload = { measurements: [{ deviceId: 'phone-1' }] };
    const fetcher = jest.fn().mockResolvedValue(payload);

    const { result } = renderHook(() =>
      useRealtimeRefresh(fetcher, { enabled: true, intervalMs: 2000 })
    );

    await waitFor(() => expect(result.current.data).toEqual(payload));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(Date.parse(result.current.lastUpdatedAt)).toBeGreaterThanOrEqual(
      Date.parse('2026-05-20T12:00:00.000Z')
    );
  });

  it('ponavlja refresh po intervalu brez prekrivanja rocnega refresh-a', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ tick: 1 })
      .mockResolvedValueOnce({ tick: 2 });

    const { result } = renderHook(() =>
      useRealtimeRefresh(fetcher, { enabled: true, intervalMs: 2000 })
    );

    await waitFor(() => expect(result.current.data).toEqual({ tick: 1 }));

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => expect(result.current.data).toEqual({ tick: 2 }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stop prekine aktivni request in ustavi timer', async () => {
    const signals = [];
    const fetcher = jest.fn((signal) => {
      signals.push(signal);
      return new Promise(() => {});
    });

    const { result } = renderHook(() =>
      useRealtimeRefresh(fetcher, { enabled: true, intervalMs: 2000 })
    );

    await waitFor(() => expect(signals).toHaveLength(1));

    act(() => {
      result.current.stop();
    });

    expect(signals[0].aborted).toBe(true);
    expect(result.current.isRunning).toBe(false);

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('normalizira premajhen interval na varno spodnjo mejo', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ tick: 1 })
      .mockResolvedValueOnce({ tick: 2 });

    const { result } = renderHook(() =>
      useRealtimeRefresh(fetcher, { enabled: true, intervalMs: 10 })
    );

    await waitFor(() => expect(result.current.data).toEqual({ tick: 1 }));

    await act(async () => {
      jest.advanceTimersByTime(MIN_REALTIME_INTERVAL_MS - 1);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => expect(result.current.data).toEqual({ tick: 2 }));
  });
});
