/**
 * SessionChart — prikaze accel X/Y/Z + magnitudo za izbran obisk (visit).
 *
 * Hkrati izpise mini "sumarne" stats: koliko GPS, koliko accel vzorcev,
 * trajanje. Klic na /api/admin/visits/:visitId/measurements.
 */

import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";

import { getAdminVisitMeasurements } from "../../api/admin";
import {
  buildAccelerometerOptions,
  buildAccelerometerDatasets,
} from "../../services/chartHelpers";

export default function SessionChart({ visitId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visitId) {
      setData(null);
      return;
    }
    setLoading(true);
    getAdminVisitMeasurements(visitId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [visitId]);

  const accelChart = useMemo(() => {
    if (!data?.accelerometer?.length) return null;
    return {
      options: buildAccelerometerOptions(),
      data: { datasets: buildAccelerometerDatasets(data.accelerometer) },
    };
  }, [data]);

  const magChart = useMemo(() => {
    if (!data?.accelerometer?.length) return null;
    const points = data.accelerometer.map((m) => ({
      x: new Date(m.timestampUtc),
      y: Math.sqrt((m.data?.x || 0) ** 2 + (m.data?.y || 0) ** 2 + (m.data?.z || 0) ** 2),
    }));
    return {
      options: {
        ...buildAccelerometerOptions(),
        plugins: { legend: { display: false } },
        scales: {
          x: buildAccelerometerOptions().scales.x,
          y: { title: { display: true, text: "magnitude (m/s²)" }, beginAtZero: false },
        },
      },
      data: {
        datasets: [{
          label: "Magnitude",
          data: points,
          borderColor: "#0f172a",
          backgroundColor: "#0f172a20",
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.15,
        }],
      },
    };
  }, [data]);

  if (!visitId) return null;
  if (loading && !data) {
    return <div className="session-chart__empty">loading session…</div>;
  }
  if (!data) {
    return <div className="session-chart__empty">no data for this session.</div>;
  }

  const { visit, gps, accelerometer } = data;

  return (
    <div className="session-chart">
      <div className="session-chart__head">
        <div>
          <span className="session-chart__eyebrow">session detail</span>
          <span className="session-chart__title">
            {formatRange(visit.startUtc, visit.endUtc)} · {visit.durationMin} min
          </span>
        </div>
        <div className="session-chart__counts">
          {gps.length} gps · {accelerometer.length} accel · σ {visit.activityLevel?.toFixed(2) ?? "—"}
        </div>
      </div>

      {accelerometer.length === 0 ? (
        <div className="session-chart__empty">no accelerometer samples in this window.</div>
      ) : (
        <>
          <div className="session-chart__sub">accelerometer · x / y / z</div>
          <div className="session-chart__canvas">
            <Line options={accelChart.options} data={accelChart.data} />
          </div>

          <div className="session-chart__sub">acceleration magnitude</div>
          <div className="session-chart__canvas">
            <Line options={magChart.options} data={magChart.data} />
          </div>
        </>
      )}
    </div>
  );
}

function formatRange(startIso, endIso) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const fmt = (d) => d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" });
  return `${s.toLocaleDateString("sl-SI", { month: "short", day: "numeric" })} · ${fmt(s)} – ${fmt(e)}`;
}
