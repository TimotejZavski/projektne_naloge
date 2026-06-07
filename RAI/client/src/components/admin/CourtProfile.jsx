/**
 * CourtProfile — desni panel s celovitim profilom izbranega igrisca.
 *
 * Vsebina: header z naslovom + scraped source, 5 KPI tile-i, heatmap "kdaj je
 * gneca", top obiskovalci (klikabilni za skok v Users svet — placeholder),
 * recent visits feed, intensity ("character") histogram.
 */

const DAY_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function CourtProfile({ detail, loading, onClose }) {
  if (loading && !detail) {
    return <Wrapper onClose={onClose}><Empty>loading court…</Empty></Wrapper>;
  }
  if (!detail) {
    return <Wrapper onClose={onClose}><Empty>no data.</Empty></Wrapper>;
  }

  const { court, stats, heatmap, topVisitors, recentVisits, intensityHistogram } = detail;

  return (
    <Wrapper onClose={onClose}>
      <header className="court-head">
        <span className="court-head__eyebrow">court · scraped</span>
        <h2 className="court-head__title">[ {court.name} ]</h2>
        <div className="court-head__meta">
          <span>{court.address}</span>
          {court.sourceUrl && (
            <a
              href={court.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="court-head__source"
            >
              source: {hostnameOf(court.sourceUrl)}
            </a>
          )}
        </div>
      </header>

      <div className="court-kpis">
        <Kpi label="visits" value={stats.totalVisits} />
        <Kpi label="visitors" value={stats.uniqueVisitors} />
        <Kpi label="avg duration" value={stats.avgDurationMin ? `${stats.avgDurationMin} min` : "—"} />
        <Kpi label="busiest hour" value={stats.busiestHour != null ? `${String(stats.busiestHour).padStart(2,"0")}:00` : "—"} />
        <Kpi label="activity σ" value={stats.avgActivity != null ? stats.avgActivity.toFixed(2) : "—"} />
      </div>

      <Section title="when this court is busy">
        <Heatmap heatmap={heatmap} />
      </Section>

      <Section title="top visitors">
        {topVisitors.length === 0 ? (
          <Empty>no visitors yet.</Empty>
        ) : (
          <ul className="court-vlist">
            {topVisitors.map((v, i) => (
              <li key={v._id} className="court-vrow">
                <span className="court-vrow__rank">{i + 1}</span>
                <span className="court-vrow__name">{v.displayName}</span>
                <span className="court-vrow__count">{v.visitsHere} here · {v.totalVisits} total</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="recent visits">
        {recentVisits.length === 0 ? (
          <Empty>no recent visits.</Empty>
        ) : (
          <ul className="court-rfeed">
            {recentVisits.map((v) => (
              <li key={v._id} className="court-rrow">
                <span className="court-rrow__when">{formatDateTime(v.startUtc)}</span>
                <span className="court-rrow__who">{v.userName}</span>
                <span className="court-rrow__dur">{v.durationMin} min</span>
                <span className="court-rrow__act">σ {v.activityLevel?.toFixed(2) ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="court character · activity distribution">
        <IntensityHistogram histogram={intensityHistogram} />
      </Section>
    </Wrapper>
  );
}

// ────────────────────────────────────────────────────────────────────
function Wrapper({ children, onClose }) {
  return (
    <div className="court-panel">
      <button
        type="button"
        className="court-panel__close"
        onClick={onClose}
        aria-label="Close court profile"
      >
        ✕
      </button>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="court-section">
      <div className="court-section__head">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div className="court-empty">{children}</div>;
}

function Kpi({ label, value }) {
  return (
    <div className="court-kpi">
      <span className="court-kpi__label">{label}</span>
      <span className="court-kpi__value">{value}</span>
    </div>
  );
}

function Heatmap({ heatmap }) {
  const { grid, max } = heatmap;
  return (
    <div className="heatmap">
      <div className="heatmap__hours">
        {Array.from({ length: 24 }).map((_, h) => (
          <span key={h} className="heatmap__hour-label">
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
      {grid.map((row, dow) => (
        <div key={dow} className="heatmap__row">
          <span className="heatmap__day-label">{DAY_LABELS[dow]}</span>
          {row.map((n, h) => {
            const t = max > 0 ? n / max : 0;
            const bg = `rgba(15, 23, 42, ${0.06 + t * 0.84})`;
            return (
              <span
                key={h}
                className="heatmap__cell"
                style={{ background: n === 0 ? "rgba(15,23,42,0.04)" : bg }}
                title={`${DAY_LABELS[dow]} ${String(h).padStart(2, "0")}:00 · ${n} visits`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function IntensityHistogram({ histogram }) {
  const max = Math.max(1, ...histogram.map((b) => b.count));
  return (
    <div className="hist">
      {histogram.map((b) => (
        <div key={b.label} className="hist__col" title={`${b.label}: ${b.count}`}>
          <span className="hist__bar" style={{ height: `${(b.count / max) * 100}%` }} />
          <span className="hist__num">{b.count}</span>
          <span className="hist__label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sl-SI", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
