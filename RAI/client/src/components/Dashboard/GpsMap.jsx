/**
 * GpsMap — interaktivni Leaflet/OSM zemljevid z GPS sledjo (SCRUM-41).
 *
 * Neodvisno od chart toggle-a: vedno prikazuje GPS sled za izbrano napravo.
 * Podatke fetcha samostojno prek GET /api/measurements.
 */

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { listMeasurements } from "../../api/measurements";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const LJ_CENTER = [46.0569, 14.5058];

export default function GpsMap({ deviceId }) {
  const [trace, setTrace] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!deviceId) {
      setTrace([]);
      return;
    }
    let cancelled = false;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    listMeasurements({ deviceId, sensorType: "gps", from, to, limit: 500, sort: "asc" })
      .then((data) => {
        if (cancelled) return;
        const points = (data?.measurements || [])
          .filter((m) => m.data?.latitude != null && m.data?.longitude != null)
          .map((m) => [m.data.latitude, m.data.longitude]);
        setTrace(points);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });

    return () => { cancelled = true; };
  }, [deviceId]);

  const bounds = trace.length >= 2 ? L.latLngBounds(trace) : null;

  return (
    <div className="map-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">GPS sled</p>
          <h2>{deviceId || "Izberi napravo"}</h2>
          {trace.length > 0 && (
            <p className="map-trace-info">📍 {trace.length} točk — zadnja ura</p>
          )}
        </div>
      </div>

      {error ? (
        <div className="map-placeholder">
          <span>Napaka pri nalaganju GPS podatkov</span>
        </div>
      ) : (
        <div className="map-wrapper">
          <MapContainer
            center={bounds ? bounds.getCenter() : LJ_CENTER}
            zoom={bounds ? undefined : 14}
            bounds={bounds || undefined}
            className="leaflet-map"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {trace.length >= 2 && (
              <Polyline positions={trace} color="#1976d2" weight={4} opacity={0.8} />
            )}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
