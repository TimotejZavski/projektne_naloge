/**
 * DeviceLookup — SCRUM-29 glavna komponenta.
 *
 * Vhod: textbox za `deviceId` (uporabniku viden string, npr. "pixel-8-azur").
 * Akcija: POST gumb sprozi `GET /api/devices/by-device-id/:deviceId` in
 *         (paralelno) `GET /api/measurements?deviceId=...&limit=20`.
 * Izhod: kartica z metapodatki naprave + tabela zadnjih meritev (time-series view).
 *
 * Edge cases:
 *   - prazen input -> gumb disabled
 *   - 401 -> sporocilo "Prijavi se" (AuthPanel poskrbi za login)
 *   - 404 -> "Naprava ne obstaja oz. ne pripada tebi" (anti-enumeration)
 *   - 400 (invalid deviceId) -> validation message
 *   - omrezna napaka -> retry gumb
 *
 * Komponenta ne reseva avtorizacije sama - polagamo se na AuthContext.
 */

import { useCallback, useState } from 'react';

import { fetchDeviceByDeviceId } from '../api/devices';
import { listMeasurementsForDevice } from '../api/measurements';
import { ApiError } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

const MEASUREMENT_LIMIT = 20;

export default function DeviceLookup() {
  const { status: authStatus } = useAuth();
  const [deviceId, setDeviceId] = useState('');

  const lookup = useApi(
    useCallback(async (signal, idValue) => {
      // Vzporedno: meta + zgodovina meritev. Locene napake -> ne porusimo
      // celotnega pogleda zaradi prazne zgodovine.
      const [deviceRes, measurementsRes] = await Promise.allSettled([
        fetchDeviceByDeviceId(idValue, { signal }),
        listMeasurementsForDevice(idValue, { limit: MEASUREMENT_LIMIT }, { signal }),
      ]);

      if (deviceRes.status === 'rejected') {
        throw deviceRes.reason;
      }
      return {
        device: deviceRes.value && deviceRes.value.device,
        measurements:
          measurementsRes.status === 'fulfilled'
            ? (measurementsRes.value && measurementsRes.value.measurements) || []
            : [],
        measurementsError:
          measurementsRes.status === 'rejected' ? measurementsRes.reason : null,
      };
    }, [])
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = deviceId.trim();
    if (!trimmed) return;
    lookup.run(trimmed);
  };

  const errorMessage = describeError(lookup.error, authStatus);

  return (
    <section className="lookup-panel" aria-labelledby="lookup-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SCRUM-29</p>
          <h2 id="lookup-heading">Pregled naprave po deviceId</h2>
        </div>
      </div>

      <form className="lookup-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="status-label">deviceId</span>
          <input
            type="text"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            placeholder="npr. pixel-8-azur"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="lookup-help"
          />
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={lookup.isLoading || !deviceId.trim() || authStatus !== 'authed'}
        >
          {lookup.isLoading ? 'Iscem…' : 'Poisci'}
        </button>
      </form>
      <p id="lookup-help" className="hint">
        Vnesi user-facing identifikator naprave (3–64 znakov: <code>a-z 0-9 . _ -</code>).
      </p>

      {errorMessage ? (
        <p role="alert" className="error-banner">
          {errorMessage}
        </p>
      ) : null}

      {lookup.data ? (
        <DeviceResult
          device={lookup.data.device}
          measurements={lookup.data.measurements}
          measurementsError={lookup.data.measurementsError}
        />
      ) : null}
    </section>
  );
}

function describeError(error, authStatus) {
  if (!error) return null;
  if (authStatus !== 'authed') {
    return 'Za iskanje naprav je potrebna prijava.';
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Seja je potekla. Prijavi se ponovno.';
    if (error.status === 404) return 'Naprava ne obstaja ali ne pripada prijavljenemu uporabniku.';
    if (error.status === 400) return error.message || 'Neveljaven deviceId.';
    if (error.status === 0) return 'Omrezna napaka. Preveri povezavo s strezniku.';
    return error.message || 'Nepricakovana napaka.';
  }
  return 'Nepricakovana napaka.';
}

function DeviceResult({ device, measurements, measurementsError }) {
  if (!device) return null;

  return (
    <div className="lookup-result">
      <article className="device-card">
        <header className="device-card__header">
          <div>
            <p className="eyebrow">Naprava</p>
            <h3>{device.name || device.deviceId}</h3>
          </div>
          <span className={`pill pill--${device.isActive ? 'active' : 'inactive'}`}>
            {device.isActive ? 'aktivna' : 'neaktivna'}
          </span>
        </header>
        <dl className="device-card__meta">
          <div>
            <dt>deviceId</dt>
            <dd><code>{device.deviceId}</code></dd>
          </div>
          <div>
            <dt>Platforma</dt>
            <dd>{device.platform || '—'}</dd>
          </div>
          <div>
            <dt>App verzija</dt>
            <dd>{device.appVersion || '—'}</dd>
          </div>
          <div>
            <dt>Zadnji signal</dt>
            <dd>{formatDate(device.lastSeenAtUtc)}</dd>
          </div>
          <div>
            <dt>Registracija</dt>
            <dd>{formatDate(device.createdAtUtc)}</dd>
          </div>
        </dl>
      </article>

      <article className="measurements-card">
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Zgodovina meritev</p>
            <h3>Zadnjih {MEASUREMENT_LIMIT}</h3>
          </div>
          <span>{measurements.length} zapisov</span>
        </header>
        {measurementsError ? (
          <p role="alert" className="error-banner">
            Meritev ni bilo mogoce nalozit ({describeShort(measurementsError)}).
          </p>
        ) : null}
        {measurements.length === 0 && !measurementsError ? (
          <p className="hint">Naprava se nima zabelezenih meritev.</p>
        ) : null}
        {measurements.length > 0 ? (
          <table className="measurements-table">
            <thead>
              <tr>
                <th scope="col">Cas (UTC)</th>
                <th scope="col">Senzor</th>
                <th scope="col">Vir</th>
                <th scope="col">Podatki</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m._id}>
                  <td><time dateTime={m.timestampUtc}>{formatDate(m.timestampUtc)}</time></td>
                  <td><span className={`pill pill--${m.sensorType}`}>{m.sensorType}</span></td>
                  <td>{m.source}</td>
                  <td><code>{summariseData(m.sensorType, m.data)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </article>
    </div>
  );
}

function describeShort(err) {
  if (err instanceof ApiError) return `HTTP ${err.status || '?'}`;
  return 'napaka';
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function summariseData(sensorType, data) {
  if (!data || typeof data !== 'object') return '—';
  switch (sensorType) {
    case 'gps': {
      const { latitude, longitude, accuracyMeters } = data;
      const acc = accuracyMeters != null ? ` ±${accuracyMeters}m` : '';
      return `${formatNumber(latitude)}, ${formatNumber(longitude)}${acc}`;
    }
    case 'accelerometer': {
      const { x, y, z, unit } = data;
      return `x=${formatNumber(x)} y=${formatNumber(y)} z=${formatNumber(z)} ${unit || ''}`.trim();
    }
    case 'camera': {
      const { captureId, mediaType } = data;
      return `${mediaType || 'image'} ${captureId || ''}`.trim();
    }
    default:
      return JSON.stringify(data);
  }
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value);
  // Do 5 decimalk za koordinate, locene tisocice prepuscamo brwoser-locale-u
  return Number.isInteger(value) ? String(value) : value.toFixed(5).replace(/\.?0+$/, '');
}
