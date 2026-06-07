/**
 * UserLocationsMap — B/W zemljevid obiskanih igrisc za izbranega uporabnika.
 *
 * Vsako igrisce = en marker; velikost je proporcionalna stevilu obiskov.
 * Klik na marker prikaze panel pod zemljevidom s seznamom session-ov:
 * cas, trajanje, povprecna aktivnost, stevilo GPS/accel meritev.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getAdminUserLocations } from "../../api/admin";
import SessionChart from "./SessionChart";

const DEFAULT_CENTER = [46.5547, 15.6459]; // Maribor

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0 || !map) return;
    try {
      if (points.length === 1) {
        map.setView(points[0], 14, { animate: false });
        return;
      }
      const lats = points.map((p) => p[0]);
      const lngs = points.map((p) => p[1]);
      const bounds = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
      map.fitBounds(bounds, { padding: [30, 30], animate: false });
    } catch {
      // Map je lahko ze v fazi unmount-a -> ignoriramo.
    }
  }, [map, points]);
  return null;
}

export default function UserLocationsMap({ userId }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!userId) {
      setLocations([]);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setSelectedId(null);
    setSelectedSessionId(null);
    getAdminUserLocations(userId)
      .then((data) => setLocations(data.locations || []))
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, [userId]);

  const points = useMemo(
    () =>
      locations
        .filter((l) => l.location && l.location.latitude && l.location.longitude)
        .map((l) => [l.location.latitude, l.location.longitude]),
    [locations]
  );

  const maxVisits = useMemo(
    () => Math.max(1, ...locations.map((l) => l.visitCount || 0)),
    [locations]
  );

  const selected = useMemo(
    () => locations.find((l) => String(l.playgroundId) === String(selectedId)) || null,
    [locations, selectedId]
  );

  if (!userId) return null;

  return (
    <div className="usermap">
      <div className="usermap__head">
        <span className="usermap__title">visited locations</span>
        <span className="usermap__meta">
          {loading ? "loading…" : `${locations.length} courts`}
        </span>
      </div>

      <div className="usermap__canvas">
        <MapContainer
          key={userId}
          center={DEFAULT_CENTER}
          zoom={12}
          scrollWheelZoom
          zoomAnimation={false}
          fadeAnimation={false}
          markerZoomAnimation={false}
          className="usermap__leaflet"
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> · &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {locations.map((l) => {
            if (!l.location) return null;
            const radius = 6 + Math.round((l.visitCount / maxVisits) * 18); // 6..24
            const selectedNow = String(l.playgroundId) === String(selectedId);
            return (
              <CircleMarker
                key={l.playgroundId}
                center={[l.location.latitude, l.location.longitude]}
                radius={radius}
                pathOptions={{
                  color: selectedNow ? "#0f172a" : "#0f172a",
                  weight: selectedNow ? 2 : 1,
                  fillColor: "#0f172a",
                  fillOpacity: selectedNow ? 0.7 : 0.45,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedId(l.playgroundId);
                    setSelectedSessionId(null);
                  },
                }}
              >
                <Popup>
                  <strong>{l.name}</strong>
                  <br />
                  {l.visitCount} visits · {l.totalDurationMin} min total
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <SessionPanel
        location={selected}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
      />
      {selectedSessionId && <SessionChart visitId={selectedSessionId} />}
    </div>
  );
}

function SessionPanel({ location, selectedSessionId, onSelectSession }) {
  if (!location) {
    return (
      <div className="usermap__panel usermap__panel--empty">
        click a point on the map to see sessions.
      </div>
    );
  }
  return (
    <div className="usermap__panel">
      <div className="usermap__panelhead">
        <span className="usermap__panelname">{location.name}</span>
        <span className="usermap__panelmeta">
          {location.visitCount} visits · {location.totalDurationMin} min
        </span>
      </div>
      <ul className="usermap__sessions">
        {location.sessions.map((s) => {
          const sel = String(s._id) === String(selectedSessionId);
          return (
            <li
              key={s._id}
              className={`usermap__session ${sel ? "usermap__session--selected" : ""}`}
              onClick={() => onSelectSession(sel ? null : s._id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectSession(sel ? null : s._id);
                }
              }}
            >
              <span className="usermap__when">{formatDateTime(s.startUtc)}</span>
              <span className="usermap__dur">{s.durationMin} min</span>
              <span className="usermap__act">
                act σ {s.activityLevel?.toFixed(2) ?? "—"}
              </span>
              <span className="usermap__counts">
                {s.measurements.gpsCount} gps · {s.measurements.accelCount} accel
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sl-SI", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
