import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import "./ModeratorSettingsPage.css";

export default function ModeratorSettingsPage({ navigate }) {
  const [settings, setSettings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ pesapalEmail: "", displayName: "" });
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);

  useEffect(() => {
    if (!session.isModerator()) { navigate("login"); return; }
    Promise.all([api.getModeratorSettings(), api.getModeratorDashboard()])
      .then(([s, d]) => {
        setSettings(s);
        setDashboard(d);
        if (s.configured) {
          setForm({ pesapalEmail: s.pesapalEmail || "", displayName: s.displayName || "" });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const saved = await api.saveModeratorSettings(form);
      setSettings(saved);
      setMsg({ type: "ok", text: "✅ Settings saved! Your PesaPal email is registered for Sunday payouts." });
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;

  const sum = dashboard?.summary || {};
  const feePercent = settings?.feePercent ?? sum.feePercent ?? 8;
  const modKeeps   = +(100 - feePercent).toFixed(1);

  return (
    <div className="mss-page fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("mod-dash")}>← Dashboard</button>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>⚙️ Moderator Settings</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 4 }}>
            Register your PesaPal email to receive your Sunday payout
          </p>
        </div>
      </div>

      {msg && (
        <div className={`msg-box ${msg.type === "ok" ? "msg-ok" : "msg-err"}`}
          onClick={() => setMsg(null)} style={{ marginBottom: 16 }}>
          {msg.text} <span style={{ opacity: .4 }}>✕</span>
        </div>
      )}

      <div className="mss-layout">
        {/* ── Left: form ── */}
        <form className="card mss-form" onSubmit={handleSave}>

          {/* PesaPal payout email */}
          <div className="mss-section-header">
            <div className="mss-section-icon">💸</div>
            <div>
              <div className="mss-section-title">Payout Account</div>
              <div className="mss-section-sub">
                The PesaPal-registered email where you receive your earnings every Sunday
              </div>
            </div>
            {settings?.configured && (
              <span className="mss-connected-badge">✓ Registered</span>
            )}
          </div>

          <label className="form-label">PesaPal Email <span style={{ color: "var(--error)" }}>*</span></label>
          <input
            type="email"
            className="form-input"
            value={form.pesapalEmail}
            onChange={set("pesapalEmail")}
            placeholder="yourname@pesapal.com"
            required
          />
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4, marginBottom: 14 }}>
            This must be the email linked to your PesaPal account. The super admin
            sends your payout to this address every Sunday.
          </p>

          <label className="form-label">Display Name (optional)</label>
          <input
            className="form-input"
            value={form.displayName}
            onChange={set("displayName")}
            placeholder="e.g. John's Groups"
            style={{ marginBottom: 20 }}
          />

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : settings?.configured ? "Update Settings" : "Save Settings"}
          </button>
        </form>

        {/* ── Right: earnings summary + fee info ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* How payouts work */}
          <div className="card">
            <div className="mss-section-header" style={{ marginBottom: 12 }}>
              <div className="mss-section-icon">📋</div>
              <div>
                <div className="mss-section-title">How Payouts Work</div>
              </div>
            </div>
            <div className="mss-split-preview" style={{ marginBottom: 0 }}>
              <div className="mss-split-title">Revenue split per payment</div>
              <div className="mss-split-row">
                <span>Member pays</span>
                <span>100%</span>
              </div>
              <div className="mss-split-row">
                <span>Platform fee</span>
                <span style={{ color: "var(--error)" }}>− {feePercent}%</span>
              </div>
              <div className="mss-split-row mss-split-total">
                <span>Your earnings</span>
                <span style={{ color: "var(--success)" }}>{modKeeps}%</span>
              </div>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>
              All member payments go to the platform's PesaPal account.
              Every Sunday the super admin reviews the queue and sends your accumulated earnings to your PesaPal email above.
            </p>
          </div>

          {/* Earnings snapshot */}
          {dashboard && (
            <div className="card">
              <div className="mss-section-header" style={{ marginBottom: 12 }}>
                <div className="mss-section-icon">💰</div>
                <div><div className="mss-section-title">Your Earnings</div></div>
              </div>
              <div className="mss-split-preview" style={{ marginBottom: 0 }}>
                <div className="mss-split-row">
                  <span>Total collected from members</span>
                  <span>KES {sum.totalCollected?.toFixed(2) ?? "0.00"}</span>
                </div>
                <div className="mss-split-row">
                  <span>Platform fees deducted</span>
                  <span style={{ color: "var(--error)" }}>
                    − KES {(sum.totalCollected - sum.totalOwed)?.toFixed(2) ?? "0.00"}
                  </span>
                </div>
                <div className="mss-split-row">
                  <span>Total owed to you</span>
                  <span>KES {sum.totalOwed?.toFixed(2) ?? "0.00"}</span>
                </div>
                <div className="mss-split-row">
                  <span>Already paid out</span>
                  <span style={{ color: "var(--success)" }}>KES {sum.totalPaid?.toFixed(2) ?? "0.00"}</span>
                </div>
                <div className="mss-split-row mss-split-total">
                  <span>Pending next payout</span>
                  <span style={{ color: "var(--accent)" }}>
                    KES {sum.totalPending?.toFixed(2) ?? "0.00"}
                  </span>
                </div>
              </div>

              {/* Recent payout history */}
              {dashboard.payoutHistory?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 8, color: "var(--muted)" }}>
                    RECENT PAYOUTS
                  </div>
                  {dashboard.payoutHistory.map(p => (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 0", borderBottom: "1px solid var(--border)",
                      fontSize: "0.8rem",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.currency} {p.amountPaid?.toFixed(2)}</div>
                        <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                          {new Date(p.paidAt).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <span style={{
                        padding: "3px 10px", borderRadius: 99,
                        background: "rgba(74,222,128,0.1)", color: "var(--success)",
                        border: "1px solid rgba(74,222,128,0.2)", fontSize: "0.72rem", fontWeight: 600,
                      }}>Paid ✓</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
