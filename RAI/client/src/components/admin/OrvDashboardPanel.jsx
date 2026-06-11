import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildOrvCourtLiveFeedUrl,
  getOrvCourtLiveState,
  getOrvHealth,
  listOrvStreams,
} from "../../api/orv";

const DEFAULT_COURT_ID =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_ORV_COURT_ID)
  || "test-court-1";

export default function OrvDashboardPanel() {
  const [health, setHealth] = useState(null);
  const [streams, setStreams] = useState([]);
  const [liveState, setLiveState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const liveFeedUrl = useMemo(
    () => buildOrvCourtLiveFeedUrl(DEFAULT_COURT_ID),
    []
  );

  const primaryStream = streams[0] || null;

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);

    try {
      const [healthResult, streamsResult, stateResult] = await Promise.all([
        getOrvHealth({ signal }).catch(() => null),
        listOrvStreams({ signal }).catch(() => ({ streams: [] })),
        getOrvCourtLiveState(DEFAULT_COURT_ID, { signal }).catch(() => null),
      ]);

      setHealth(healthResult);
      setStreams(streamsResult?.streams || []);
      setLiveState(stateResult);
      setLastSync(new Date());
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), 10000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  const players = liveState?.players ?? null;
  const status = liveState?.status || (health?.status === "ok" ? "READY" : "OFFLINE");
  const loopStreamUrl = primaryStream?.url || liveFeedUrl;

  return (
    <section className="orv-dashboard-panel" aria-label="ORV live dashboard">
      <div className="orv-dashboard-panel__head">
        <div>
          <span className="orv-dashboard-panel__eyebrow">ORV live</span>
          <h3>Dashboard + zankan video</h3>
        </div>
        <span className={`orv-status-pill ${health?.status === "ok" ? "orv-status-pill--ok" : ""}`}>
          {status}
        </span>
      </div>

      <div className="orv-dashboard-panel__grid">
        <Metric label="igralci" value={players ?? "-"} />
        <Metric label="streami" value={streams.length} />
        <Metric label="frame" value={liveState?.frame ?? "-"} />
      </div>

      <div className="orv-loop-preview">
        {health?.status === "ok" ? (
          <img src={loopStreamUrl} alt="ORV zankan demo video" />
        ) : (
          <div className="orv-loop-preview__empty">ORV video se prikaze, ko je storitev zagnana.</div>
        )}
      </div>

      <div className="orv-dashboard-panel__actions">
        <a className="ghost-button" href={loopStreamUrl} target="_blank" rel="noreferrer">
          Odpri zankan video
        </a>
        <a className="ghost-button" href={liveFeedUrl} target="_blank" rel="noreferrer">
          Live feed
        </a>
        <button type="button" className="ghost-button" onClick={() => load()} disabled={loading}>
          {loading ? "Osvezujem..." : "Osvezi ORV"}
        </button>
      </div>

      <p className="orv-dashboard-panel__note">
        {error
          ? "ORV trenutno ni dosegljiv. Zazeni lokalni start skript ali preveri storitev."
          : `Court: ${DEFAULT_COURT_ID}${lastSync ? ` · ${lastSync.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
      </p>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="orv-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
