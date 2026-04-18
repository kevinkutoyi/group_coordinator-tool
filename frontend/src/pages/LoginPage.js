import React, { useState } from "react";
import { api, session } from "../api";
import "./AuthPage.css";

export default function LoginPage({ navigate, params }) {
  const [form, setForm] = useState({ email:"", password:"" });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await api.login({ email: form.email, password: form.password });
      session.set(res.token, res.user);
      navigate(params?.redirect || "groups");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitPass</button>
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-sub">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@email.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <div className="pw-wrap">
              <input required type={showPw?"text":"password"} autoComplete="current-password"
                value={form.password} onChange={set("password")} placeholder="••••••••" />
              <button type="button" className="pw-eye" onClick={() => setShowPw(v=>!v)}>{showPw?"🙈":"👁️"}</button>
            </div>
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>
            {busy ? <><span className="spinner"/> Signing in…</> : "Sign In →"}
          </button>
        </form>

        <p className="auth-switch">
          No account? <button className="link-btn" onClick={() => navigate("signup")}>Create one free</button>
        </p>
        <p className="auth-switch" style={{marginTop:4}}>
          Admin? <button className="link-btn" onClick={() => navigate("admin-login")}>Super-admin login</button>
        </p>
      </div>
    </div>
  );
}
