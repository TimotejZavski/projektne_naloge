/**
 * AuthContext (SCRUM-29 podpora).
 *
 * Hrani trenutnega uporabnika in skrbi za login/logout flow.
 * Token se vodi v `api/client.js` (sessionStorage + in-memory) -
 * tukaj samo izpostavimo React state, da se UI auto-osvezi ob spremembi.
 *
 * Ob mount-u poskusi pridobiti current user (`GET /api/auth/me`).
 * - Ce token v storage-u obstaja in je veljaven -> user objekt
 * - Sicer poskusimo `refresh()` (HTTP-only cookie) -> tih relogin po reloadu
 * - Vsako napako tolerirano: nepriavljen uporabnik ni "error", samo praznoglobina
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refresh as apiRefresh,
  fetchCurrentUser,
} from '../api/auth';
import { ApiError, getAccessToken, setAccessToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('initializing'); // initializing | anon | authed | error
  const [error, setError] = useState(null);

  const initialise = useCallback(async () => {
    setStatus('initializing');
    setError(null);

    // 1) Ce ze imamo access token (npr. po reload tab-a), preveri da je se vedno OK
    if (getAccessToken()) {
      try {
        const me = await fetchCurrentUser();
        setUser(me && me.user ? me.user : me);
        setStatus('authed');
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Token potece -> spodaj poskusimo refresh
          setAccessToken(null);
        } else {
          setError(err);
        }
      }
    }

    // 2) Tih refresh prek HTTP-only cookie-ja
    try {
      await apiRefresh();
      const me = await fetchCurrentUser();
      setUser(me && me.user ? me.user : me);
      setStatus('authed');
      return;
    } catch {
      // pricakovano: ce nismo nikoli prijavljeni, refresh vrne 401
      setUser(null);
      setStatus('anon');
    }
  }, []);

  useEffect(() => {
    initialise();
  }, [initialise]);

  const login = useCallback(async (credentials) => {
    setError(null);
    const data = await apiLogin(credentials);
    setUser(data.user || null);
    setStatus('authed');
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    setError(null);
    const data = await apiRegister(payload);
    setUser(data.user || null);
    setStatus('authed');
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setStatus('anon');
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, error, login, register, logout, refresh: initialise }),
    [user, status, error, login, register, logout, initialise]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth: <AuthProvider> manjka v drevesu.');
  }
  return ctx;
}
