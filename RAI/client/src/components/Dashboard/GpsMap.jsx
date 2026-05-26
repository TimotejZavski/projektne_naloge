/**
 * GpsMap — Mapbox zemljevid z igrišči (javni API) in opcijsko GPS sledjo naprave.
 * Igrisca se prikazejo ob zagonu, neodvisno od prijave in izbrane naprave.
 */

import { useEffect, useMemo, useState } from "react";
import Map, { Marker, Popup, Source, Layer, useMap } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap as useLeafletMap,
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

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || "";
const MB_CENTER = { longitude: 15.6459, latitude: 46.5547, zoom: 12 };

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
    ...playgrounds.map((pg) => [pg.location.longitude, pg.location.latitude]),
    ...points.map((p) => [p.lng, p.lat]),
  ];
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function MapboxFitBounds({ bounds }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 800 });
  }, [map, bounds]);
  return null;
}

function LeafletFitBounds({ bounds }) {
  const map = useLeafletMap();
  useEffect(() => {
    if (!bounds) return;
    const leafletBounds = L.latLngBounds([
      [bounds[0][1], bounds[0][0]],
      [bounds[1][1], bounds[1][0]],
    ]);
    if (leafletBounds.isValid()) {
      map.fitBounds(leafletBounds, { padding: [40, 40], maxZoom: 15 });
    }
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
}) {
  const heading = deviceId || "Javna igrišča";
  const subtitle = deviceId
    ? `${gpsPointCount} GPS točk`
    : `${playgroundCount} igrišč`;

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
      </div>
    </div>
  );
}

function MapboxPlaygroundMap({ playgrounds, points, bounds }) {
  const gpsLine = useMemo(() => {
    if (points.length < 2) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
    };
  }, [points]);

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={MB_CENTER}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    >
      {bounds && <MapboxFitBounds bounds={bounds} />}

      {playgrounds.map((pg) => (
        <Marker
          key={pg._id || pg.name}
          longitude={pg.location.longitude}
          latitude={pg.location.latitude}
          anchor="center"
        >
          <div className="playground-marker" title={pg.name} />
          <Popup closeButton={false} offset={12}>
            <div className="map-tooltip">
              <strong>{pg.name}</strong>
              <br />
              {pg.address}
            </div>
          </Popup>
        </Marker>
      ))}

      {gpsLine && (
        <Source id="gps-track" type="geojson" data={gpsLine}>
          <Layer
            id="gps-track-line"
            type="line"
            paint={{
              "line-color": "#1976d2",
              "line-width": 4,
              "line-opacity": 0.8,
            }}
          />
        </Source>
      )}

      {points.map((p) => (
        <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
          <div className="gps-marker" />
          <Popup closeButton={false} offset={10}>
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
          </Popup>
        </Marker>
      ))}
    </Map>
  );
}

function LeafletPlaygroundMap({ playgrounds, points, bounds }) {
  const gpsPositions = points.map((p) => [p.lat, p.lng]);
  const mapCenter =
    playgrounds.length > 0
      ? [playgrounds[0].location.latitude, playgrounds[0].location.longitude]
      : [MB_CENTER.latitude, MB_CENTER.longitude];

  return (
    <MapContainer
      center={mapCenter}
      zoom={12}
      className="leaflet-map"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {bounds && <LeafletFitBounds bounds={bounds} />}

      {playgrounds.map((pg) => (
        <CircleMarker
          key={pg._id || pg.name}
          center={[pg.location.latitude, pg.location.longitude]}
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

export default function GpsMap({ deviceId }) {
  const [playgrounds, setPlaygrounds] = useState([]);
  const [playgroundError, setPlaygroundError] = useState(null);
  const [playgroundsLoading, setPlaygroundsLoading] = useState(true);
  const [points, setPoints] = useState([]);
  const [gpsError, setGpsError] = useState(null);

  useEffect(() => {
    let c = false;
    setPlaygroundsLoading(true);
    listPlaygrounds()
      .then((d) => {
        if (c) return;
        const items = (d?.playgrounds || []).filter(
          (pg) =>
            pg.location?.latitude != null && pg.location?.longitude != null,
        );
        setPlaygrounds(items);
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
            lat: m.data.latitude,
            lng: m.data.longitude,
            acc: m.data.accuracyMeters,
            ts: m.timestampUtc,
            id: m._id,
          }));
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
      />

      <div className="map-wrapper">
        {MAPBOX_TOKEN ? (
          <MapboxPlaygroundMap
            playgrounds={playgrounds}
            points={points}
            bounds={bounds}
          />
        ) : (
          <LeafletPlaygroundMap
            playgrounds={playgrounds}
            points={points}
            bounds={bounds}
          />
        )}
      </div>
    </div>
  );
}
