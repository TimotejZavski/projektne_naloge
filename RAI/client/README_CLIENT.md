# RAI client

Spletna aplikacija (React) za pregled naprav, igralisc in senzorskih meritev.

## Zagon

```bash
npm install
npm start
```

Aplikacija se zazene na <http://localhost:3000> in zaradi `proxy` polja v
`package.json` API klice (`/api/*`) preusmeri na backend na
`http://localhost:5000`.

## Konfiguracija

| Var | Privzeto | Opis |
| --- | --- | --- |
| `REACT_APP_API_BASE_URL` | `""` (prazen) | Absolutni URL backend-a (prazno = CRA proxy). |
| `REACT_APP_MAPBOX_TOKEN` | — | Public Mapbox token za prikaz lokacije igralisca. |

Kopiraj `.env.example` v `.env` in nastavi `REACT_APP_MAPBOX_TOKEN`. Brez tokena
se prikaze nadomestni map panel.

## Funkcije

- **SCRUM-25** — osnovni dashboard skeleton in Mapbox prikaz lokacije.
- **SCRUM-29** — prijava (`AuthPanel`) in iskanje naprave po user-facing
  `deviceId` (`DeviceLookup`). Prikaze metapodatke naprave + zadnjih 20 meritev
  v "time-series" tabeli.

## Arhitektura

```
src/
  api/
    client.js          - fetch wrapper (Bearer, ApiError, AbortSignal)
    auth.js            - login / logout / refresh / me
    devices.js         - fetchDeviceByDeviceId, fetchDeviceById, listDevices
    measurements.js    - listMeasurements, listMeasurementsForDevice
  context/
    AuthContext.jsx    - hrani user state + tih refresh ob mount-u
  hooks/
    useApi.js          - async hook z abort + loading + error
  components/
    AuthPanel.jsx
    DeviceLookup.jsx
  App.js
  setupTests.js
```

### API klient

- Access token se hrani **v pomnilniku + sessionStorage** (NE localStorage —
  XSS).
- Vsak HTTP klic vraca JSON ali vrze `ApiError({ status, code, message })`
  — UI obravnava napake skladno (401 = prijavi se, 404 = anti-enumeration ...).
- Vsi async klici sprejmejo `AbortSignal` (uporabljen v `useApi`).

## Testi

```bash
npm test          # enkratni run (CI)
npm run test:watch
```

Testi pokrivajo:
- API klient (fetch wrapper, headers, error mapping, abort, storage)
- API service plast (devices, measurements)
- `useApi` hook (loading state, abort, cleanup)
- `DeviceLookup` komponenta (happy path, 401/404/400/network errors, auth gating)

Trenutno stanje: **36 testov v 5 suite-ih**.
