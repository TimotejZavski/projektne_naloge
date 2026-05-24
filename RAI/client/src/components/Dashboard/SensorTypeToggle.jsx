/**
 * SensorTypeToggle — preklop med tipi senzorja (SCRUM-41).
 *
 * Gumbi: GPS | Pospeškometer
 * Kliče onChange(sensorType) ob spremembi.
 */

const SENSOR_TYPES = [
  { value: 'gps', label: 'GPS', icon: '📍' },
  { value: 'accelerometer', label: 'Pospeškometer', icon: '📊' },
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
            className={`sensor-toggle__btn ${selected === st.value ? 'sensor-toggle__btn--active' : ''}`}
            onClick={() => onChange && onChange(st.value)}
          >
            <span>{st.icon}</span> {st.label}
          </button>
        ))}
      </div>
    </div>
  );
}
