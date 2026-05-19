/**
 * AuthPanel — login / status komponenta (SCRUM-29 demo flow).
 *
 * Brez login-a /api/devices vrne 401, zato je tukaj minimalen vmesnik:
 *   - ce smo `anon` -> email/password form (POST /api/auth/login)
 *   - ce smo `authed` -> prikaz uporabnika + logout
 *
 * Ni namenjen polni "registracija + reset gesla" izkusnji - to je locen ticket.
 */

import { useState } from 'react';

import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AuthPanel() {
  const { status, user, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (status === 'initializing') {
    return (
      <div className="auth-panel">
        <span className="auth-panel__status">Preverjam sejo…</span>
      </div>
    );
  }

  if (status === 'authed') {
    return (
      <div className="auth-panel auth-panel--authed">
        <div>
          <span className="status-label">Prijavljen</span>
          <strong>{user && (user.displayName || user.email)}</strong>
        </div>
        <button type="button" className="ghost-button" onClick={logout}>
          Odjavi se
        </button>
      </div>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await login({ email: email.trim(), password });
      setPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Prijava ni uspela.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-panel" onSubmit={handleSubmit} noValidate>
      <div className="auth-panel__fields">
        <label className="field">
          <span className="status-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="ime@example.com"
          />
        </label>
        <label className="field">
          <span className="status-label">Geslo</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </label>
      </div>
      <button type="submit" className="primary-button" disabled={submitting || !email || !password}>
        {submitting ? 'Prijavljam…' : 'Prijavi se'}
      </button>
      {errorMessage ? (
        <p role="alert" className="error-banner">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
