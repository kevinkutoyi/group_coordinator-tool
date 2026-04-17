import React, { useState } from "react";
import { api, auth } from "../api";
import "./AdminLoginPage.css";

export default function AdminLoginPage({ navigate }) {
  const [form, setForm]   = useState({ username: "", password: "" });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.adminLogin({ username: form.username, password: form.password });
      auth.setToken(res.token);
      navigate("earnings");
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-outer fade-in">
      {/* Background glow */}
      <div className="login-glow" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-icon">⚡</span>
          <span>SplitPass</span>
        </div>

        <h1 className="login-title">Admin Login</h1>
        <p className="login-sub">Sign in to view your platform earnings dashboard</p>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Username */}
          <div className="form-group">
            <label>Username</label>
            <div className="input-icon-wrap">
              <span className="input-icon">👤</span>
              <input
                required
                autoComplete="username"
                value={form.username}
                onChange={set("username")}
                placeholder="admin"
                className="input-with-icon"
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label>Password</label>
            <div className="input-icon-wrap">
              <span className="input-icon">🔒</span>
              <input
                required
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••••"
                className="input-with-icon"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
            {busy
              ? <><span className="spinner" /> Signing in…</>
              : "Sign In →"}
          </button>
        </form>

        {/* Security note */}
        <div className="login-security-note">
          🔐 Protected by JWT · Session expires in 8 hours
        </div>
      </div>
    </div>
  );
}
