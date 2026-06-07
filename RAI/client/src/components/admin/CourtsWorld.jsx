/**
 * CourtsWorld — editorial pristajalna stran z velikim B/W zemljevidom
 * vseh igrisc. Empty state: cel zaslon karta + napis "select a court".
 * Klik na pin -> karta zlede na levo polovico, profil igrisca se odpre desno.
 */

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { listAdminCourts, getAdminCourtDetail } from "../../api/admin";
import CourtProfile from "./CourtProfile";

const DEFAULT_CENTER = [46.5547, 15.6459]; // Maribor

function FitAll({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length < 2 || !map) return;
    try {
      const lats = points.map((p) => p[0]);
      const lngs = points.map((p) => p[1]);
      map.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [60, 60], animate: false }
      );
    } catch { /* ignore unmount races */ }
  }, [map, points]);
  return null;
}

function FlyTo({ point }) {
  const map = useMap();
  useEffect(() => {
    if (!point || !map) return;
    try {
      map.setView(point, 15, { animate: false });
    } catch { /* ignore */ }
  }, [map, point]);
  return null;
}

export default function CourtsWorld() {
  const [courts, setCourts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    listAdminCourts()
      .then((d) => setCourts(d.courts || []))
      .catch(() => setCourts([]))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetail(null);
    getAdminCourtDetail(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const points = useMemo(
    () =>
      courts
        .filter((c) => c.location && c.location.latitude && c.location.longitude)
        .map((c) => [c.location.latitude, c.location.longitude]),
    [courts]
  );

  const maxVisits = useMemo(
    () => Math.max(1, ...courts.map((c) => c.totalVisits || 0)),
    [courts]
  );

  const selectedPoint = useMemo(() => {
    if (!detail?.court?.location) return null;
    return [detail.court.location.latitude, detail.court.location.longitude];
  }, [detail]);

  const hasSelection = !!selectedId;

  return (
    <div className={`courts-world ${hasSelection ? "courts-world--split" : ""}`}>
      <div className="courts-map">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={12}
          scrollWheelZoom
          zoomAnimation={false}
          fadeAnimation={false}
          markerZoomAnimation={false}
          className="courts-map__leaflet"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> · &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
          />
          {hasSelection
            ? <FlyTo point={selectedPoint} />
            : <FitAll points={points} />}

          {courts.map((c) => {
            if (!c.location) return null;
            const radius = 6 + Math.round((c.totalVisits / maxVisits) * 20);
            const isSelected = String(c._id) === String(selectedId);
            return (
              <CircleMarker
                key={c._id}
                center={[c.location.latitude, c.location.longitude]}
                radius={isSelected ? radius + 4 : radius}
                pathOptions={{
                  color: "#0f172a",
                  weight: isSelected ? 3 : 1.2,
                  fillColor: isSelected ? "#0f172a" : "#0f172a",
                  fillOpacity: isSelected ? 0.85 : 0.5,
                }}
                eventHandlers={{
                  click: () => setSelectedId(c._id),
                }}
              />
            );
          })}
        </MapContainer>

        {!hasSelection && (
          <div className="courts-map__overlay">
            <span className="courts-map__eyebrow">
              {loadingList ? "loading…" : `${courts.length} courts · maribor`}
            </span>
            <h1 className="courts-map__title">[ select a court ]</h1>
            <span className="courts-map__sub">click any pin to open its profile</span>
          </div>
        )}
      </div>

      {hasSelection && (
        <div className="courts-detail">
          <CourtProfile
            detail={detail}
            loading={loadingDetail}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
