/**
 * GpsMap — OpenStreetMap (Leaflet) z igrišči in opcijsko GPS sledjo naprave.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listMeasurements } from "../../api/measurements";
import { listPlaygrounds } from "../../api/playgrounds";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_CENTER = [46.5547, 15.6459];
const OSM_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

function toCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function playgroundCoords(pg) {
  const lat = toCoord(pg?.location?.latitude);
  const lng = toCoord(pg?.location?.longitude);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function normalizePlaygrounds(items) {
  return (items || [])
    .map((pg) => {
      const coords = playgroundCoords(pg);
      return coords ? { ...pg, coords } : null;
    })
    .filter(Boolean);
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sl-SI", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function computeBounds(playgrounds, points) {
  const coords = [
    ...playgrounds.map((pg) => [pg.coords.lat, pg.coords.lng]),
    ...points.map((p) => [p.lat, p.lng]),
  ];
  if (coords.length === 0) return null;
  return L.latLngBounds(coords);
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    map.whenReady(fix);
    const t = setTimeout(fix, 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds?.isValid()) return;
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    };
    map.whenReady(fit);
  }, [bounds, map]);
  return null;
}

function MapPanelHeader({
  deviceId,
  playgroundsLoading,
  playgroundCount,
  gpsPointCount,
  playgroundError,
  gpsError,
  mapError,
}) {
  const heading = deviceId || "Javna igrišča";
  const subtitle = deviceId
    ? `${gpsPointCount} GPS točk`
    : `${playgroundCount} igrišč · mobilna aplikacija pošilja meritve ob obisku`;

  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{deviceId ? "GPS sled" : "Lokacije igrišč"}</p>
        <h2>{heading}</h2>
        <p className="map-trace-info">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ verticalAlign: "middle", marginRight: 4 }}
          >
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" />
          </svg>
          {playgroundsLoading ? "Nalaganje igrišč…" : subtitle}
        </p>
        {playgroundError && (
          <p className="map-error-msg">Napaka pri nalaganju igrišč</p>
        )}
        {gpsError && (
          <p className="map-error-msg">Napaka pri nalaganju GPS sledi</p>
        )}
        {mapError && (
          <p className="map-error-msg">Napaka pri prikazu zemljevida</p>
        )}
      </div>
    </div>
  );
}

function OsmPlaygroundMap({ playgrounds, points, bounds }) {
  const gpsPositions = points.map((p) => [p.lat, p.lng]);
  const mapCenter =
    playgrounds.length > 0
      ? [playgrounds[0].coords.lat, playgrounds[0].coords.lng]
      : DEFAULT_CENTER;

  return (
    <MapContainer
      center={mapCenter}
      zoom={12}
      className="leaflet-map"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution={OSM_TILES.attribution}
        url={OSM_TILES.url}
        maxZoom={19}
      />
      <InvalidateSize />
      {bounds && <FitBounds bounds={bounds} />}

      {playgrounds.map((pg) => (
        <CircleMarker
          key={pg._id || pg.name}
          center={[pg.coords.lat, pg.coords.lng]}
          radius={8}
          pathOptions={{
            color: "#21c98b",
            fillColor: "#21c98b",
            fillOpacity: 0.7,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <div className="map-tooltip">
              <strong>{pg.name}</strong>
              <br />
              {pg.address}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {gpsPositions.length >= 2 && (
        <Polyline
          positions={gpsPositions}
          color="#2563eb"
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
            color: "#2563eb",
            fillColor: "#2563eb",
            fillOpacity: 0.5,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <div className="map-tooltip">
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
  );
}

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error, _info) {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="map-placeholder">
          <span>Zemljevid trenutno ni na voljo</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function GpsMap({ deviceId }) {
  const [playgrounds, setPlaygrounds] = useState([]);
  const [playgroundError, setPlaygroundError] = useState(null);
  const [playgroundsLoading, setPlaygroundsLoading] = useState(true);
  const [points, setPoints] = useState([]);
  const [gpsError, setGpsError] = useState(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    let c = false;
    setPlaygroundsLoading(true);
    listPlaygrounds()
      .then((d) => {
        if (c) return;
        setPlaygrounds(normalizePlaygrounds(d?.playgrounds));
        setPlaygroundError(null);
      })
      .catch((e) => {
        if (!c) setPlaygroundError(e);
      })
      .finally(() => {
        if (!c) setPlaygroundsLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceId) {
      setPoints([]);
      setGpsError(null);
      return;
    }
    let c = false;
    listMeasurements({ deviceId, sensorType: "gps", limit: 1000, sort: "desc" })
      .then((d) => {
        if (c) return;
        const pts = (d?.measurements || [])
          .filter((m) => m.data?.latitude != null && m.data?.longitude != null)
          .map((m) => ({
            lat: Number(m.data.latitude),
            lng: Number(m.data.longitude),
            acc: m.data.accuracyMeters,
            ts: m.timestampUtc,
            id: m._id,
          }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        setPoints(pts);
        setGpsError(null);
      })
      .catch((e) => {
        if (!c) setGpsError(e);
      });
    return () => {
      c = true;
    };
  }, [deviceId]);

  const bounds = useMemo(
    () => computeBounds(playgrounds, points),
    [playgrounds, points],
  );

  return (
    <div className="map-panel">
      <MapPanelHeader
        deviceId={deviceId}
        playgroundsLoading={playgroundsLoading}
        playgroundCount={playgrounds.length}
        gpsPointCount={points.length}
        playgroundError={playgroundError}
        gpsError={gpsError}
        mapError={mapError}
      />

      <div className="map-wrapper">
        {!playgroundsLoading && (
          <MapErrorBoundary onError={() => setMapError(true)}>
            <OsmPlaygroundMap
              playgrounds={playgrounds}
              points={points}
              bounds={bounds}
            />
          </MapErrorBoundary>
        )}
      </div>
    </div>
  );
}
