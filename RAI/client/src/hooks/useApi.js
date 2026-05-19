/**
 * useApi — generic hook za async API klice (SCRUM-29).
 *
 * Vraca `{ data, error, isLoading, run, reset }` in skrbi za:
 *   - obnasanje kot promise wrapper z React state-om
 *   - `AbortController` ob vsaki novi klicni-instanci IN ob unmount-u,
 *     zato da `setState` na unmounted komponentah ne razpade
 *   - clean reset (npr. po uspeshni operaciji)
 *
 * Klicatelj zagotovi `apiCall(signal, ...args)` funkcijo, ki sprejme signal.
 *
 * Primer:
 *   const { data, error, isLoading, run } = useApi(
 *     (signal, deviceId) => fetchDeviceByDeviceId(deviceId, { signal })
 *   );
 *   <button onClick={() => run('pixel-8-azur')}>Fetch</button>
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(apiCall) {
  const [state, setState] = useState({
    data: null,
    error: null,
    isLoading: false,
  });

  // Aktivni AbortController; nov klic prekine prejsnjega.
  const controllerRef = useRef(null);
  // Ali je komponenta se vedno mountana (anti `setState` na unmounted).
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setState({ data: null, error: null, isLoading: true });

      try {
        const result = await apiCall(controller.signal, ...args);
        if (!mountedRef.current || controller.signal.aborted) return null;
        setState({ data: result, error: null, isLoading: false });
        return result;
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        if (!mountedRef.current) return null;
        setState({ data: null, error: err, isLoading: false });
        return null;
      }
    },
    [apiCall]
  );

  const reset = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, run, reset };
}
