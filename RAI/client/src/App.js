import { useState } from "react";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import AuthPanel from "./components/AuthPanel";
import DashboardPage from "./components/Dashboard/DashboardPage";
import GpsMap from "./components/Dashboard/GpsMap";
import DeviceLookup from "./components/DeviceLookup";

const playground = {
  name: "Smart Playground Center",
  address: "Ljubljana, Slovenija",
};

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  return (
    <AuthProvider>
      <main className="app-shell">
        <section className="workspace-header">
          <div>
            <p className="eyebrow">RAI dashboard</p>
            <h1>Smart Playgrounds</h1>
            <p className="lead">
              Pregled igrišča, senzorskih meritev in GPS sledi (SCRUM-25,
              SCRUM-29, SCRUM-41).
            </p>
          </div>
          <AuthPanel />
        </section>

        <section className="map-section">
          <GpsMap deviceId={selectedDeviceId} />
        </section>

        <DashboardPage onDeviceChange={setSelectedDeviceId} />

        <DeviceLookup />
      </main>
    </AuthProvider>
  );
}

export default App;
