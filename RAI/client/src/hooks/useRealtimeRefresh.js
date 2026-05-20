/**
 * useRealtimeRefresh — SCRUM-30 polling sloj za "real-time" UI.
 *
 * Hook ne ve nic o dashboard/detail komponentah. Klicatelj poda fetcher,
 * hook pa skrbi za interval, rocen refresh, AbortController in cleanup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_REALTIME_INTERVAL_MS = 5000;
export const MIN_REALTIME_INTERVAL_MS = 1000;

function normalizeInterval(intervalMs) {
  const parsed = Number.parseInt(intervalMs, 10);
  if (Number.isNaN(parsed)) return DEFAULT_REALTIME_INTERVAL_MS;
  return Math.max(parsed, MIN_REALTIME_INTERVAL_MS);
}

export function useRealtimeRefresh(fetcher, options = {}) {
  const {
    enabled = false,
    intervalMs = DEFAULT_REALTIME_INTERVAL_MS,
    immediate = true,
  } = options;

  const [state, setState] = useState({
    data: null,
    error: null,
    isRefreshing: false,
    isRunning: Boolean(enabled),
    lastUpdatedAt: null,
  });

  const fetcherRef = useRef(fetcher);
  const timerRef = useRef(null);
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);
  const enabledRef = useRef(Boolean(enabled));
  const intervalRef = useRef(normalizeInterval(intervalMs));

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const abortCurrent = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    clearTimer();
    abortCurrent();

    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      error: null,
      isRefreshing: true,
    }));

    try {
      const data = await fetcherRef.current(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return null;

      const updatedAt = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        data,
        error: null,
        isRefreshing: false,
        lastUpdatedAt: updatedAt,
      }));
      return data;
    } catch (error) {
      if (error && error.name === 'AbortError') return null;
      if (!mountedRef.current) return null;

      setState((prev) => ({
        ...prev,
        error,
        isRefreshing: false,
      }));
      return null;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [abortCurrent, clearTimer]);

  const scheduleNext = useCallback(() => {
    clearTimer();
    if (!enabledRef.current) return;

    timerRef.current = setTimeout(async () => {
      await refresh();
      scheduleNext();
    }, intervalRef.current);
  }, [clearTimer, refresh]);

  const start = useCallback(() => {
    enabledRef.current = true;
    setState((prev) => ({ ...prev, isRunning: true }));
    scheduleNext();
  }, [scheduleNext]);

  const stop = useCallback(() => {
    enabledRef.current = false;
    clearTimer();
    abortCurrent();
    setState((prev) => ({
      ...prev,
      isRefreshing: false,
      isRunning: false,
    }));
  }, [abortCurrent, clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    enabledRef.current = Boolean(enabled);
    intervalRef.current = normalizeInterval(intervalMs);

    setState((prev) => ({
      ...prev,
      isRunning: Boolean(enabled),
    }));

    if (enabled) {
      if (immediate) {
        refresh().finally(scheduleNext);
      } else {
        scheduleNext();
      }
    } else {
      clearTimer();
      abortCurrent();
    }

    return () => {
      mountedRef.current = false;
      clearTimer();
      abortCurrent();
    };
  }, [abortCurrent, clearTimer, enabled, immediate, intervalMs, refresh, scheduleNext]);

  return {
    ...state,
    refresh,
    start,
    stop,
  };
}
