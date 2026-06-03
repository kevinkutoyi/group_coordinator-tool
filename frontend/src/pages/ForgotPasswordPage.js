import React, { useState } from "react";
import { api } from "../api";
import "./AuthPage.css";

export default function ForgotPasswordPage({ navigate }) {
  const [step, setStep] = useState("email");
  const [email, setEmail]         = useState("");
  const [code, setCode]           = useState("");
  const [newPassword, setNewPw]   = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  function startCooldown() {
    setResendCooldown(30);
    const i = setInterval(() => setResendCooldown(s => { if (s <= 1) { clearInterval(i); return 0; } return s - 1; }), 1000);
  }

  async function handleEmail(e) {
    e.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const r = await api.forgotPassword(email.trim());
      setSuccess(r.message);
      setStep("reset");
      startCooldown();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (newPassword !== confirmPw) return setError("Passwords do not match");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true); setError("");
    try {
      const r = await api.resetPassword(email.trim(), code.trim(), newPassword);
      setSuccess(r.message);
      setStep("done");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleResend() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const r = await api.resendOtp(email.trim(), "reset");
      setSuccess(r.message);
      startCooldown();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (step === "done") return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div style={{ fontSize:"3rem", marginBottom:14 }}>✅</div>
        <h1 className="auth-title">Password updated</h1>
        <p className="auth-sub">{success}</p>
        <button className="btn btn-primary auth-btn" onClick={() => navigate("login")}>Log in</button>
      </div>
    </div>
  );

  if (step === "reset") return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitSubs</button>
        <h1 className="auth-title">🔑 Set a new password</h1>
        <p className="auth-sub">Enter the code from <strong>{email}</strong> and choose a new password</p>
        <form onSubmit={handleReset} className="auth-form">
          <div className="form-group">
            <label>Verification Code</label>
            <input
              autoFocus inputMode="numeric" maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              style={{ fontSize:"1.5rem", letterSpacing:"0.4em", textAlign:"center", fontFamily:"monospace" }}
            />
          </div>
          <div className="form-group">
            <label>New password (min 8 chars)</label>
            <div className="pw-wrap">
              <input
                required type={showPw ? "text" : "password"} minLength={8}
                value={newPassword} onChange={e => setNewPw(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" className="pw-eye" onClick={() => setShowPw(s => !s)}>{showPw ? "🙈" : "👁️"}</button>
            </div>
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input
              required type={showPw ? "text" : "password"} minLength={8}
              value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
            />
          </div>
          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div style={{ background:"rgba(74,222,128,0.1)", color:"var(--success)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", marginBottom:12 }}>✅ {success}</div>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy || code.length !== 6}>
            {busy ? <><span className="spinner"/> Resetting…</> : "🔑 Reset password"}
          </button>
        </form>
        <p className="auth-switch">
          Didn't get the code? <button className="link-btn" type="button" onClick={handleResend} disabled={busy || resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </p>
        <p className="auth-switch" style={{ marginTop:4 }}>
          <button className="link-btn" type="button" onClick={() => setStep("email")}>← Use a different email</button>
        </p>
      </div>
    </div>
  );

  return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitSubs</button>
        <h1 className="auth-title">🔑 Forgot your password?</h1>
        <p className="auth-sub">Enter your email and we'll send a reset code</p>
        <form onSubmit={handleEmail} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          </div>
          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div style={{ background:"rgba(74,222,128,0.1)", color:"var(--success)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", marginBottom:12 }}>✅ {success}</div>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>
            {busy ? <><span className="spinner"/> Sending…</> : "📧 Send reset code"}
          </button>
        </form>
        <p className="auth-switch">
          Remembered it? <button className="link-btn" onClick={() => navigate("login")}>Back to login</button>
        </p>
      </div>
    </div>
  );
}
