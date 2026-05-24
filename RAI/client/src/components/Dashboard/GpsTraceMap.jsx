/**
 * GpsTraceMap — Leaflet/OpenStreetMap zemljevid z GPS sledjo (SCRUM-41).
 *
 * Prejme `measurements` (GPS tipa), ekstrahira [lat, lng] pare in
 * izrise polyline. Doda markerje za začetno in končno točko.
 *
 * Ovije ga `ChartPanel` za loading/error/empty stanja.
 */

import { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

import { extractGpsTrace } from '../../services/chartHelpers';
import ChartPanel from './ChartPanel';

// Leaflet privzete ikone potrebujejo expliciten import za webpack
import 'leaflet/dist/leaflet.css';

// Popravi manjkajoce default ikone v webpack okolju
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const START_ICON = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const END_ICON = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function GpsTraceMap({ measurements, isLoading, error, onRetry }) {
  const trace = useMemo(() => extractGpsTrace(measurements || []), [measurements]);
  const isEmpty = trace.length < 2;

  const bounds = useMemo(() => {
    if (isEmpty) return null;
    return L.latLngBounds(trace);
  }, [trace, isEmpty]);

  const startPoint = trace[0] || null;
  const endPoint = trace[trace.length - 1] || null;

  return (
    <ChartPanel
      title="GPS sled"
      subtitle={!isEmpty ? `${trace.length} točk` : undefined}
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="Premalo GPS točk za izris sledi (potrebni vsaj 2)."
      onRetry={onRetry}
    >
      {!isEmpty && (
        <div className="map-wrapper">
          <MapContainer
            bounds={bounds}
            className="leaflet-map"
            zoomControl={true}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Polyline positions={trace} color="#1976d2" weight={4} opacity={0.8} />
            {startPoint && (
              <Marker position={startPoint} icon={START_ICON}>
                <Popup>Začetek sledi</Popup>
              </Marker>
            )}
            {endPoint && endPoint !== startPoint && (
              <Marker position={endPoint} icon={END_ICON}>
                <Popup>Konec sledi</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      )}
    </ChartPanel>
  );
}
