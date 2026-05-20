# SCRUM-30 Real-time osvezevanje

SCRUM-30 doda reusable polling sloj za UI, brez implementacije dashboard ali
detail view komponent iz SCRUM-27/SCRUM-28.

## Odlocitev

Trenutni backend ze stabilno podpira `GET /api/measurements` z avtentikacijo,
filtri in cursor paginacijo. Zato SCRUM-30 uporablja polling kot varno prvo
verzijo real-time osvezevanja. WebSocket lahko kasneje doda enako pogodbo nad
istim UI hookom, brez posega v dashboard komponente.

## Client API

- `fetchLatestMeasurements(query, options)` v
  `RAI/client/src/api/measurements.js`
- `fetchLatestMeasurementsForDevice(deviceId, query, options)` za posamezno
  napravo
- `useRealtimeRefresh(fetcher, options)` v
  `RAI/client/src/hooks/useRealtimeRefresh.js`

Primer uporabe v prihodnjem SCRUM-27/SCRUM-28 UI:

```jsx
const realtime = useRealtimeRefresh(
  (signal) => fetchLatestMeasurementsForDevice(deviceId, { limit: 20 }, { signal }),
  { enabled: Boolean(deviceId), intervalMs: 5000 }
);
```

Hook vraca:

- `data`
- `error`
- `isRefreshing`
- `isRunning`
- `lastUpdatedAt`
- `refresh()`
- `start()`
- `stop()`

Hook sam prekine stare requeste z `AbortController`, pocisti timer ob unmountu
in normalizira interval na najmanj 1000 ms.
