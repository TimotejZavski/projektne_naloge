/**
 * GpsMap — interaktivni Leaflet/OSM zemljevid z GPS sledjo (SCRUM-41).
 */

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listMeasurements } from "../../api/measurements";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const LJ_CENTER = [46.0569, 14.5058];

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sl-SI", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function GpsMap({ deviceId }) {
  const [points, setPoints] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    console.log("[GpsMap] deviceId changed:", deviceId);
    if (!deviceId) {
      setPoints([]);
      setDebug("no deviceId");
      return;
    }
    let c = false;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    console.log("[GpsMap] fetching GPS for", deviceId, { from, to });

    listMeasurements({
      deviceId,
      sensorType: "gps",
      from,
      to,
      limit: 500,
      sort: "asc",
    })
      .then((d) => {
        if (c) return;
        console.log("[GpsMap] raw response:", d);
        const raw = d?.measurements || [];
        console.log("[GpsMap] measurements count:", raw.length);
        const pts = raw
          .filter((m) => m.data?.latitude != null && m.data?.longitude != null)
          .map((m) => ({
            lat: m.data.latitude,
            lng: m.data.longitude,
            acc: m.data.accuracyMeters,
            ts: m.timestampUtc,
            id: m._id,
          }));
        console.log("[GpsMap] filtered points:", pts.length, "first:", pts[0]);
        setPoints(pts);
        setError(null);
        setDebug(`OK: ${pts.length} points`);
      })
      .catch((e) => {
        if (!c) {
          console.error("[GpsMap] fetch error:", e);
          setError(e);
          setDebug("ERROR: " + (e.message || String(e)));
        }
      });
    return () => {
      c = true;
    };
  }, [deviceId]);

  const positions = points.map((p) => [p.lat, p.lng]);
  const bounds = positions.length >= 2 ? L.latLngBounds(positions) : null;

  return (
    <div className="map-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">GPS sled</p>
          <h2>{deviceId || "Izberi napravo"}</h2>
          <p className="map-trace-info">
            📍 {points.length} točk — {debug}
          </p>
        </div>
      </div>

      {error ? (
        <div className="map-placeholder">
          <span>Napaka: {debug}</span>
        </div>
      ) : points.length === 0 ? (
        <div className="map-placeholder">
          <span>
            {deviceId
              ? "Ni GPS podatkov za to napravo"
              : "Izberi napravo za prikaz GPS sledi"}
          </span>
        </div>
      ) : (
        <div className="map-wrapper">
          <MapContainer
            key={deviceId}
            center={LJ_CENTER}
            zoom={14}
            bounds={bounds || undefined}
            className="leaflet-map"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {positions.length >= 2 && (
              <Polyline
                positions={positions}
                color="#1976d2"
                weight={4}
                opacity={0.8}
              />
            )}
            {points.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={6}
                pathOptions={{
                  color: "#1976d2",
                  fillColor: "#1976d2",
                  fillOpacity: 0.5,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                    <strong>{fmtTime(p.ts)}</strong>
                    <br />
                    {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    {p.acc != null && (
                      <>
                        <br />
                        Točnost: {p.acc} m
                      </>
                    )}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
