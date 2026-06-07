/**
 * AuthPage — samostojna admin prijavna stran.
 *
 * Brez registracije: dashboard je administracijska aplikacija. Racune
 * upravlja administrator locene (CLI / seed). Ob uspesni prijavi
 * AuthContext nastavi status 'authed' in App preklopi na dashboard.
 */

import { useState } from "react";

import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import CourtBackground from "./CourtBackground";

// Translate raw backend/network errors into clean English without leaking
// internal codes. Accepts either a string or an ApiError-like object.
function prettifyError(err) {
  const raw = typeof err === "string" ? err : err?.message || "";
  const lc = raw.toLowerCase();
  if (lc.includes("rate") || lc.includes("too many") || lc.includes("preveč"))
    return "too many attempts. wait a minute and try again.";
  if (lc.includes("invalid") || lc.includes("napacno") || lc.includes("napačno") || lc.includes("credential"))
    return "wrong email or password.";
  if (lc.includes("network") || lc.includes("fetch") || lc.includes("failed to fetch"))
    return "can't reach the server.";
  if (lc.includes("required") || lc.includes("obvezno"))
    return "enter your email and password.";
  return raw || "sign in failed.";
}

const BG = {
  rotationY: 0.68,
  rotationX: -0.18,
  scale: 1.77,
  posX: -5,
  posY: -2.15,
  posZ: -1.85,
  cameraZ: 10.5,
};

export default function AuthPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || !email || !password;

  return (
    <div className="auth-page">
      <CourtBackground {...BG} />

      <div className="brand-bar">
        <img src="/assets/logo.jpg" alt="" className="brand-bar__logo" />
        <span className="brand-bar__name">štafeta</span>
      </div>

      <div className="auth-card">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="[ Your email ]"
            />
          </label>

          <label className="auth-field">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="[ Your password ]"
            />
          </label>

          <button
            type="submit"
            className="auth-arrow-btn"
            aria-label="Sign in"
            disabled={disabled}
          >
            <img src="/assets/arrow.svg" alt="" />
          </button>

          {error && (
            <p role="alert" className="auth-error">
              <span className="auth-error__tag">error</span>
              <span className="auth-error__msg">{prettifyError(error)}</span>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
