/**
 * UsersGlobalOverview — "empty state" panel za Users svet.
 *
 * Prikaze se na desni strani, ko admin se ni izbral nobenega uporabnika.
 * Vsebuje:
 *   - hero: day x hour heatmap (kdaj se najpogosteje igra)
 *   - top users this week (klikabilni -> izberejo userja v directoryju)
 *   - 8-week activity trend
 *   - top courts
 *   - persona mix (stacked bar)
 *
 * Vsi podatki pridejo iz enega klica: GET /api/admin/overview/users.
 */

import { useEffect, useState } from "react";
import { getAdminUsersOverview } from "../../api/admin";

const DAY_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function UsersGlobalOverview({ onPickUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    getAdminUsersOverview()
      .then((d) => { if (!abort) setData(d); })
      .catch(() => { if (!abort) setData(null); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, []);

  if (loading && !data) {
    return <section className="user-profile"><div className="users-empty">loading overview…</div></section>;
  }
  if (!data) {
    return <section className="user-profile"><div className="users-empty">no overview data.</div></section>;
  }

  return (
    <section className="user-profile global-overview">
      <header className="profile-head">
        <span className="profile-head__eyebrow">users · global overview</span>
        <h2 className="profile-head__title">[ at a glance ]</h2>
        <div className="profile-head__meta">
          <span>{data.personaMix.total} users · pick someone to see their profile</span>
        </div>
      </header>

      <Section title="when people play">
        <Heatmap heatmap={data.heatmap} />
      </Section>

      <div className="overview-row">
        <Section title="top users this week" className="overview-row__cell">
          {data.topUsers.length === 0 ? (
            <Empty>no visits yet this week.</Empty>
          ) : (
            <ul className="topu-list">
              {data.topUsers.map((u, i) => (
                <li key={u._id}>
                  <button
                    type="button"
                    className="topu-row"
                    onClick={() => onPickUser?.(u._id)}
                  >
                    <span className="topu-row__rank">{i + 1}</span>
                    <span className="topu-row__name">{u.displayName}</span>
                    <span className="topu-row__count">{u.visitsThisWeek}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="visits per week · last 8" className="overview-row__cell">
          <WeeklyTrend weeks={data.weeklyTrend} />
        </Section>
      </div>

      <div className="overview-row">
        <Section title="top courts" className="overview-row__cell">
          <TopCourts courts={data.topCourts} />
        </Section>

        <Section title="user persona mix" className="overview-row__cell">
          <PersonaMix mix={data.personaMix} />
        </Section>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Heatmap
// ────────────────────────────────────────────────────────────────────
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
      <div className="heatmap__legend">
        <span>quiet</span>
        <span className="heatmap__legend-scale" />
        <span>peak · {max}</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Weekly trend (mini bars)
// ────────────────────────────────────────────────────────────────────
function WeeklyTrend({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <div className="trend">
      {weeks.map((w, i) => {
        const h = `${(w.count / max) * 100}%`;
        const date = new Date(w.weekStart);
        const label = date.toLocaleDateString("sl-SI", { month: "short", day: "numeric" });
        return (
          <div key={i} className="trend__col" title={`${label} · ${w.count} visits`}>
            <span className="trend__bar" style={{ height: h }} />
            <span className="trend__num">{w.count}</span>
            <span className="trend__date">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Top courts (bar list, same vis lang as user profile)
// ────────────────────────────────────────────────────────────────────
function TopCourts({ courts }) {
  if (courts.length === 0) return <Empty>no visits yet.</Empty>;
  const max = courts[0]?.count || 1;
  return (
    <ul className="court-bars">
      {courts.map((c) => (
        <li key={c.playgroundId} className="court-bar">
          <span className="court-bar__name">{c.name}</span>
          <span className="court-bar__count">{c.count}</span>
          <span className="court-bar__track">
            <span className="court-bar__fill" style={{ width: `${(c.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────────────
// Persona mix (stacked bar + legend)
// ────────────────────────────────────────────────────────────────────
function PersonaMix({ mix }) {
  const parts = [
    { id: "regular",   label: "regular",   value: mix.regular,   color: "#0f172a" },
    { id: "weekender", label: "weekender", value: mix.weekender, color: "#475569" },
    { id: "casual",    label: "casual",    value: mix.casual,    color: "#94a3b8" },
    { id: "dormant",   label: "dormant",   value: mix.dormant,   color: "#cbd5e1" },
    { id: "noVisits",  label: "no visits", value: mix.noVisits,  color: "#e2e8f0" },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="persona">
      <div className="persona__bar">
        {parts.map((p) => (
          p.value > 0 && (
            <span
              key={p.id}
              className="persona__seg"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              title={`${p.label}: ${p.value}`}
            />
          )
        ))}
      </div>
      <ul className="persona__legend">
        {parts.map((p) => (
          <li key={p.id}>
            <span className="persona__dot" style={{ background: p.color }} />
            <span className="persona__label">{p.label}</span>
            <span className="persona__count">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, className, children }) {
  return (
    <div className={`profile-section ${className || ""}`}>
      <div className="profile-section__head">{title}</div>
      {children}
    </div>
  );
}
function Empty({ children }) {
  return <div className="profile-empty">{children}</div>;
}
