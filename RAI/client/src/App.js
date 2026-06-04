import { useState } from "react";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import AuthPanel from "./components/AuthPanel";
import DashboardPage from "./components/Dashboard/DashboardPage";
import GpsMap from "./components/Dashboard/GpsMap";
import DeviceLookup from "./components/DeviceLookup";
import ActiveDeviceCounter from "./components/ActiveDeviceCounter";

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Pregled",
    eyebrow: "Nadzor",
    heading: "Pametna igrišča v enem pogledu",
    icon: "home",
  },
  {
    id: "map",
    label: "Zemljevid",
    eyebrow: "Lokacije",
    heading: "Igrišča in GPS sled",
    icon: "pin",
  },
  {
    id: "measurements",
    label: "Meritve",
    eyebrow: "Senzorji",
    heading: "Meritve skozi čas",
    icon: "activity",
  },
  {
    id: "devices",
    label: "Naprave",
    eyebrow: "Register",
    heading: "Iskanje naprave",
    icon: "device",
  },
];

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const activeMeta =
    NAV_ITEMS.find((item) => item.id === activeView) || NAV_ITEMS[0];

  return (
    <AuthProvider>
      <div className="product-shell">
        <aside className="app-rail" aria-label="Smart Playgrounds">
          <button
            type="button"
            className="brand-lockup"
            onClick={() => setActiveView("overview")}
          >
            <BrandMark />
            <span>
              <strong>Smart Playgrounds</strong>
              <small>RAI dashboard</small>
            </span>
          </button>

          <nav className="rail-nav" aria-label="Glavna navigacija">
            <span className="rail-section-label">Aplikacija</span>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rail-link ${activeView === item.id ? "rail-link--active" : ""}`}
                aria-current={activeView === item.id ? "page" : undefined}
                onClick={() => setActiveView(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="rail-support">
            <span>Projekt RAI</span>
            <p>
              Senzorika mobilne aplikacije, zbrana v operativni pogled za
              igrišča.
            </p>
          </div>
        </aside>

        <main className="app-main">
          <header className="app-header">
            <div>
              <span className="app-eyebrow">{activeMeta.eyebrow}</span>
              <h1>{activeMeta.heading}</h1>
            </div>
            <AuthPanel />
          </header>

          <div className="app-content">
            {activeView === "overview" && (
              <OverviewPage
                selectedDeviceId={selectedDeviceId}
                onNavigate={setActiveView}
              />
            )}

            {activeView === "map" && (
              <PageStack
                kicker="Lokacije igrišč"
                title="Zemljevid javnih igrišč in GPS sledi"
                description="Pogled združi lokacije igrišč z zadnjo sledjo izbrane naprave, da meritve dobijo fizičen kontekst."
              >
                <GpsMap deviceId={selectedDeviceId} />
              </PageStack>
            )}

            {activeView === "measurements" && (
              <PageStack
                kicker="Meritve v živo"
                title="Senzorski tok iz mobilne aplikacije"
                description="Izberite napravo, tip senzorja in obdobje. Ista izbira naprave poganja tudi GPS sled na zemljevidu."
              >
                <DashboardPage onDeviceChange={setSelectedDeviceId} />
              </PageStack>
            )}

            {activeView === "devices" && (
              <PageStack
                kicker="Register naprav"
                title="Preverjanje naprave in zadnjih zapisov"
                description="Naprava ni samo tehnični ID: tukaj dobi platformo, status, čas zadnjega signala in kratek pregled meritev."
              >
                <DeviceLookup />
              </PageStack>
            )}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}

function OverviewPage({ selectedDeviceId, onNavigate }) {
  return (
    <div className="overview-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="dashboard-kicker">Smart Playgrounds</p>
          <h2>
            Digitalni nadzor za igrišča, ki jih obiskujejo mobilni senzorji.
          </h2>
          <p>
            RAI poveže lokacije igrišč, GPS sled in meritve telefona v miren
            operativni pogled. Namesto seznama API nalog nastane majhen produkt:
            kje je naprava bila, kaj je izmerila in kateri zapisi pripadajo
            komu.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => onNavigate("measurements")}
            >
              <Icon name="activity" />
              Odpri meritve
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--light"
              onClick={() => onNavigate("map")}
            >
              <Icon name="pin" />
              Poglej zemljevid
            </button>
          </div>
        </div>

        <div className="signal-stack" aria-label="Stanje podatkov">
          <div className="signal-row">
            <span className="signal-dot signal-dot--green" />
            <div>
              <strong>GPS sled</strong>
              <small>{selectedDeviceId || "Naprava še ni izbrana"}</small>
            </div>
          </div>
          <div className="signal-row">
            <span className="signal-dot signal-dot--blue" />
            <div>
              <strong>Pospeškometer</strong>
              <small>časovna serija X, Y, Z</small>
            </div>
          </div>
          <div className="signal-row">
            <span className="signal-dot signal-dot--amber" />
            <div>
              <strong>Register naprav</strong>
              <small>status, platforma, zadnji signal</small>
            </div>
          </div>
          <ActiveDeviceCounter />
        </div>
      </section>

      <div className="product-summary">
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="pin" />
          </span>
          <p className="status-label">Kontekst</p>
          <h3>Igrišča niso več samo koordinate.</h3>
          <p>
            Meritve so vezane na prostor, sled naprave in obisk mobilne
            aplikacije.
          </p>
        </article>
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="activity" />
          </span>
          <p className="status-label">Signal</p>
          <h3>Podatki dobijo ritem.</h3>
          <p>
            GPS in pospeškometer sta prikazana kot časovna zgodba, ne kot surov
            JSON.
          </p>
        </article>
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="device" />
          </span>
          <p className="status-label">Zaupanje</p>
          <h3>Naprave imajo identiteto.</h3>
          <p>
            Prijava, lastništvo in zadnji zapisi ostanejo vidni tam, kjer so
            pomembni.
          </p>
        </article>
      </div>

      <div className="overview-grid">
        <section className="dashboard-panel purpose-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="eyebrow">Namen</p>
              <h2>Šolski backend, oblečen kot uporaben nadzorni center.</h2>
            </div>
          </div>
          <p>
            Projekt še vedno pokaže avtentikacijo, validacijo, poizvedbe, MQTT
            in vizualizacijo meritev. Razlika je v tem, da uporabnik zdaj razume
            zgodbo: naprava obišče igrišče, aplikacija zajame podatke, dashboard
            pa jih spremeni v pregled.
          </p>
        </section>

        <section className="dashboard-panel flow-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="eyebrow">Tok podatkov</p>
              <h2>Od telefona do odločitve</h2>
            </div>
          </div>
          <ol className="flow-list">
            <li>
              <span>01</span>
              <p>Mobilna aplikacija pošlje GPS ali pospeškometer.</p>
            </li>
            <li>
              <span>02</span>
              <p>Backend validira zapis in ga shrani ob napravi.</p>
            </li>
            <li>
              <span>03</span>
              <p>Dashboard prikaže lokacijo, graf in zadnje meritve.</p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function PageStack({ kicker, title, description, children }) {
  return (
    <section className="page-stack">
      <header className="section-header">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 456 456" aria-hidden="true">
      <path
        d="M228 124 C 286 124 326 166 326 220 C 326 280 252 316 228 332 C 204 316 130 280 130 220 C 130 166 170 124 228 124 Z"
        fill="#ffffff"
      />
      <circle cx="228" cy="216" r="46" fill="#22c55e" />
      <circle cx="228" cy="216" r="18" fill="#ffffff" />
    </svg>
  );
}

function Icon({ name }) {
  if (name === "activity") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }

  if (name === "pin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="10" r="3" />
        <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" />
      </svg>
    );
  }

  if (name === "device") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M10 17h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export default App;
