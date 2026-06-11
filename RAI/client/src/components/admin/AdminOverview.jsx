/**
 * AdminOverview — pristajalna stran admina.
 *
 * Editorial split z dvema svetovoma (Users / Courts) + tanek KPI trak.
 * Klik na katerokoli stran prenese admin v ustrezni "world".
 */

import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";

export default function AdminOverview({ onGo }) {
  const [kpi, setKpi] = useState({ users: null, courts: null, online: null });
  const [activity, setActivity] = useState({ usersActive: null, courtsBusy: null });

  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        // Pagination meta vrne total -> uporabimo limit=1 za hitro stetje.
        const [u, c, online] = await Promise.all([
          apiRequest("/api/query/users", { query: { limit: 1 } }).catch(() => null),
          apiRequest("/api/playgrounds", { query: { limit: 1 } }).catch(() => null),
          apiRequest("/api/devices/active/count", { auth: false }).catch(() => null),
        ]);
        if (abort) return;
        setKpi({
          users: u?.meta?.total ?? null,
          courts: c?.meta?.total ?? null,
          online: online?.activeDevices ?? null,
        });
      } catch {
        /* ignore */
      }
    }
    load();
    return () => { abort = true; };
  }, []);

  // Sekundarne, "behavioralne" metrike — kasneje napolnimo iz visits/agregatov.
  useEffect(() => {
    setActivity({ usersActive: null, courtsBusy: null });
  }, []);

  return (
    <div className="overview">
      <KpiStrip kpi={kpi} />

      <div className="overview-split">
        <WorldCard
          label="Users"
          subtitle={
            kpi.users != null
              ? `${kpi.users} total · ${activity.usersActive ?? "—"} active today`
              : "loading…"
          }
          tagline="Who's playing. Streaks, history, where they show up."
          onClick={() => onGo("users")}
        />
        <WorldCard
          label="Courts"
          subtitle={
            kpi.courts != null
              ? `${kpi.courts} courts · ${activity.courtsBusy ?? "—"} busy now`
              : "loading…"
          }
          tagline="Where the games are. Visitors, hot times, location."
          onClick={() => onGo("courts")}
          variant="dark"
          bgImage="/assets/backgrounds/court.jpg"
        />
      </div>
    </div>
  );
}

function KpiStrip({ kpi }) {
  return (
    <div className="kpi-strip" aria-label="Stanje sistema">
      <Kpi label="users" value={kpi.users} />
      <Kpi label="courts" value={kpi.courts} />
      <Kpi label="online now" value={kpi.online} />
      <Kpi label="hour" value={new Date().toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })} />
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value ?? "—"}</span>
    </div>
  );
}

function WorldCard({ label, subtitle, tagline, onClick, variant = "light", bgImage }) {
  const style = bgImage ? { backgroundImage: `url(${bgImage})` } : undefined;
  return (
    <button
      type="button"
      className={`world-card world-card--${variant} ${bgImage ? "world-card--bg" : ""}`}
      style={style}
      onClick={onClick}
    >
      <span className="world-card__eyebrow">{subtitle}</span>
      <span className="world-card__title">[ {label} ]</span>
      <span className="world-card__tagline">{tagline}</span>
      <span className="world-card__arrow">
        <img src="/assets/arrow.svg" alt="" />
      </span>
    </button>
  );
}
