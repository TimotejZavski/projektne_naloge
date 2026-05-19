/**
 * Unit testi za useApi hook (SCRUM-29).
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useApi } from '../useApi';

describe('useApi', () => {
  it('initial state: data/error null, isLoading false', () => {
    const { result } = renderHook(() => useApi(jest.fn()));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('run() resolves: data set, error null, isLoading false', async () => {
    const apiCall = jest.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useApi(apiCall));

    let returned;
    await act(async () => {
      returned = await result.current.run('arg1');
    });

    expect(returned).toEqual({ ok: true });
    expect(result.current.data).toEqual({ ok: true });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall.mock.calls[0][1]).toBe('arg1'); // signal je v [0]
  });

  it('run() rejects: error set, data null', async () => {
    const apiCall = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useApi(apiCall));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error).toEqual(new Error('boom'));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('AbortError ne nastavi state-a', async () => {
    const abortErr = new Error('abort');
    abortErr.name = 'AbortError';
    const apiCall = jest.fn().mockRejectedValue(abortErr);
    const { result } = renderHook(() => useApi(apiCall));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('drug run() prekine prvega (signal.abort)', async () => {
    const signals = [];
    const apiCall = jest.fn((signal) => {
      signals.push(signal);
      return new Promise((resolve) => setTimeout(() => resolve('done'), 50));
    });
    const { result } = renderHook(() => useApi(apiCall));

    await act(async () => {
      result.current.run();
      result.current.run();
      await waitFor(() => expect(signals.length).toBe(2));
    });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('reset() pociscit state in prekine aktiven klic', async () => {
    const apiCall = jest.fn(() => new Promise(() => {})); // nikoli ne resolva
    const { result } = renderHook(() => useApi(apiCall));

    act(() => { result.current.run(); });
    expect(result.current.isLoading).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
