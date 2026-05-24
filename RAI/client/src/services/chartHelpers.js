/**
 * chartHelpers — Chart.js konfiguracija za SCRUM-41.
 *
 * Generira options/datasets za:
 *   - accelerometer: 3 linije (x, y, z)
 *   - gps: accuracyMeters skozi čas
 *
 * Barvna paleta je usklajena z App.css.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const COLORS = {
  x: "#e74c3c",
  y: "#27ae60",
  z: "#2980b9",
  accuracy: "#e67e22",
};

export function buildAccelerometerOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 20 } },
      tooltip: {
        callbacks: {
          label(ctx) {
            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} m/s²`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "time",
        time: {
          tooltipFormat: "HH:mm:ss",
          displayFormats: {
            second: "HH:mm:ss",
            minute: "HH:mm",
            hour: "HH:mm",
          },
        },
        title: { display: true, text: "Čas (UTC)" },
        ticks: { maxTicksLimit: 15 },
      },
      y: {
        title: { display: true, text: "m/s²" },
        beginAtZero: false,
      },
    },
    animation: { duration: 300 },
  };
}

export function buildAccelerometerDatasets(measurements) {
  return [
    {
      label: "X",
      data: measurements.map((m) => ({
        x: new Date(m.timestampUtc),
        y: m.data.x,
      })),
      borderColor: COLORS.x,
      backgroundColor: `${COLORS.x}20`,
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.1,
    },
    {
      label: "Y",
      data: measurements.map((m) => ({
        x: new Date(m.timestampUtc),
        y: m.data.y,
      })),
      borderColor: COLORS.y,
      backgroundColor: `${COLORS.y}20`,
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.1,
    },
    {
      label: "Z",
      data: measurements.map((m) => ({
        x: new Date(m.timestampUtc),
        y: m.data.z,
      })),
      borderColor: COLORS.z,
      backgroundColor: `${COLORS.z}20`,
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.1,
    },
  ];
}

export function buildGpsAccuracyOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(ctx) {
            return `Točnost: ${ctx.parsed.y.toFixed(1)} m`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "time",
        time: {
          tooltipFormat: "HH:mm:ss",
          displayFormats: {
            second: "HH:mm:ss",
            minute: "HH:mm",
            hour: "HH:mm",
          },
        },
        title: { display: true, text: "Čas (UTC)" },
        ticks: { maxTicksLimit: 15 },
      },
      y: {
        title: { display: true, text: "Točnost (m)" },
        beginAtZero: true,
        suggestedMax: 50,
      },
    },
    animation: { duration: 300 },
  };
}

export function buildGpsAccuracyDataset(measurements) {
  return [
    {
      label: "Točnost GPS",
      data: measurements.map((m) => ({
        x: new Date(m.timestampUtc),
        y: m.data.accuracyMeters ?? 0,
      })),
      borderColor: COLORS.accuracy,
      backgroundColor: `${COLORS.accuracy}20`,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.2,
      fill: true,
    },
  ];
}
