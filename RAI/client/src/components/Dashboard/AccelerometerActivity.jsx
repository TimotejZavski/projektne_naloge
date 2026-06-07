/**
 * AccelerometerActivity — vizualizacija uporabe igrišča iz pospeškometra (SCRUM-49).
 *
 * Bere agregirane podatke (`GET /api/measurements/processed`), ki vsebujejo
 * izpeljano `activityLevel` (std. odklon magnitude pospeska) in `detectionStatus`
 * (idle | light | active). Prikaže:
 *   - značko trenutnega stanja (Prosto / Rahla uporaba / V uporabi),
 *   - časovni graf aktivnosti, obarvan po stanju.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";

import { listProcessedMeasurements } from "../../api/measurements";
import {
  buildActivityOptions,
  buildActivityDatasets,
  statusMeta,
} from "../../services/chartHelpers";
import ChartPanel from "./ChartPanel";

export default function AccelerometerActivity({ deviceId }) {
  const [processed, setProcessed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchProcessed = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listProcessedMeasurements({
        deviceId,
        sensorType: "accelerometer",
        limit: 200,
      });
      setProcessed(res.measurements || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchProcessed();
  }, [fetchProcessed]);

  // Osvezuj vsakih 30s (agregati se ne posodabljajo pogosto).
  useEffect(() => {
    if (!deviceId) return undefined;
    const id = setInterval(fetchProcessed, 30000);
    return () => clearInterval(id);
  }, [fetchProcessed, deviceId]);

  // API vraca padajoce po periodEndUtc; za graf rabimo narascajoce.
  const chrono = useMemo(
    () =>
      [...processed].sort(
        (a, b) => new Date(a.periodEndUtc) - new Date(b.periodEndUtc),
      ),
    [processed],
  );
  const latest = processed[0]; // najnovejši (padajoče → prvi)
  const isEmpty = chrono.length === 0;

  const { options, data } = useMemo(() => {
    if (isEmpty) return { options: null, data: null };
    return {
      options: buildActivityOptions(),
      data: { datasets: buildActivityDatasets(chrono) },
    };
  }, [chrono, isEmpty]);

  const meta = latest
    ? statusMeta(latest.aggregatedData?.detectionStatus)
    : null;
  const latestLevel = latest?.aggregatedData?.activityLevel ?? 0;

  return (
    <ChartPanel
      title="Aktivnost igrišča (pospeškometer)"
      subtitle={!isEmpty ? `${chrono.length} agregiranih obdobij` : undefined}
      isLoading={loading && isEmpty}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="Ni agregiranih podatkov o aktivnosti. Sproži agregacijo (POST /api/measurements/aggregate) ali počakaj na razporejevalnik."
      onRetry={fetchProcessed}
    >
      {meta && (
        <div className="activity-status">
          <span
            className="activity-status__dot"
            style={{ backgroundColor: meta.color }}
          />
          <strong>Trenutno: {meta.label}</strong>
          <span className="activity-status__value">
            σ = {latestLevel.toFixed(2)} m/s²
          </span>
        </div>
      )}
      {data && options && (
        <div className="chart-wrapper">
          <Line options={options} data={data} />
        </div>
      )}
    </ChartPanel>
  );
}
