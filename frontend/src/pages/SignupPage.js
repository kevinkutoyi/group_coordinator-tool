import React, { useState } from "react";
import { api, session } from "../api";
import "./AuthPage.css";

export default function SignupPage({ navigate, params }) {
  const [step, setStep] = useState("form");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirm: "",
    role: params?.role === "moderator" ? "moderator" : "customer",
    newsletter: true,
  });
  const [otp, setOtp]         = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailMsg, setEmailMsg]       = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  function checkEmailFormat(email) {
    if (!email) { setEmailStatus(null); setEmailMsg(""); return; }
    const regex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    const disposable = ["mailinator","guerrillamail","yopmail","tempmail","10minutemail","trashmail","throwaway","fakeinbox","dispostable","maildrop","spamgourmet"];
    const domain = email.split("@")[1] || "";
    if (!regex.test(email) || email.includes("..")) { setEmailStatus("error"); setEmailMsg("Invalid email format"); }
    else if (disposable.some(d => domain.includes(d))) { setEmailStatus("error"); setEmailMsg("Disposable emails not allowed"); }
    else { setEmailStatus("ok"); setEmailMsg("Looks good!"); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Passwords do not match");
    setBusy(true); setError("");
    try {
      await api.signup({
        name: form.name, email: form.email, phone: form.phone,
        password: form.password, role: form.role, newsletter: form.newsletter,
      });
      setStep("otp");
      setSuccess(`Verification code sent to ${form.email}. Check your inbox.`);
      startResendCooldown();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!otp.trim()) return setError("Enter the 6-digit code");
    setBusy(true); setError("");
    try {
      const res = await api.verifySignup(form.email, otp.trim());
      if (form.role === "moderator") {
        setStep("done");
        setSuccess("Email verified! Moderator account created. Awaiting admin approval — you'll get an email when approved.");
      } else {
        session.set(res.token, res.user);
        navigate(params?.redirect || "home");
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function startResendCooldown() {
    setResendCooldown(30);
    const i = setInterval(() => setResendCooldown(s => { if (s <= 1) { clearInterval(i); return 0; } return s - 1; }), 1000);
  }

  async function handleResend() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const res = await api.resendOtp(form.email, "signup");
      setSuccess(res.message);
      startResendCooldown();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // Inline styles for role cards so they don't depend on missing CSS
  const roleCardStyle = (active) => ({
    flex: 1,
    padding: "14px 12px",
    border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 12,
    background: active ? "rgba(124,106,255,0.12)" : "var(--bg3)",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.18s, background 0.18s",
    fontSize: "0.9rem",
    fontWeight: 600,
    color: active ? "var(--text)" : "var(--muted)",
  });

  // ─── OTP step ─────────────────────────────────────────
  if (step === "otp") return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitSubs</button>
        <h1 className="auth-title">📧 Verify your email</h1>
        <p className="auth-sub">Enter the 6-digit code we sent to <strong>{form.email}</strong></p>
        <form onSubmit={handleVerify} className="auth-form">
          <div className="form-group">
            <label>Verification Code</label>
            <input
              autoFocus inputMode="numeric" maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              style={{ fontSize:"1.6rem", letterSpacing:"0.4em", textAlign:"center", fontFamily:"monospace" }}
            />
          </div>
          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div style={{ background:"rgba(74,222,128,0.1)", color:"var(--success)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", marginBottom:12 }}>✅ {success}</div>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy || otp.length !== 6}>
            {busy ? <><span className="spinner"/> Verifying…</> : "✅ Verify & Create Account"}
          </button>
        </form>
        <p className="auth-switch" style={{ marginTop:14 }}>
          Didn't get the code?{" "}
          <button className="link-btn" type="button" onClick={handleResend} disabled={busy || resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </p>
        <p className="auth-switch" style={{ marginTop:4 }}>
          <button className="link-btn" type="button" onClick={() => setStep("form")}>← Edit email or details</button>
        </p>
      </div>
    </div>
  );

  // ─── Done step ───────────────────────────────────────
  if (step === "done") return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div style={{ fontSize:"3rem", marginBottom:14 }}>✉️</div>
        <h1 className="auth-title">Check your inbox</h1>
        <p className="auth-sub">{success}</p>
        <button className="btn btn-primary auth-btn" onClick={() => navigate("login")}>Go to Login</button>
      </div>
    </div>
  );

  // ─── Form step ───────────────────────────────────────
  return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitSubs</button>
        <h1 className="auth-title">Create your SplitSubs account</h1>
        <p className="auth-sub">We'll send a 6-digit code to verify your email</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Full Name</label>
            <input required value={form.name} onChange={set("name")} placeholder="Your name" />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              required type="email" autoComplete="email"
              value={form.email}
              onChange={e => { set("email")(e); checkEmailFormat(e.target.value); }}
              placeholder="you@example.com"
            />
            {emailStatus && (
              <p style={{ fontSize:"0.78rem", color: emailStatus === "ok" ? "var(--success)" : "var(--error)", margin:"4px 2px 0" }}>
                {emailMsg}
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Phone (optional)</label>
            <input value={form.phone} onChange={set("phone")} placeholder="+254712345678" />
          </div>

          <div className="form-group">
            <label>Password (min 8 chars)</label>
            <div className="pw-wrap">
              <input
                required type={showPw ? "text" : "password"} minLength={8}
                value={form.password} onChange={set("password")}
                placeholder="••••••••"
              />
              <button type="button" className="pw-eye" onClick={() => setShowPw(s => !s)}>
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              required type={showPw ? "text" : "password"} minLength={8}
              value={form.confirm} onChange={set("confirm")}
              placeholder="Repeat password"
            />
          </div>

          <div className="form-group">
            <label>Account type</label>
            <div style={{ display:"flex", gap:10 }}>
              <div onClick={() => setForm(f => ({ ...f, role: "customer" }))} style={roleCardStyle(form.role === "customer")}>
                👤 Customer
                <div style={{ fontSize:"0.72rem", fontWeight:400, color:"var(--muted)", marginTop:4 }}>Join groups, save on subs</div>
              </div>
              <div onClick={() => setForm(f => ({ ...f, role: "moderator" }))} style={roleCardStyle(form.role === "moderator")}>
                🛡️ Moderator
                <div style={{ fontSize:"0.72rem", fontWeight:400, color:"var(--muted)", marginTop:4 }}>Organise groups, earn payouts</div>
              </div>
            </div>
          </div>

          <label style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:"0.85rem", color:"var(--muted)", margin:"12px 0" }}>
            <input type="checkbox" checked={form.newsletter} onChange={toggle("newsletter")} />
            <span>Send me product updates and group launches (you can unsubscribe anytime).</span>
          </label>

          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div style={{ background:"rgba(74,222,128,0.1)", color:"var(--success)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", marginBottom:12 }}>✅ {success}</div>}

          <button type="submit" className="btn btn-primary auth-btn" disabled={busy || emailStatus === "error"}>
            {busy ? <><span className="spinner"/> Sending code…</> : "📧 Send verification code"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <button className="link-btn" onClick={() => navigate("login")}>Log in</button>
        </p>
      </div>
    </div>
  );
}
