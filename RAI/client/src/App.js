import { useCallback, useMemo, useState } from "react";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import AuthPanel from "./components/AuthPanel";
import DashboardPage from "./components/Dashboard/DashboardPage";
import DeviceLookup from "./components/DeviceLookup";

const playground = {
  name: "Smart Playground Center",
  address: "Ljubljana, Slovenija",
  coordinates: { lat: 46.0569, lng: 14.5058 },
};

function encodePolyline(points) {
  if (!points || points.length === 0) return "";
  return points.map((p) => `${p.lng},${p.lat}`).join("|");
}

function App() {
  const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
  const [gpsTrace, setGpsTrace] = useState(null);

  const handleGpsTraceChange = useCallback((trace) => {
    setGpsTrace(trace);
  }, []);

  const mapImageUrl = useMemo(() => {
    if (!mapboxToken) return null;
    const { lat, lng } = playground.coordinates;
    let overlays = `pin-s-playground+1976d2(${lng},${lat})`;

    if (gpsTrace && gpsTrace.length >= 2) {
      overlays += `,path-5+1976d2-0.7(${encodePolyline(gpsTrace)})`;
    }

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/auto/960x520?access_token=${mapboxToken}`;
  }, [mapboxToken, gpsTrace]);

  const gpsCount = gpsTrace ? gpsTrace.length : 0;

  return (
    <AuthProvider>
      <main className="app-shell">
        <section className="workspace-header">
          <div>
            <p className="eyebrow">RAI dashboard</p>
            <h1>Smart Playgrounds</h1>
            <p className="lead">
              Pregled igrišča, povezave senzorjev in zgodovine meritev
              (SCRUM-25, SCRUM-29, SCRUM-41).
            </p>
          </div>
          <AuthPanel />
        </section>

        <section className="dashboard-grid">
          <article className="map-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Mapbox API</p>
                <h2>{playground.name}</h2>
                {gpsCount > 0 && (
                  <p className="map-trace-info">📍 GPS sled: {gpsCount} točk</p>
                )}
              </div>
              <span>
                {playground.coordinates.lat}, {playground.coordinates.lng}
              </span>
            </div>

            {mapImageUrl ? (
              <img
                className="map-preview"
                src={mapImageUrl}
                alt={
                  gpsCount > 0
                    ? `GPS sled z ${gpsCount} točkami`
                    : "Mapbox prikaz lokacije igrališča"
                }
              />
            ) : (
              <div className="map-placeholder">
                <span>Mapbox token ni nastavljen</span>
              </div>
            )}
          </article>

          <aside className="info-panel">
            <div className="info-block">
              <span className="status-label">Lokacija</span>
              <strong>{playground.address}</strong>
            </div>

            <div className="sensor-list">
              {[
                { label: "GPS", value: "aktivno" },
                { label: "Kamera", value: "pripravljeno" },
                { label: "Gibanje", value: "v testu" },
              ].map((s) => (
                <div className="sensor-row" key={s.label}>
                  <span>{s.label}</span>
                  <strong>{s.value}</strong>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <DashboardPage onGpsTraceChange={handleGpsTraceChange} />

        <DeviceLookup />
      </main>
    </AuthProvider>
  );
}

export default App;
