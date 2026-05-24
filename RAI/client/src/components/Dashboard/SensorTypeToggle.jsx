/**
 * SensorTypeToggle — preklop med tipi senzorja (SCRUM-41).
 * Uporablja SVG ikone namesto emoji-jev.
 */

const SENSOR_TYPES = [
  {
    value: "gps",
    label: "GPS",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="10" r="3" />
        <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" />
      </svg>
    ),
  },
  {
    value: "accelerometer",
    label: "Pospeškometer",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

export default function SensorTypeToggle({ selected, onChange }) {
  return (
    <div className="sensor-toggle" role="radiogroup" aria-label="Tip senzorja">
      <span className="status-label">Tip senzorja</span>
      <div className="sensor-toggle__buttons">
        {SENSOR_TYPES.map((st) => (
          <button
            key={st.value}
            type="button"
            role="radio"
            aria-checked={selected === st.value}
            className={`sensor-toggle__btn ${selected === st.value ? "sensor-toggle__btn--active" : ""}`}
            onClick={() => onChange && onChange(st.value)}
          >
            {st.icon} {st.label}
          </button>
        ))}
      </div>
    </div>
  );
}
