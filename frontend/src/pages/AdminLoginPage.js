import React, { useState } from "react";
import { api, session } from "../api";
import "./AuthPage.css";

export default function AdminLoginPage({ navigate }) {
  const [form, setForm]   = useState({ username: "", password: "" });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await api.adminLogin({ username: form.username, password: form.password });
      session.set(res.token, { name: "Super Admin", role: "superadmin", id: "superadmin" });
      navigate("admin");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitPass</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:"2.5rem",marginBottom:8}}>🛡️</div>
          <h1 className="auth-title" style={{marginBottom:4}}>Super Admin Login</h1>
          <p className="auth-sub" style={{marginBottom:0}}>Access restricted to platform administrators</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Username</label>
            <input required autoComplete="username" value={form.username} onChange={set("username")} placeholder="superadmin" />
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
            {busy ? <><span className="spinner"/> Signing in…</> : "🔐 Access Dashboard"}
          </button>
        </form>
        <p className="auth-switch" style={{marginTop:16}}>
          Regular user? <button className="link-btn" onClick={() => navigate("login")}>User login</button>
        </p>
      </div>
    </div>
  );
}
