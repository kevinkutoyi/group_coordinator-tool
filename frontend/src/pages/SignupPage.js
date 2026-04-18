import React, { useState } from "react";
import { api, session } from "../api";
import "./AuthPage.css";

export default function SignupPage({ navigate, params }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirm: "",
    role: "customer",
    newsletter: true,   // pre-checked by default
  });
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [showPw, setShowPw]   = useState(false);

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Passwords do not match");
    setBusy(true); setError("");
    try {
      const res = await api.signup({
        name:       form.name,
        email:      form.email,
        phone:      form.phone,
        password:   form.password,
        role:       form.role,
        newsletter: form.newsletter,
      });
      if (form.role === "moderator") {
        setSuccess("Account created! Your moderator request is pending admin approval. You'll be able to log in once approved.");
      } else {
        session.set(res.token, res.user);
        navigate(params?.redirect || "groups");
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (success) return (
    <div className="auth-outer fade-in">
      <div className="auth-card">
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"3rem", marginBottom:16 }}>📬</div>
          <h2 style={{ fontFamily:"var(--font-head)", fontSize:"1.5rem", marginBottom:8 }}>Application Submitted!</h2>
          <p style={{ color:"var(--muted)", lineHeight:1.6, marginBottom:24 }}>{success}</p>
          <button className="btn btn-primary" onClick={() => navigate("home")}>Back to Home</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="auth-outer fade-in">
      <div className="auth-glow" />
      <div className="auth-card">
        <button className="logo-mark" onClick={() => navigate("home")}>⚡ SplitPass</button>
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-sub">Join thousands saving on subscriptions</p>

        {/* Role selector */}
        <div className="role-tabs">
          <button
            className={`role-tab ${form.role==="customer"?"active":""}`}
            type="button"
            onClick={() => setForm(f => ({ ...f, role:"customer" }))}>
            <span>👤</span> Customer
            <small>Join existing groups</small>
          </button>
          <button
            className={`role-tab ${form.role==="moderator"?"active":""}`}
            type="button"
            onClick={() => setForm(f => ({ ...f, role:"moderator" }))}>
            <span>🛡️</span> Group Moderator
            <small>Create &amp; manage groups</small>
          </button>
        </div>

        {form.role === "moderator" && (
          <div className="info-box" style={{ marginBottom:16 }}>
            <strong>🔍 Requires Admin Approval</strong><br/>
            Moderator accounts are reviewed by our super-admin before activation. You'll receive confirmation once approved.
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Full Name</label>
            <input required value={form.name} onChange={set("name")} placeholder="Jane Doe" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input required type="email" value={form.email} onChange={set("email")} placeholder="jane@email.com" />
            </div>
            <div className="form-group">
              <label>Phone (optional)</label>
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="+254 7XX XXX XXX" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Password</label>
              <div className="pw-wrap">
                <input
                  required type={showPw?"text":"password"}
                  value={form.password} onChange={set("password")}
                  placeholder="Min. 8 characters" />
                <button type="button" className="pw-eye" onClick={() => setShowPw(v=>!v)}>
                  {showPw?"🙈":"👁️"}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                required type={showPw?"text":"password"}
                value={form.confirm} onChange={set("confirm")}
                placeholder="Repeat password" />
            </div>
          </div>

          {/* Newsletter checkbox — pre-checked */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.newsletter}
              onChange={toggle("newsletter")}
              className="checkbox-input"
            />
            <span className="checkbox-box">{form.newsletter && <span className="checkbox-tick">✓</span>}</span>
            <span className="checkbox-label">
              📧 Subscribe to the SplitPass newsletter — get notified about new groups, deals, and platform updates.
              <span className="checkbox-note"> You can unsubscribe anytime.</span>
            </span>
          </label>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>
            {busy
              ? <><span className="spinner"/> Creating…</>
              : form.role==="moderator"
                ? "Submit Moderator Application"
                : "Create Account →"
            }
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <button className="link-btn" onClick={() => navigate("login")}>Log In</button>
        </p>
      </div>
    </div>
  );
}
