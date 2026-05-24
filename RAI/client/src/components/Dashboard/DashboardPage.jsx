/**
 * DashboardPage — glavni pogled z grafično vizualizacijo (SCRUM-41).
 *
 * Združuje:
 *   - DeviceSelector (izbira naprave)
 *   - SensorTypeToggle (GPS / pospeškometer)
 *   - TimeRangePicker (hitri časovni filtri)
 *   - TimeSeriesChart (Chart.js grafikon)
 *   - GpsTraceMap (Leaflet OSM zemljevid — samo za GPS)
 *
 * Podatkovni tok:
 *   selectedDeviceId + sensorType + from/to → useRealtimeRefresh → GET /api/measurements
 *   Meritve se osvežujejo na 10s (polling).
 */

import { useCallback, useMemo, useState } from 'react';

import { listMeasurements } from '../../api/measurements';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import DeviceSelector from './DeviceSelector';
import SensorTypeToggle from './SensorTypeToggle';
import TimeSeriesChart from './TimeSeriesChart';
import GpsTraceMap from './GpsTraceMap';

const TIME_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 ura', minutes: 60 },
  { label: '6 ur', minutes: 360 },
  { label: '24 ur', minutes: 1440 },
];

export default function DashboardPage() {
  const [deviceId, setDeviceId] = useState(null);
  const [sensorType, setSensorType] = useState('gps');
  const [selectedPreset, setSelectedPreset] = useState(15); // 15 min default

  const timeRange = useMemo(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - selectedPreset * 60 * 1000).toISOString();
    return { from, to };
  }, [selectedPreset]);

  const fetcher = useCallback(
    async (signal) => {
      if (!deviceId) return { measurements: [] };
      const data = await listMeasurements(
        {
          deviceId,
          sensorType,
          from: timeRange.from,
          to: timeRange.to,
          limit: 1000,
          sort: 'asc',
        },
        { signal }
      );
      return data;
    },
    [deviceId, sensorType, timeRange.from, timeRange.to]
  );

  const {
    data,
    error,
    isRefreshing,
    refresh,
  } = useRealtimeRefresh(fetcher, {
    enabled: !!deviceId,
    intervalMs: 10000,
    immediate: true,
  });

  const measurements = useMemo(() => (data && data.measurements) || [], [data]);

  const handleDeviceChange = useCallback((id) => {
    setDeviceId(id);
  }, []);

  const handleSensorChange = useCallback((type) => {
    setSensorType(type);
  }, []);

  const handleRetry = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <header className="dashboard-page__header">
        <h2 id="dashboard-heading">Vizualizacija meritev</h2>
      </header>

      {/* Izbirniki */}
      <div className="dashboard-controls">
        <DeviceSelector selectedDeviceId={deviceId} onChange={handleDeviceChange} />
        <SensorTypeToggle selected={sensorType} onChange={handleSensorChange} />

        <div className="time-presets">
          <span className="status-label">Časovno obdobje</span>
          <div className="time-presets__buttons">
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                className={`preset-btn ${selectedPreset === preset.minutes ? 'preset-btn--active' : ''}`}
                onClick={() => setSelectedPreset(preset.minutes)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {deviceId && (
          <div className="refresh-indicator">
            {isRefreshing && <span className="refresh-dot refresh-dot--active" />}
            <button type="button" className="ghost-button" onClick={handleRetry} disabled={isRefreshing}>
              {isRefreshing ? 'Osvežujem…' : 'Osveži'}
            </button>
          </div>
        )}
      </div>

      {/* Grafikoni */}
      {!deviceId ? (
        <div className="chart-message chart-message--empty">
          <p>Izberi napravo za prikaz meritev.</p>
        </div>
      ) : (
        <div className="dashboard-charts">
          <TimeSeriesChart
            measurements={measurements}
            sensorType={sensorType}
            isLoading={!data && !error}
            error={error}
            onRetry={handleRetry}
          />

          {sensorType === 'gps' && (
            <GpsTraceMap
              measurements={measurements}
              isLoading={!data && !error}
              error={error}
              onRetry={handleRetry}
            />
          )}
        </div>
      )}
    </section>
  );
}
