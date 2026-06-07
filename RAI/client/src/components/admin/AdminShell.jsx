/**
 * AdminShell — ogrodje za prijavljenega admina.
 *
 * Topbar z brandom + odjava; spodaj se renderira aktivni "world"
 * (overview | users | courts). Routing je trenutno preprost
 * state-based (brez react-router).
 */

import { useState } from "react";

import { useAuth } from "../../context/AuthContext";
import AdminOverview from "./AdminOverview";
import UsersWorld from "./UsersWorld";
import CourtsWorld from "./CourtsWorld";

export default function AdminShell() {
  const { user, logout } = useAuth();
  const [view, setView] = useState("overview");

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-brand"
          onClick={() => setView("overview")}
          aria-label="Overview"
        >
          <img src="/assets/logo.jpg" alt="" className="admin-brand__logo" />
          <span className="admin-brand__name">štafeta</span>
        </button>

        <nav className="admin-topnav" aria-label="Glavna navigacija">
          <NavLink active={view === "overview"} onClick={() => setView("overview")}>
            overview
          </NavLink>
          <NavLink active={view === "users"} onClick={() => setView("users")}>
            users
          </NavLink>
          <NavLink active={view === "courts"} onClick={() => setView("courts")}>
            courts
          </NavLink>
        </nav>

        <div className="admin-userblock">
          <span className="admin-userblock__name">
            {user?.displayName || user?.email}
          </span>
          <button type="button" className="admin-signout" onClick={logout}>
            sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        {view === "overview" && <AdminOverview onGo={setView} />}
        {view === "users" && <UsersWorld />}
        {view === "courts" && <CourtsWorld />}
      </main>
    </div>
  );
}

function NavLink({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`admin-navlink ${active ? "admin-navlink--active" : ""}`}
      onClick={onClick}
    >
      [ {children} ]
    </button>
  );
}
