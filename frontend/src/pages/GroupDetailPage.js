import React, { useEffect, useState } from "react";
import { api } from "../api";
import "./GroupDetailPage.css";

export default function GroupDetailPage({ id, navigate }) {
  const [group, setGroup]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showJoin, setShowJoin]   = useState(false);
  const [joinForm, setJoinForm]   = useState({ name: "", email: "" });
  const [busy, setBusy]           = useState(false);
  const [payingId, setPayingId]   = useState(null); // which member is initiating payment
  const [msg, setMsg]             = useState(null);

  const reload = () => api.getGroup(id).then(setGroup).catch(() => navigate("groups"));

  useEffect(() => { reload().finally(() => setLoading(false)); }, [id]);

  async function handleJoin(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.joinGroup(id, joinForm);
      setMsg({ type: "ok", text: "You've joined! Now pay your share below to confirm your slot." });
      setShowJoin(false);
      setJoinForm({ name: "", email: "" });
      reload();
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally { setBusy(false); }
  }

  async function handlePesapalPay(member) {
    setPayingId(member.id);
    try {
      const res = await api.initiatePesapal({
        groupId: id,
        memberId: member.id,
        currency: "KES",
      });
      // Redirect to PesaPal checkout in same tab
      window.location.href = res.redirectUrl;
    } catch (err) {
      setMsg({ type: "err", text: err.message });
      setPayingId(null);
    }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;
  if (!group)  return null;

  const filled = group.members?.length || 0;
  const pct    = Math.round((filled / group.maxSlots) * 100);

  return (
    <div className="gd fade-in">
      <button className="btn btn-outline btn-sm" onClick={() => navigate("groups")} style={{ marginBottom: 20 }}>
        ← Back to Groups
      </button>

      {msg && (
        <div className={`msg-box ${msg.type === "ok" ? "msg-ok" : "msg-err"}`} onClick={() => setMsg(null)}>
          {msg.text} <span style={{ opacity: .5 }}>✕</span>
        </div>
      )}

      {/* Header card */}
      <div className="gd-header card">
        <div className="gd-hero">
          <span className="gd-icon">{group.serviceIcon}</span>
          <div>
            <h1 className="gd-title">{group.serviceName} — {group.planName}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span className={`tag tag-${group.status}`}>
                {group.status === "open" ? "● Open" : group.status === "full" ? "● Full" : "Closed"}
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                Created {new Date(group.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          {group.status === "open" && (
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowJoin(true)}>
              Join Group
            </button>
          )}
        </div>

        {group.description && <p className="gd-desc">{group.description}</p>}

        {/* Fee breakdown banner */}
        <div className="fee-banner">
          <div className="fee-item">
            <span className="fee-label">Subscription share</span>
            <span className="fee-val">${group.pricePerSlot}/mo</span>
          </div>
          <div className="fee-plus">+</div>
          <div className="fee-item">
            <span className="fee-label">Platform fee ({group.feePercent}%)</span>
            <span className="fee-val fee-small">+${group.platformFee}</span>
          </div>
          <div className="fee-equals">=</div>
          <div className="fee-item fee-total">
            <span className="fee-label">You pay via PesaPal</span>
            <span className="fee-val fee-highlight">${group.memberPays}/mo</span>
          </div>
        </div>

        <div className="gd-stats">
          <div className="gd-stat">
            <div className="gd-stat-val">${group.pricePerSlot}<span>/mo</span></div>
            <div className="gd-stat-lbl">Share Amount</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">${group.memberPays}<span>/mo</span></div>
            <div className="gd-stat-lbl">You Pay (incl. fee)</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">${(group.totalPrice - group.pricePerSlot).toFixed(2)}<span>/mo</span></div>
            <div className="gd-stat-lbl">You Save</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">{filled}<span>/{group.maxSlots}</span></div>
            <div className="gd-stat-lbl">Members</div>
          </div>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
          <span>{filled} / {group.maxSlots} slots filled</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Two column */}
      <div className="gd-cols">
        {/* Members + Pay buttons */}
        <div className="card">
          <h2 className="section-h2">Members & Payments</h2>
          {group.members?.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No members yet.</p>
          ) : group.members.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-avatar">{m.name[0].toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">
                  {m.name}
                  {m.role === "organizer" && <span className="organizer-badge">Organizer</span>}
                </div>
                <div className="member-email">{m.email}</div>
              </div>
              <span className={`tag tag-${m.paymentStatus}`}>{m.paymentStatus}</span>
              {m.role !== "organizer" && m.paymentStatus === "pending" && (
                <button
                  className="btn btn-sm pesapal-btn"
                  onClick={() => handlePesapalPay(m)}
                  disabled={payingId === m.id}
                  title="Pay via PesaPal (M-Pesa, Card, etc.)"
                >
                  {payingId === m.id
                    ? <><span className="spinner" /> Redirecting…</>
                    : <>🔒 Pay via PesaPal</>
                  }
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h2 className="section-h2">Organizer</h2>
            <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{group.organizerName}</p>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{group.organizerEmail}</p>
          </div>

          <div className="pesapal-info-card">
            <div className="pesapal-logo">🔒 Secured by PesaPal</div>
            <p>Payments are processed securely via PesaPal. Accepted methods:</p>
            <div className="payment-methods">
              <span>📱 M-Pesa</span>
              <span>💳 Visa/Mastercard</span>
              <span>🏦 Bank Transfer</span>
              <span>📲 Airtel Money</span>
            </div>
            <p className="fee-note">
              A {group.feePercent}% platform fee (${group.platformFee}) is added to cover hosting and operations.
              Your organizer receives ${group.pricePerSlot}/mo directly.
            </p>
          </div>

          <div className="card">
            <h2 className="section-h2">Payment Log</h2>
            {group.payments?.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No payments confirmed yet.</p>
            ) : group.payments.map(p => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{p.memberName}</span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>${p.amount} via {p.method}</span>
                </div>
                {p.platformFee && (
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                    Platform fee: ${p.platformFee} · Organizer gets: ${p.organizerGets}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Join Modal */}
      {showJoin && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowJoin(false)}>
          <div className="modal">
            <h3>Join {group.serviceName} Group</h3>
            <div className="info-box" style={{ marginBottom: 16 }}>
              You'll pay <strong>${group.memberPays}/month</strong> via PesaPal
              (${group.pricePerSlot} share + ${group.platformFee} platform fee).
              The organizer shares your account slot after payment clears.
            </div>
            <form onSubmit={handleJoin}>
              <div className="form-group">
                <label>Your Name</label>
                <input required value={joinForm.name} onChange={e => setJoinForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="form-group">
                <label>Your Email</label>
                <input required type="email" value={joinForm.email} onChange={e => setJoinForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <><span className="spinner" /> Joining…</> : "Join & Pay Later"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
