import { useState } from "react";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import AuthPanel from "./components/AuthPanel";
import DashboardPage from "./components/Dashboard/DashboardPage";
import GpsMap from "./components/Dashboard/GpsMap";
import DeviceLookup from "./components/DeviceLookup";

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  return (
    <AuthProvider>
      <main className="app-shell">
        <section className="workspace-header">
          <div>
            <p className="eyebrow">Smart Playgrounds</p>
            <h1>Nadzorna plošča</h1>
            <p className="lead">
              Spremljajte pot telefona in gibanje igral na enem mestu: lokacije igrišč,
              GPS sled naprave in meritve, ki jih mobilna aplikacija pošilja v živo.
            </p>
          </div>
          <AuthPanel />
        </section>

        <section className="map-section" aria-labelledby="map-section-title">
          <h2 id="map-section-title" className="section-title">
            Igrišča in lokacije
          </h2>
          <GpsMap deviceId={selectedDeviceId} />
        </section>

        <section aria-labelledby="charts-section-title">
          <h2 id="charts-section-title" className="section-title">
            Meritve skozi čas
          </h2>
          <DashboardPage onDeviceChange={setSelectedDeviceId} />
        </section>

        <section aria-labelledby="lookup-section-title">
          <h2 id="lookup-section-title" className="section-title">
            Iskanje naprave
          </h2>
          <DeviceLookup />
        </section>
      </main>
    </AuthProvider>
  );
}

export default App;
