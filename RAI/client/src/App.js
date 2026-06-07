import { useEffect, useRef, useState } from "react";
import "./App.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import LoadingScreen from "./components/LoadingScreen";
import AuthPage from "./components/AuthPage";
import AdminShell from "./components/admin/AdminShell";

const PAGE_TRANSITION_MS = 700;

function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

function AppGate() {
  const { status } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Vsaka "stran" ima svojo vidnost (mounted) in stanje izhoda (leaving),
  // da lahko izvedemo crossfade med njima brez re-mounta (npr. Three.js
  // canvas v AuthPage ostane med tranzicijo).
  const [authMounted, setAuthMounted] = useState(false);
  const [adminMounted, setAdminMounted] = useState(false);
  const [authLeaving, setAuthLeaving] = useState(false);
  const [adminLeaving, setAdminLeaving] = useState(false);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === "authed") {
      setAdminMounted(true);
      setAdminLeaving(false);
      if (prev === "anon") {
        // crossfade: auth ostane mountan ~700ms in v tem casu fade-a stran
        setAuthLeaving(true);
        const t = setTimeout(() => {
          setAuthMounted(false);
          setAuthLeaving(false);
        }, PAGE_TRANSITION_MS);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    if (status === "anon") {
      setAuthMounted(true);
      setAuthLeaving(false);
      if (prev === "authed") {
        setAdminLeaving(true);
        const t = setTimeout(() => {
          setAdminMounted(false);
          setAdminLeaving(false);
        }, PAGE_TRANSITION_MS);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    return undefined;
  }, [status]);

  return (
    <>
      {authMounted && (
        <div
          className={`page-stage page-stage--auth ${authLeaving ? "page-stage--leaving" : ""}`}
          aria-hidden={authLeaving}
        >
          <AuthPage />
        </div>
      )}
      {adminMounted && (
        <div
          className={`page-stage page-stage--admin ${adminLeaving ? "page-stage--leaving" : ""}`}
          aria-hidden={adminLeaving}
        >
          <AdminShell />
        </div>
      )}
      {!splashDone && <LoadingScreen onDone={() => setSplashDone(true)} />}
    </>
  );
}

export default App;
