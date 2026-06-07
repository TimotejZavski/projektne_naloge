/**
 * UsersWorld — admin pogled "Users".
 *
 * Layout: tanka toolbar (search + filter chip-i), pod njo dva stolpca:
 *   levo  — direktorij (lista uporabnikov, klik izbere)
 *   desno — profil izbranega uporabnika (KPI + top courts + recent visits + devices)
 *
 * Glavni podatki pridejo iz /api/admin/users in /api/admin/users/:id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listAdminUsers, getAdminUserDetail } from "../../api/admin";
import UserLocationsMap from "./UserLocationsMap";
import UsersGlobalOverview from "./UsersGlobalOverview";

const FILTERS = [
  { id: "all", label: "all" },
  { id: "active", label: "active" },
  { id: "admins", label: "admins" },
];

export default function UsersWorld() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ total: null });
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // ── load list ────────────────────────────────────────────────────
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingList(true);
      try {
        const data = await listAdminUsers({ search, filter, limit: 200 });
        setUsers(data.users || []);
        setMeta(data.meta || { total: null });
        // Ne avto-selektaj — pustimo, da se prikaze global overview.
      } catch {
        setUsers([]);
      } finally {
        setLoadingList(false);
      }
    }, 180);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [search, filter]); // eslint-disable-line

  return (
    <div className="users-world">
      <div className="users-toolbar">
        <div className="users-search">
          <span className="users-search__icon">⌕</span>
          <input
            type="search"
            placeholder="search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="users-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`users-filter ${filter === f.id ? "users-filter--active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              [ {f.label} ]
            </button>
          ))}
        </div>
        <div className="users-meta">
          {meta.total != null && (
            <span>{users.length} of {meta.total}</span>
          )}
        </div>
      </div>

      <div className="users-grid">
        <UserDirectory
          users={users}
          loading={loadingList}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedId
          ? <UserProfile userId={selectedId} />
          : <UsersGlobalOverview onPickUser={setSelectedId} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Directory
// ────────────────────────────────────────────────────────────────────
function UserDirectory({ users, loading, selectedId, onSelect }) {
  if (loading && users.length === 0) {
    return <aside className="users-directory"><div className="users-empty">loading…</div></aside>;
  }
  if (users.length === 0) {
    return (
      <aside className="users-directory">
        <div className="users-empty">no users match.</div>
      </aside>
    );
  }
  return (
    <aside className="users-directory">
      {users.map((u) => (
        <DirectoryRow
          key={u._id}
          user={u}
          selected={u._id === selectedId}
          onClick={() => onSelect(u._id)}
        />
      ))}
    </aside>
  );
}

function DirectoryRow({ user, selected, onClick }) {
  const active = isActiveByLastVisit(user.stats?.lastVisitAt);
  return (
    <button
      type="button"
      className={`dir-row ${selected ? "dir-row--selected" : ""}`}
      onClick={onClick}
    >
      <div className="dir-row__line1">
        <span className="dir-row__name">{user.displayName}</span>
        <span className={`dir-row__dot ${active ? "dir-row__dot--on" : ""}`} />
      </div>
      <div className="dir-row__line2">
        {user.stats?.totalVisits ?? 0} visits
        {user.stats?.favoritePlaygroundName && (
          <> · <span className="dir-row__fav">{shortName(user.stats.favoritePlaygroundName)}</span></>
        )}
        {user.stats?.lastVisitAt && (
          <> · {relativeTime(user.stats.lastVisitAt)}</>
        )}
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Profile
// ────────────────────────────────────────────────────────────────────
function UserProfile({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await getAdminUserDetail(id);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    load(userId);
  }, [userId, load]);

  if (!userId) return null;
  if (loading && !data) {
    return <section className="user-profile"><div className="users-empty">loading user…</div></section>;
  }
  if (!data) {
    return <section className="user-profile"><div className="users-empty">no data.</div></section>;
  }

  const { user, persona, topCourts, recentVisits, devices } = data;
  const active = isActiveByLastVisit(user.stats?.lastVisitAt);
  const maxCount = topCourts[0]?.count || 1;

  return (
    <section className="user-profile">
      <header className="profile-head">
        <span className="profile-head__eyebrow">user · {user.role}</span>
        <h2 className="profile-head__title">
          [ {user.displayName} ]
          <span className={`profile-head__dot ${active ? "profile-head__dot--on" : ""}`} />
        </h2>
        <div className="profile-head__meta">
          <span>{user.email}</span>
          <span>· joined {formatDate(user.createdAtUtc)}</span>
        </div>
      </header>

      <div className="profile-kpis profile-kpis--five">
        <ProfileKpi label="visits"   value={user.stats?.totalVisits ?? 0} />
        <ProfileKpi label="streak"   value={`${user.stats?.streakDays ?? 0} d`} />
        <PersonaKpi persona={persona} />
        <ProfileKpi label="devices"  value={devices.length} />
        <ProfileKpi label="last seen" value={user.stats?.lastVisitAt ? relativeTime(user.stats.lastVisitAt) : "—"} />
      </div>

      <Section title="map of visited courts">
        <UserLocationsMap userId={user._id} />
      </Section>

      <Section title="most visited courts">
        {topCourts.length === 0 ? (
          <Empty>no court visits yet.</Empty>
        ) : (
          <ul className="court-bars">
            {topCourts.map((c) => (
              <li key={c.playgroundId} className="court-bar">
                <span className="court-bar__name">{c.name}</span>
                <span className="court-bar__count">{c.count}</span>
                <span className="court-bar__track">
                  <span
                    className="court-bar__fill"
                    style={{ width: `${(c.count / maxCount) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="recent visits">
        {recentVisits.length === 0 ? (
          <Empty>nothing recent.</Empty>
        ) : (
          <ul className="visits-list">
            {recentVisits.map((v) => (
              <li key={v._id} className="visit-row">
                <span className="visit-row__when">{formatDateTime(v.startUtc)}</span>
                <span className="visit-row__name">{v.playgroundName}</span>
                <span className="visit-row__dur">{v.durationMin} min</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="devices">
        {devices.length === 0 ? (
          <Empty>no devices registered.</Empty>
        ) : (
          <ul className="devices-list">
            {devices.map((d) => (
              <li key={d._id} className="device-row">
                <span className="device-row__id">{d.deviceId}</span>
                <span className="device-row__plat">{d.platform}</span>
                <span className="device-row__seen">
                  {d.lastSeenAtUtc ? `last seen ${relativeTime(d.lastSeenAtUtc)}` : "never seen"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// small helpers + UI atoms
// ────────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="profile-section">
      <div className="profile-section__head">{title}</div>
      {children}
    </div>
  );
}
function Empty({ children }) {
  return <div className="profile-empty">{children}</div>;
}
function ProfileKpi({ label, value }) {
  return (
    <div className="profile-kpi">
      <span className="profile-kpi__label">{label}</span>
      <span className="profile-kpi__value">{value}</span>
    </div>
  );
}

const PERSONA_META = {
  regular:   { label: "regular",   color: "#0f172a" },
  weekender: { label: "weekender", color: "#475569" },
  casual:    { label: "casual",    color: "#94a3b8" },
  dormant:   { label: "dormant",   color: "#cbd5e1" },
  noVisits:  { label: "—",         color: "#e2e8f0" },
};

function PersonaKpi({ persona }) {
  const meta = PERSONA_META[persona] || PERSONA_META.noVisits;
  return (
    <div className="profile-kpi">
      <span className="profile-kpi__label">persona</span>
      <span className="profile-kpi__value profile-kpi__value--persona">
        <span className="persona-dot" style={{ background: meta.color }} />
        {meta.label}
      </span>
    </div>
  );
}

function isActiveByLastVisit(iso) {
  if (!iso) return false;
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs < 7 * 24 * 60 * 60 * 1000;
}

function shortName(s) {
  if (!s) return "";
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sl-SI", { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sl-SI", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
