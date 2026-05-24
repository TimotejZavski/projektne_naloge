/**
 * DashboardPage — glavni pogled z grafično vizualizacijo (SCRUM-41).
 *
 * Združuje:
 *   - DeviceSelector (izbira naprave)
 *   - SensorTypeToggle (GPS / pospeškometer)
 *   - Časovni filtri (15min / 1h / 6h / 24h)
 *   - TimeSeriesChart (Chart.js grafikon)
 *
 * GPS sled se pošilja navzgor prek `onGpsTraceChange` callback-a,
 * da jo App.js prikaže v obstoječem Mapbox panelu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listMeasurements } from "../../api/measurements";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";
import DeviceSelector from "./DeviceSelector";
import SensorTypeToggle from "./SensorTypeToggle";
import TimeSeriesChart from "./TimeSeriesChart";

const TIME_PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "1 ura", minutes: 60 },
  { label: "6 ur", minutes: 360 },
  { label: "24 ur", minutes: 1440 },
];

export default function DashboardPage({ onGpsTraceChange }) {
  const [deviceId, setDeviceId] = useState(null);
  const [sensorType, setSensorType] = useState("gps");
  const [selectedPreset, setSelectedPreset] = useState(60);

  // ref za sledenje spremembam brez re-render race
  const fetchKeyRef = useRef(0);

  const timeRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - selectedPreset * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [selectedPreset]);

  const fetcher = useCallback(
    async (signal) => {
      if (!deviceId) return { measurements: [] };
      return listMeasurements(
        {
          deviceId,
          sensorType,
          from: timeRange.from,
          to: timeRange.to,
          limit: 1000,
          sort: "asc",
        },
        { signal },
      );
    },
    [deviceId, sensorType, timeRange.from, timeRange.to],
  );

  const { data, error, isRefreshing, refresh, start, stop } =
    useRealtimeRefresh(fetcher, {
      enabled: false,
      intervalMs: 10000,
      immediate: false,
    });

  // ⚡ BUGFIX: ob spremembi deviceId/sensorType/preset takoj poberi na novo
  useEffect(() => {
    if (!deviceId) {
      stop();
      return;
    }
    fetchKeyRef.current += 1;
    refresh().then(() => {
      start();
    });
    // eslint-disable-next-line
  }, [deviceId, sensorType, selectedPreset, fetchKeyRef.current]);

  const measurements = useMemo(() => (data && data.measurements) || [], [data]);

  // Poslji GPS sled navzgor v App.js za Mapbox prikaz
  useEffect(() => {
    if (!onGpsTraceChange) return;
    if (sensorType !== "gps" || measurements.length === 0) {
      onGpsTraceChange(null);
      return;
    }
    const trace = measurements
      .filter(
        (m) => m.data && m.data.latitude != null && m.data.longitude != null,
      )
      .map((m) => ({ lat: m.data.latitude, lng: m.data.longitude }));
    onGpsTraceChange(trace.length >= 2 ? trace : null);
  }, [measurements, sensorType, onGpsTraceChange]);

  const handleDeviceChange = useCallback((id) => setDeviceId(id), []);
  const handleSensorChange = useCallback((type) => setSensorType(type), []);
  const handleRetry = useCallback(() => refresh(), [refresh]);

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="dashboard-controls">
        <DeviceSelector
          selectedDeviceId={deviceId}
          onChange={handleDeviceChange}
        />
        <SensorTypeToggle selected={sensorType} onChange={handleSensorChange} />

        <div className="time-presets">
          <span className="status-label">Obdobje</span>
          <div className="time-presets__buttons">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                className={`preset-btn ${selectedPreset === p.minutes ? "preset-btn--active" : ""}`}
                onClick={() => setSelectedPreset(p.minutes)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {deviceId && (
          <div className="refresh-indicator">
            <span
              className={`refresh-dot ${isRefreshing ? "refresh-dot--active" : ""}`}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={handleRetry}
              disabled={isRefreshing}
            >
              Osveži
            </button>
          </div>
        )}
      </div>

      {!deviceId ? (
        <div className="chart-message chart-message--empty">
          <p>Izberi napravo za prikaz meritev.</p>
        </div>
      ) : (
        <TimeSeriesChart
          measurements={measurements}
          sensorType={sensorType}
          isLoading={!data && !error}
          error={error}
          onRetry={handleRetry}
        />
      )}
    </section>
  );
}
