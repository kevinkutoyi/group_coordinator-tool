import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import { kes, useKesRate } from "../currency";
import "./ModeratorSettingsPage.css";

export default function ModeratorSettingsPage({ navigate }) {
  useKesRate(); // loads the platform's live USD→KES rate once, re-renders when it arrives
  const [settings, setSettings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({
    pesapalEmail: "", displayName: "",
    payoutMethod: "mobile_money", payoutName: "", payoutPhone: "",
    payoutBankCode: "", payoutBankName: "", payoutAccountNumber: "",
  });
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);

  useEffect(() => {
    if (!session.isModerator()) { navigate("login"); return; }
    Promise.all([api.getModeratorSettings(), api.getModeratorDashboard()])
      .then(([s, d]) => {
        setSettings(s);
        setDashboard(d);
        if (s.configured) {
          setForm(f => ({
            ...f,
            pesapalEmail: s.pesapalEmail || "", displayName: s.displayName || "",
            payoutMethod: s.payoutMethod || "mobile_money",
            payoutName: s.payoutName || "", payoutPhone: s.payoutPhone || "",
            payoutBankCode: s.payoutBankCode || "", payoutBankName: s.payoutBankName || "",
            payoutAccountNumber: s.payoutAccountNumber || "",
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setBanksLoading(true);
    api.getPaystackBanks(form.payoutMethod === "mobile_money" ? "mobile_money" : undefined)
      .then(setBanks)
      .catch(() => setBanks([]))
      .finally(() => setBanksLoading(false));
  }, [form.payoutMethod]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function setBankCode(e) {
    const code = e.target.value;
    const bank = banks.find(b => b.code === code);
    setForm(f => ({ ...f, payoutBankCode: code, payoutBankName: bank?.name || "" }));
  }

  async function handleSave(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const saved = await api.saveModeratorSettings(form);
      setSettings(saved);
      setMsg({ type: "ok", text: saved.paystackRecipientCode ? "✅ Settings saved! Your payout account is registered." : "✅ Settings saved." });
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;

  const sum = dashboard?.summary || {};
  // Always use the live platform fee from /moderator/dashboard (getPlatformFeePercent()),
  // never settings.feePercent — that's a snapshot frozen on the moderator's row at their
  // last Settings save, which drifts from the real rate whenever the admin changes it.
  const feePercent = sum.feePercent ?? 8;
  const modKeeps   = +(100 - feePercent).toFixed(1);

  return (
    <div className="mss-page fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("mod-dash")}>← Dashboard</button>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>⚙️ Moderator Settings</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 4 }}>
            Set up your payout account to receive your earnings
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

          {/* Contact email */}
          <div className="mss-section-header">
            <div className="mss-section-icon">💸</div>
            <div>
              <div className="mss-section-title">Payout Account</div>
              <div className="mss-section-sub">
                Set up your payout details to receive earnings from the admin
              </div>
            </div>
            {settings?.configured && (
              <span className="mss-connected-badge">✓ Registered</span>
            )}
          </div>

          <label className="form-label">Contact Email <span style={{ color: "var(--error)" }}>*</span></label>
          <input
            type="email"
            className="form-input"
            value={form.pesapalEmail}
            onChange={set("pesapalEmail")}
            placeholder="you@example.com"
            required
          />
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4, marginBottom: 14 }}>
            We'll use this to reach you about your payouts.
          </p>

          <label className="form-label">Display Name (optional)</label>
          <input
            className="form-input"
            value={form.displayName}
            onChange={set("displayName")}
            placeholder="e.g. John's Groups"
            style={{ marginBottom: 20 }}
          />

          {/* Payout method */}
          <label className="form-label">Payout Method <span style={{ color: "var(--error)" }}>*</span></label>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <button type="button"
              className={`btn btn-sm ${form.payoutMethod === "mobile_money" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setForm(f => ({ ...f, payoutMethod: "mobile_money", payoutBankCode: "", payoutBankName: "" }))}>
              📱 M-Pesa
            </button>
            <button type="button"
              className={`btn btn-sm ${form.payoutMethod === "bank" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setForm(f => ({ ...f, payoutMethod: "bank", payoutBankCode: "", payoutBankName: "" }))}>
              🏦 Bank Account
            </button>
          </div>

          <label className="form-label">Account Holder Name <span style={{ color: "var(--error)" }}>*</span></label>
          <input
            className="form-input"
            value={form.payoutName}
            onChange={set("payoutName")}
            placeholder="Full name as registered with M-Pesa/bank"
            style={{ marginBottom: 14 }}
          />

          {form.payoutMethod === "mobile_money" ? (
            <>
              <label className="form-label">M-Pesa Provider <span style={{ color: "var(--error)" }}>*</span></label>
              <select className="form-input" value={form.payoutBankCode} onChange={setBankCode} style={{ marginBottom: 14 }}>
                <option value="">{banksLoading ? "Loading…" : "Select provider"}</option>
                {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>

              <label className="form-label">M-Pesa Phone Number <span style={{ color: "var(--error)" }}>*</span></label>
              <input
                className="form-input"
                value={form.payoutPhone}
                onChange={set("payoutPhone")}
                placeholder="e.g. 0712345678"
                style={{ marginBottom: 14 }}
              />
            </>
          ) : (
            <>
              <label className="form-label">Bank <span style={{ color: "var(--error)" }}>*</span></label>
              <select className="form-input" value={form.payoutBankCode} onChange={setBankCode} style={{ marginBottom: 14 }}>
                <option value="">{banksLoading ? "Loading…" : "Select bank"}</option>
                {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>

              <label className="form-label">Account Number <span style={{ color: "var(--error)" }}>*</span></label>
              <input
                className="form-input"
                value={form.payoutAccountNumber}
                onChange={set("payoutAccountNumber")}
                placeholder="Your bank account number"
                style={{ marginBottom: 14 }}
              />
            </>
          )}

          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4, marginBottom: 20 }}>
            These details are verified automatically so the admin can send payouts to you with one click.
          </p>

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
              All member payments go to the platform's account.
              The admin reviews the payout queue and sends your accumulated earnings directly to your M-Pesa or bank account above.
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
                  <span>KES {kes(sum.totalCollected)} · ${(sum.totalCollected ?? 0).toFixed(2)}</span>
                </div>
                <div className="mss-split-row">
                  <span>Platform fees deducted</span>
                  <span style={{ color: "var(--error)" }}>
                    − KES {kes((sum.totalCollected ?? 0) - (sum.totalOwed ?? 0))} · ${((sum.totalCollected ?? 0) - (sum.totalOwed ?? 0)).toFixed(2)}
                  </span>
                </div>
                <div className="mss-split-row">
                  <span>Total earned (lifetime)</span>
                  <span>KES {kes(sum.totalOwed)} · ${(sum.totalOwed ?? 0).toFixed(2)}</span>
                </div>
                <div className="mss-split-row">
                  <span>Already paid out</span>
                  <span style={{ color: "var(--success)" }}>KES {kes(sum.totalPaid)} · ${(sum.totalPaid ?? 0).toFixed(2)}</span>
                </div>
                {/* Still-unpaid balance — same figure as the admin's Reports →
                    Pending Payouts "Amount Owed" column, so it reads zero once
                    you've been paid instead of a lifetime total that never resets. */}
                <div className="mss-split-row mss-split-total">
                  <span>Amount owed to you</span>
                  <span style={{ color: "var(--accent)" }}>
                    KES {kes(sum.totalPending)} · ${(sum.totalPending ?? 0).toFixed(2)}
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
                        <div style={{ fontWeight: 600 }}>KES {kes(p.amountPaid)} · ${(p.amountPaid || 0).toFixed(2)}</div>
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
