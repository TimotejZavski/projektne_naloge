/**
 * DashboardPage — glavni pogled z grafično vizualizacijo (SCRUM-41).
 * Uporablja preprost setInterval za polling, brez kompleksnih hook-ov.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { listMeasurements } from "../../api/measurements";
import DeviceSelector from "./DeviceSelector";
import SensorTypeToggle from "./SensorTypeToggle";
import TimeSeriesChart from "./TimeSeriesChart";

const TIME_PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "1 ura", minutes: 60 },
  { label: "6 ur", minutes: 360 },
  { label: "24 ur", minutes: 1440 },
];

export default function DashboardPage({ onDeviceChange }) {
  const [deviceId, setDeviceId] = useState(null);
  const [sensorType, setSensorType] = useState("gps");
  const [selectedPreset, setSelectedPreset] = useState(60);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const timeRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - selectedPreset * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [selectedPreset]);

  const fetchData = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listMeasurements({
        deviceId,
        sensorType,
        from: timeRange.from,
        to: timeRange.to,
        limit: 1000,
        sort: "asc",
      });
      setData(result);
      setLastFetch(Date.now());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, sensorType, timeRange.from, timeRange.to]);

  // Fetch when deviceId/sensorType/preset changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 15s
  useEffect(() => {
    if (!deviceId) return;
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData, deviceId]);

  const measurements = useMemo(() => (data && data.measurements) || [], [data]);

  // Notify parent of device changes (for map)
  useEffect(() => {
    if (onDeviceChange) onDeviceChange(deviceId);
  }, [deviceId, onDeviceChange]);

  return (
    <section className="dashboard-page">
      <div className="dashboard-controls">
        <DeviceSelector selectedDeviceId={deviceId} onChange={setDeviceId} />
        <SensorTypeToggle selected={sensorType} onChange={setSensorType} />
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
          <button
            type="button"
            className="ghost-button"
            onClick={fetchData}
            style={{ marginLeft: "auto" }}
          >
            Osveži
          </button>
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
          isLoading={loading && !data}
          error={error}
          onRetry={fetchData}
        />
      )}
    </section>
  );
}
