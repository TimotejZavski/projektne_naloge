import React, { useMemo } from 'react';
import './App.css';

const playground = {
  name: 'Smart Playground Center',
  address: 'Ljubljana, Slovenija',
  coordinates: {
    lat: 46.0569,
    lng: 14.5058,
  },
  sensors: [
    { label: 'GPS', value: 'aktivno' },
    { label: 'Kamera', value: 'pripravljeno' },
    { label: 'Gibanje', value: 'v testu' },
  ],
};

function App() {
  const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;

  const mapImageUrl = useMemo(() => {
    if (!mapboxToken) {
      return null;
    }

    const { lat, lng } = playground.coordinates;
    const marker = `pin-s-playground+1976d2(${lng},${lat})`;

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},14,0/960x520?access_token=${mapboxToken}`;
  }, [mapboxToken]);

  return (
    <main className="app-shell">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">SCRUM-25</p>
          <h1>Frontend skeleton</h1>
          <p className="lead">
            Osnovni pogled za spremljanje igralisca, senzorjev in Mapbox lokacije.
          </p>
        </div>
        <div className="status-card">
          <span className="status-dot" />
          <div>
            <span className="status-label">API stanje</span>
            <strong>Pripravljeno za povezavo</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Mapbox API</p>
              <h2>{playground.name}</h2>
            </div>
            <span>{playground.coordinates.lat}, {playground.coordinates.lng}</span>
          </div>

          {mapImageUrl ? (
            <img className="map-preview" src={mapImageUrl} alt="Mapbox prikaz lokacije igralisca" />
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
            {playground.sensors.map(sensor => (
              <div className="sensor-row" key={sensor.label}>
                <span>{sensor.label}</span>
                <strong>{sensor.value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
