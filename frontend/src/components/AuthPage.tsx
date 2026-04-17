import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { forgotPassword, resetPassword } from "../lib/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const FEATURES = [
  {
    icon: "🔍",
    title: "Intelligent retrieval",
    desc: "Hybrid semantic + keyword search across all your legal documents.",
  },
  {
    icon: "⚡",
    title: "Intent-aware answers",
    desc: "Automatically detects clause extraction, risk assessment, statute lookups, and more.",
  },
  {
    icon: "📊",
    title: "Source-cited responses",
    desc: "Every answer links back to the exact passage — no guessing, no hallucinations.",
  },
];

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Detect ?reset_token=xxx in URL
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reset_token");
    if (token) {
      setResetToken(token);
      setMode("reset");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setEmail("");
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccessMsg(null);
  }

  async function handleLoginRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${API_BASE}/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Something went wrong.");
        return;
      }
      await login(data.access_token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { message } = await forgotPassword(email);
      setSuccessMsg(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { message } = await resetPassword(resetToken, password);
      setSuccessMsg(message + " You can now sign in.");
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  // ── Form content by mode ─────────────────────────────────
  function renderForm() {
    if (mode === "forgot") {
      return (
        <>
          <div className="auth-form-header">
            <h2 className="auth-form-title">Reset your password</h2>
            <p className="auth-form-sub">
              Enter your email and we'll send you a reset link.
            </p>
          </div>
          {successMsg ? (
            <p className="form-feedback success">{successMsg}</p>
          ) : (
            <form className="auth-form" onSubmit={handleForgotPassword}>
              <div className="auth-field">
                <label htmlFor="auth-email" className="field-label">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="form-feedback error">{error}</p>}
              <button type="submit" disabled={busy} className="auth-cta">
                {busy ? "Sending…" : "Send reset link →"}
              </button>
            </form>
          )}
          <p className="auth-toggle">
            <button type="button" className="link-btn" onClick={() => switchMode("login")}>
              ← Back to sign in
            </button>
          </p>
        </>
      );
    }

    if (mode === "reset") {
      return (
        <>
          <div className="auth-form-header">
            <h2 className="auth-form-title">Choose a new password</h2>
            <p className="auth-form-sub">Enter your new password below.</p>
          </div>
          <form className="auth-form" onSubmit={handleResetPassword}>
            <div className="auth-field">
              <label htmlFor="auth-password" className="field-label">New password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                minLength={8}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-confirm" className="field-label">Confirm password</label>
              <input
                id="auth-confirm"
                type="password"
                value={confirm}
                autoComplete="new-password"
                placeholder="Repeat your password"
                required
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="form-feedback error">{error}</p>}
            <button type="submit" disabled={busy} className="auth-cta">
              {busy ? "Saving…" : "Set new password →"}
            </button>
          </form>
        </>
      );
    }

    // login / register
    return (
      <>
        <div className="auth-form-header">
          <h2 className="auth-form-title">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="auth-form-sub">
            {mode === "login"
              ? "Sign in to continue to LexiCounsel"
              : "Start your 7-day free trial today"}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleLoginRegister}>
          <div className="auth-field">
            <label htmlFor="auth-email" className="field-label">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@company.com"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password" className="field-label">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "Minimum 8 characters" : "Enter your password"}
              minLength={mode === "register" ? 8 : undefined}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="auth-confirm" className="field-label">Confirm password</label>
              <input
                id="auth-confirm"
                type="password"
                value={confirm}
                autoComplete="new-password"
                placeholder="Repeat your password"
                required
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          )}

          {successMsg && <p className="form-feedback success">{successMsg}</p>}
          {error && <p className="form-feedback error">{error}</p>}

          {mode === "login" && (
            <div className="auth-forgot-row">
              <button type="button" className="link-btn small" onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
            </div>
          )}

          <button type="submit" disabled={busy} className="auth-cta">
            {busy
              ? "Please wait…"
              : mode === "login"
              ? "Sign in →"
              : "Create account →"}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("register")}>
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </>
    );
  }

  return (
    <div className="auth-shell">
      {/* Left panel: branding */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-wordmark">
            <span className="auth-wordmark-icon">⚖</span>
            <span className="auth-wordmark-name">LexiCounsel</span>
          </div>
          <div className="auth-hero">
            <h1 className="auth-hero-title">
              Legal research,<br />at AI speed.
            </h1>
            <p className="auth-hero-sub">
              Upload contracts, legislation, and case files. Ask questions in plain English. Get
              precise, source-cited answers in seconds.
            </p>
          </div>
          <ul className="auth-features">
            {FEATURES.map((f) => (
              <li key={f.title} className="auth-feature">
                <span className="auth-feature-icon">{f.icon}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel: form */}
      <div className="auth-right">
        <div className="auth-form-wrap">{renderForm()}</div>
      </div>
    </div>
  );
}
