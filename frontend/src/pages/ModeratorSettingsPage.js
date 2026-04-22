import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import "./ModeratorSettingsPage.css";

export default function ModeratorSettingsPage({ navigate }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({
    pesapalConsumerKey: "", pesapalConsumerSecret: "",
    pesapalEnv: "sandbox", profitPercent: 9, payoutEmail: "",
  });
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const PLATFORM_CUT = 33; // matches backend default

  useEffect(() => {
    if (!session.isModerator()) { navigate("login"); return; }
    api.getModeratorSettings()
      .then(s => {
        setSettings(s);
        if (s.configured) {
          setForm(f => ({
            ...f,
            pesapalConsumerKey: s.pesapalConsumerKey || "",
            pesapalEnv:         s.pesapalEnv || "sandbox",
            profitPercent:      s.profitPercent || 9,
            payoutEmail:        s.payoutEmail || "",
            // don't prefill secret — user must re-enter
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === "number" ? +e.target.value : e.target.value }));

  // Live split preview
  const profit    = +form.profitPercent || 0;
  const platTake  = +((profit * PLATFORM_CUT) / 100).toFixed(2);
  const youKeep   = +(profit - platTake).toFixed(2);

  async function handleSave(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const saved = await api.saveModeratorSettings(form);
      setSettings(saved);
      setMsg({ type:"ok", text:"Settings saved successfully! Your PesaPal account is connected." });
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(false); }
  }

  if (loading) return <div style={{ textAlign:"center", padding:80 }}><span className="spinner"/></div>;

  return (
    <div className="mss-page fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("mod-dash")}>← Dashboard</button>
        <div>
          <h1 className="page-title" style={{ marginBottom:0 }}>⚙️ Moderator Settings</h1>
          <p style={{ color:"var(--muted)", fontSize:"0.82rem", marginTop:4 }}>Connect your PesaPal account and set your earnings percentage</p>
        </div>
      </div>

      {msg && (
        <div className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`} onClick={() => setMsg(null)} style={{ marginBottom:16 }}>
          {msg.text} <span style={{ opacity:.4 }}>✕</span>
        </div>
      )}

      <div className="mss-layout">
        <form className="card mss-form" onSubmit={handleSave}>

          {/* PesaPal section */}
          <div className="mss-section-header">
            <div className="mss-section-icon">🔗</div>
            <div>
              <div className="mss-section-title">PesaPal Account</div>
              <div className="mss-section-sub">Your personal PesaPal API credentials for receiving payments</div>
            </div>
            {settings?.configured && <span className="mss-connected-badge">✅ Connected</span>}
          </div>

          <div className="form-group">
            <label>Consumer Key</label>
            <input required value={form.pesapalConsumerKey} onChange={set("pesapalConsumerKey")}
              placeholder="Your PesaPal consumer key" autoComplete="off" />
          </div>

          <div className="form-group">
            <label>Consumer Secret</label>
            <div className="pw-wrap">
              <input required={!settings?.configured} type={showSecret ? "text" : "password"}
                value={form.pesapalConsumerSecret} onChange={set("pesapalConsumerSecret")}
                placeholder={settings?.configured ? "Re-enter to update secret" : "Your PesaPal consumer secret"}
                autoComplete="new-password" />
              <button type="button" className="pw-eye" onClick={() => setShowSecret(v => !v)}>
                {showSecret ? "🙈" : "👁️"}
              </button>
            </div>
            {settings?.configured && (
              <small style={{ color:"var(--muted)", fontSize:"0.72rem" }}>
                Secret is saved. Leave blank to keep existing secret.
              </small>
            )}
          </div>

          <div className="form-group">
            <label>PesaPal Environment</label>
            <select value={form.pesapalEnv} onChange={set("pesapalEnv")}>
              <option value="sandbox">Sandbox (testing)</option>
              <option value="live">Live (production)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Payout Email</label>
            <input type="email" value={form.payoutEmail} onChange={set("payoutEmail")}
              placeholder="email@example.com — where payment notifications go" />
          </div>

          {/* Profit section */}
          <div className="mss-section-header" style={{ marginTop:8 }}>
            <div className="mss-section-icon">💰</div>
            <div>
              <div className="mss-section-title">Profit Percentage</div>
              <div className="mss-section-sub">Your cut from what members pay. A portion of this automatically goes to SplitPass.</div>
            </div>
          </div>

          <div className="form-group">
            <label>Your Profit % (from gross member payments)</label>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <input type="range" min={1} max={50} step={0.5}
                value={form.profitPercent} onChange={set("profitPercent")}
                style={{ flex:1, accentColor:"var(--accent)" }} />
              <div className="mss-percent-badge">{form.profitPercent}%</div>
            </div>
          </div>

          {/* Split preview */}
          <div className="mss-split-preview">
            <div className="mss-split-title">💡 Earnings Split Preview</div>
            <div className="mss-split-row">
              <span>Member pays (example for $10)</span>
              <span>$10.00</span>
            </div>
            <div className="mss-split-row">
              <span>Your profit ({profit}%)</span>
              <span style={{ color:"var(--accent3)" }}>+${(10 * profit / 100).toFixed(2)}</span>
            </div>
            <div className="mss-split-row">
              <span>SplitPass platform cut ({PLATFORM_CUT}% of your profit → automatic)</span>
              <span style={{ color:"var(--muted)" }}>−${(10 * platTake / 100).toFixed(2)}</span>
            </div>
            <div className="mss-split-row mss-split-total">
              <span>You keep ({youKeep}%)</span>
              <span style={{ color:"var(--success)" }}>${(10 * youKeep / 100).toFixed(2)}</span>
            </div>
            <p style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:8 }}>
              On every $10 collected: ${(10*platTake/100).toFixed(2)} goes to SplitPass automatically,
              you receive ${(10*youKeep/100).toFixed(2)}.
            </p>
          </div>

          {!form.pesapalConsumerKey && (
            <div className="info-box" style={{ marginBottom:8, fontSize:"0.8rem" }}>
              Get your API keys at <a href="https://developer.pesapal.com" target="_blank" rel="noreferrer">developer.pesapal.com</a> → Register Merchant → API Keys.
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width:"100%", marginTop:8 }} disabled={busy}>
            {busy ? <><span className="spinner"/> Saving…</> : "💾 Save Settings"}
          </button>
        </form>

        {/* Info sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div className="card">
            <h2 className="section-h2" style={{ marginBottom:12 }}>How earnings work</h2>
            <div style={{ fontSize:"0.82rem", color:"var(--muted)", lineHeight:1.7 }}>
              <p>1. A member pays $10 to join your group</p>
              <p>2. You earn {form.profitPercent}% = ${(10*profit/100).toFixed(2)} profit</p>
              <p>3. SplitPass automatically takes {PLATFORM_CUT}% of that = ${(10*platTake/100).toFixed(2)}</p>
              <p>4. You receive ${(10*youKeep/100).toFixed(2)} via your PesaPal account</p>
            </div>
          </div>

          <div className="card">
            <h2 className="section-h2" style={{ marginBottom:12 }}>Account Status</h2>
            <div style={{ fontSize:"0.84rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ color:"var(--muted)" }}>Account</span>
                <span style={{ color:"var(--success)", fontWeight:600 }}>✅ Approved</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ color:"var(--muted)" }}>PesaPal</span>
                <span style={{ fontWeight:600, color: settings?.configured ? "var(--success)" : "var(--warning)" }}>
                  {settings?.configured ? "✅ Connected" : "⚠️ Not connected"}
                </span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                <span style={{ color:"var(--muted)" }}>Profit rate</span>
                <span style={{ fontWeight:600 }}>{settings?.profitPercent || "Not set"}%</span>
              </div>
            </div>
          </div>

          <div className="info-box">
            <strong>⚠️ Group Review Required</strong><br/>
            Every group you create is reviewed by the super admin before going public.
            You'll be notified by email once approved or rejected.
          </div>
        </div>
      </div>
    </div>
  );
}
