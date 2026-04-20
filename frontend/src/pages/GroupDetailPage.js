import React, { useEffect, useState } from "react";
import CredentialVault from "../components/CredentialVault";
import { api, session } from "../api";
import "./GroupDetailPage.css";

export default function GroupDetailPage({ id, navigate, user }) {
  const [group, setGroup]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [payingId, setPayingId]   = useState(null);
  const [showCurrency, setCurrency] = useState(null);  // member object awaiting currency pick
  const [kesToUsd, setKesToUsd]     = useState(130);   // fallback rate
  const [msg, setMsg]           = useState(null);

  const reload = () => api.getGroup(id).then(setGroup).catch(() => navigate("groups"));

  useEffect(() => {
    reload().finally(() => setLoading(false));
    api.getCurrencyRate().then(r => setKesToUsd(r.KES_PER_USD)).catch(() => {});
  }, [id]);

  // billingCycle → months (mirrors backend CYCLE_MONTHS map)
  const CYCLE_MONTHS = { monthly:1, quarterly:3, biannually:6, annually:12 };
  const groupMonths = CYCLE_MONTHS[group?.billingCycle] || 1;

  function calcTotal(pricePerSlot, months) {
    const base = +(pricePerSlot * months).toFixed(2);
    const fee  = +(base * (group?.feePercent || 2) / 100).toFixed(2);
    return { base, fee, total: +(base + fee).toFixed(2) };
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!session.isLoggedIn()) { navigate("login"); return; }
    if (!session.isCustomer()) {
      setMsg({ type:"err", text:"Only customers can join groups. Moderators organise them." });
      return;
    }
    setBusy(true);
    try {
      await api.joinGroup(id, {}); // backend determines months from group billingCycle
      setMsg({ type:"ok", text:`Joined! Now pay your ${groupMonths}-month share via PesaPal to confirm your slot.` });
      setShowJoin(false);
      reload();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(false); }
  }

  function handlePay(member) {
    // Show currency picker before redirecting to PesaPal
    setCurrency(member);
  }

  async function handleCurrencyConfirm(member, currency) {
    setCurrency(null);
    setPayingId(member.id);
    try {
      const res = await api.initiatePay({ groupId: id, memberId: member.id, currency });
      window.location.href = res.redirectUrl;
    } catch (err) { setMsg({ type:"err", text: err.message }); setPayingId(null); }
  }

  async function handleStatusChange(newStatus) {
    try {
      await api.updateStatus(id, newStatus);
      setMsg({ type:"ok", text:`Group status changed to "${newStatus}".` });
      reload();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
  }

  if (loading) return <div style={{ textAlign:"center", padding:80 }}><span className="spinner"/></div>;
  if (!group)  return null;

  const currentUserId = session.getUser()?.id;
  const isSuperAdmin  = session.isSuperAdmin();
  const isOrganizer   = group.organizerId === currentUserId;
  const canManage     = isSuperAdmin || isOrganizer;

  // Only paying members (role !== "organizer") count toward slots
  const payingMembers = group.members?.filter(m => m.role !== "organizer") || [];
  const filled        = payingMembers.length;
  const pct           = Math.round((filled / group.maxSlots) * 100);
  const spotsLeft     = group.maxSlots - filled;

  // Check if current user is already a paying member
  const myMember = payingMembers.find(m => m.userId === currentUserId);

  const preview = calcTotal(group.pricePerSlot, groupMonths);

  return (
    <div className="gd fade-in">
      <button className="btn btn-outline btn-sm" onClick={() => navigate("groups")} style={{ marginBottom:20 }}>
        ← Back to Groups
      </button>

      {msg && (
        <div className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`} onClick={() => setMsg(null)} style={{ marginBottom:16 }}>
          {msg.text} <span style={{ opacity:.4 }}>✕</span>
        </div>
      )}

      {/* ── Hero card ── */}
      <div className="gd-header card">
        <div className="gd-hero">
          <span className="gd-icon">{group.serviceIcon}</span>
          <div style={{ flex:1 }}>
            <h1 className="gd-title">{group.serviceName} — {group.planName}</h1>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
              <span className={`tag tag-${group.status}`}>
                {group.status==="open" ? "● Open" : group.status==="full" ? "● Full" : "Closed"}
              </span>
              <span style={{ fontSize:"0.78rem", color:"var(--muted)" }}>
                Created {new Date(group.createdAt).toLocaleDateString()}
              </span>
              {group.billingCycle && (
                <span className="tag" style={{ background:"var(--bg3)", color:"var(--muted)", border:"1px solid var(--border)" }}>
                  🔄 {group.billingCycle}
                </span>
              )}
              {isSuperAdmin && (
                <span className="tag" style={{ background:"rgba(255,106,142,0.12)", color:"var(--accent2)", border:"none" }}>
                  🛡️ Admin View
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            {/* Customer: join if open, not already a member, not the organizer */}
            {group.status === "open" && !myMember && session.isCustomer() && !isOrganizer && (
              <button className="btn btn-primary" onClick={() => setShowJoin(true)}>Join Group</button>
            )}
            {/* Guest */}
            {group.status === "open" && !session.isLoggedIn() && (
              <button className="btn btn-primary" onClick={() => navigate("login")}>Sign In to Join</button>
            )}
            {/* Organizer badge */}
            {isOrganizer && (
              <span className="tag" style={{ background:"rgba(124,106,255,0.15)", color:"var(--accent)", border:"1px solid rgba(124,106,255,0.2)", padding:"5px 12px" }}>
                🛡️ You are the organizer
              </span>
            )}
            {myMember && <span className="tag tag-open">✓ You're a member</span>}
            {/* Email management button — organizer & superadmin */}
            {canManage && (
              <button className="btn btn-sm btn-outline" onClick={() => navigate("group-emails", id)}
                style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}>
                📧 Group Emails
              </button>
            )}
            {/* Organizer/superadmin: status controls */}
            {canManage && (
              <div className="manage-controls">
                {group.status !== "open"   && <button className="btn btn-sm btn-outline" onClick={() => handleStatusChange("open")}>🔓 Reopen</button>}
                {group.status === "open"   && <button className="btn btn-sm btn-outline" onClick={() => handleStatusChange("closed")}>🔒 Close</button>}
                {group.status !== "closed" && <button className="btn btn-sm btn-danger"  onClick={() => { if (window.confirm("Close this group permanently?")) handleStatusChange("closed"); }}>⛔ Close Permanently</button>}
              </div>
            )}
          </div>
        </div>

        {group.description && <p className="gd-desc">{group.description}</p>}

        {/* Fee banner */}
        <div className="fee-banner">
          <div className="fee-item">
            <span className="fee-label">Monthly share per member</span>
            <span className="fee-val">${group.pricePerSlot}</span>
          </div>
          <div className="fee-plus">+</div>
          <div className="fee-item">
            <span className="fee-label">Platform fee ({group.feePercent}%)</span>
            <span className="fee-val fee-small">+${group.platformFee}</span>
          </div>
          <div className="fee-equals">=</div>
          <div className="fee-item fee-total">
            <span className="fee-label">Members pay/month</span>
            <span className="fee-val fee-highlight">${group.memberPays}</span>
          </div>
        </div>

        {/* Billing cycle — locked, set by organizer, prominently displayed */}
        <div className="gd-billing-cycle-bar">
          <span className="gdb-icon">🔄</span>
          <div>
            <span className="gdb-label">Billing Cycle</span>
            <span className="gdb-value">{group.billingCycle?.charAt(0).toUpperCase() + group.billingCycle?.slice(1) || "Monthly"}</span>
          </div>
          <span className="gdb-note">Set by the organizer — all members pay on this schedule</span>
        </div>

        {/* Stats */}
        <div className="gd-stats">
          <div className="gd-stat"><div className="gd-stat-val">${group.pricePerSlot}<span>/mo</span></div><div className="gd-stat-lbl">Share per Slot</div></div>
          <div className="gd-stat"><div className="gd-stat-val">${group.memberPays}<span>/mo</span></div><div className="gd-stat-lbl">Members Pay</div></div>
          <div className="gd-stat"><div className="gd-stat-val">${(group.totalPrice - group.pricePerSlot).toFixed(2)}<span>/mo</span></div><div className="gd-stat-lbl">Savings/member</div></div>
          <div className="gd-stat">
            <div className="gd-stat-val">{filled}<span>/{group.maxSlots}</span></div>
            <div className="gd-stat-lbl">Paying Slots Filled</div>
          </div>
        </div>

        <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%` }}/></div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.78rem", color:"var(--muted)", marginTop:4 }}>
          <span>{filled}/{group.maxSlots} paying slots filled · {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft > 1?"s":""} left` : "Full"}</span>
          <span>{pct}%</span>
        </div>

        {/* Organizer info bar */}
        <div className="organizer-bar">
          <span className="ob-label">🛡️ Coordinator</span>
          <span className="ob-name">{group.organizerName}</span>
          <span className="ob-note">Organizer holds the plan &amp; does not occupy a slot</span>
        </div>
      </div>

      {/* ── Two columns ── */}
      <div className="gd-cols">

        {/* Paying members list */}
        <div className="card">
          <h2 className="section-h2">Paying Members</h2>

          {payingMembers.length === 0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"var(--muted)", fontSize:"0.85rem" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>👥</div>
              No paying members yet. Be the first to join!
            </div>
          ) : payingMembers.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-avatar">{m.name?.[0]?.toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">{m.name}</div>
                {/* Show email to organizer/superadmin only */}
                {canManage && <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{m.email}</div>}
                {m.durationLabel && <div style={{ fontSize:"0.72rem", color:"var(--accent)", marginTop:1 }}>📅 {m.durationLabel}</div>}
                {m.expiresAt && <div style={{ fontSize:"0.7rem", color:"var(--muted)" }}>Expires {new Date(m.expiresAt).toLocaleDateString()}</div>}
              </div>
              <span className={`tag tag-${m.paymentStatus}`}>{m.paymentStatus}</span>
              {/* Pay button — only for this member themselves */}
              {m.userId === currentUserId && m.paymentStatus === "pending" && (
                <button className="btn btn-sm pesapal-btn" onClick={() => handlePay(m)} disabled={payingId === m.id}>
                  {payingId === m.id ? <><span className="spinner"/> Redirecting…</> : "🔒 Pay via PesaPal"}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Right sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          <div className="card">
            <h2 className="section-h2">Organizer / Coordinator</h2>
            <p style={{ fontWeight:600, fontSize:"0.9rem" }}>{group.organizerName}</p>
            {isSuperAdmin && <p style={{ fontSize:"0.8rem", color:"var(--muted)" }}>{group.organizerEmail}</p>}
            <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:6, lineHeight:1.5 }}>
              The organizer coordinates the group and purchases the subscription from the provider.
              They collect payments from members and do <strong>not</strong> occupy a paying slot.
            </p>
          </div>

          {/* Super admin stats */}
          {isSuperAdmin && (
            <div className="admin-group-panel">
              <div className="agp-title">🛡️ Admin Overview</div>
              <div className="agp-row"><span>Paying slots filled</span><span style={{ color:"var(--success)" }}>{filled}/{group.maxSlots}</span></div>
              <div className="agp-row"><span>Confirmed payments</span><span style={{ color:"var(--success)" }}>{payingMembers.filter(m=>m.paymentStatus==="confirmed").length}</span></div>
              <div className="agp-row"><span>Pending payments</span><span style={{ color:"var(--warning)" }}>{payingMembers.filter(m=>m.paymentStatus==="pending").length}</span></div>
              <div className="agp-row"><span>Platform revenue</span><span style={{ color:"var(--accent3)" }}>${group.payments?.reduce((acc,p)=>acc+(p.platformFee||0),0).toFixed(2)||"0.00"}</span></div>
              <div className="agp-row"><span>Organizer collects</span><span>${group.payments?.reduce((acc,p)=>acc+(p.organizerGets||0),0).toFixed(2)||"0.00"}</span></div>
              <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
                <button className="btn btn-sm btn-outline" onClick={() => navigate("earnings")}>💰 Earnings</button>
                <button className="btn btn-sm btn-outline" onClick={() => navigate("admin")}>🛡️ Admin</button>
              </div>
            </div>
          )}

          {/* ── Credential Vault ── */}
          <CredentialVault
            groupId={id}
            groupName={`${group.serviceName} ${group.planName}`}
            serviceName={group.serviceName}
            serviceIcon={group.serviceIcon}
            maxSlots={group.maxSlots}
          />

          <div className="pesapal-info-card">
            <div className="pesapal-logo">🔒 Secured by PesaPal</div>
            <p>Accepted: 📱 M-Pesa &nbsp;💳 Visa/Mastercard &nbsp;🏦 Bank Transfer &nbsp;📲 Airtel Money</p>
            <p className="fee-note">
              A {group.feePercent}% platform fee is added. The organizer receives ${group.pricePerSlot}/mo per member to cover the plan cost.
            </p>
          </div>

          <div className="card">
            <h2 className="section-h2">Payment Log</h2>
            {group.payments?.length === 0 ? (
              <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>No confirmed payments yet.</p>
            ) : group.payments.map(p => (
              <div key={p.id} style={{ padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:"0.82rem" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>{p.memberName}</span>
                  <span style={{ color:"var(--success)", fontWeight:600 }}>${p.amount} · {p.months}mo</span>
                </div>
                {p.platformFee && (
                  <div style={{ fontSize:"0.7rem", color:"var(--muted)" }}>
                    Platform: ${p.platformFee} · Organizer gets: ${p.organizerGets}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Join Modal ── */}
      {showJoin && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowJoin(false)}>
          <div className="modal">
            <h3>Join {group.serviceName} Group</h3>
            <p style={{ fontSize:"0.83rem", color:"var(--muted)", marginBottom:16 }}>
              {spotsLeft} slot{spotsLeft !== 1?"s":""} remaining · {group.maxSlots} total paying slots.
            </p>

            {/* Locked billing cycle — set by organizer, not changeable */}
            <div className="locked-cycle-box">
              <div className="lcb-header">
                <span className="lcb-lock">🔒</span>
                <span className="lcb-title">Subscription Billing — Set by Organizer</span>
              </div>
              <div className="lcb-body">
                <div className="lcb-row">
                  <span className="lcb-label">Billing cycle</span>
                  <span className="lcb-val lcb-cycle">{group.billingCycle?.charAt(0).toUpperCase() + group.billingCycle?.slice(1)}</span>
                </div>
                <div className="lcb-row">
                  <span className="lcb-label">Covers</span>
                  <span className="lcb-val">{groupMonths} month{groupMonths > 1 ? "s" : ""} per payment</span>
                </div>
                <div className="lcb-row">
                  <span className="lcb-label">Your share per period</span>
                  <span className="lcb-val">${group.pricePerSlot} × {groupMonths}mo = ${preview.base}</span>
                </div>
              </div>
              <p className="lcb-note">The billing cycle is fixed by the group organizer and cannot be changed.</p>
            </div>

            <div className="dur-summary">
              <div className="dur-sum-row"><span>Subscription ({groupMonths}mo × ${group.pricePerSlot})</span><span>${preview.base}</span></div>
              <div className="dur-sum-row"><span>Platform fee ({group.feePercent}%)</span><span>+${preview.fee}</span></div>
              <div className="dur-sum-row dur-sum-total"><span>Total charged via PesaPal</span><span>${preview.total}</span></div>
            </div>

            <div className="info-box" style={{ marginTop:12, marginBottom:0, fontSize:"0.8rem" }}>
              You'll be redirected to PesaPal to pay <strong>${preview.total}</strong>. Your slot is held for 24 hours pending payment.
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={busy}>
                {busy ? <><span className="spinner"/> Joining…</> : "Confirm & Pay →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Currency picker modal ── */}
      {showCurrency && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCurrency(null)}>
          <div className="modal">
            <h3>Choose Payment Currency</h3>
            <p style={{ fontSize:"0.84rem", color:"var(--muted)", marginBottom:20 }}>
              Select the currency you'd like to pay in. PesaPal accepts both — no conversion needed on your end.
            </p>

            <div className="currency-grid">
              {/* KES option */}
              <button className="currency-card" onClick={() => handleCurrencyConfirm(showCurrency, "KES")}>
                <div className="cc-flag">🇰🇪</div>
                <div className="cc-name">Kenyan Shilling</div>
                <div className="cc-code">KES</div>
                <div className="cc-amount">
                  KES {(group.memberPays * kesToUsd).toFixed(0)}
                </div>
                <div className="cc-methods">M-Pesa · Airtel Money · Bank</div>
              </button>

              {/* USD option */}
              <button className="currency-card" onClick={() => handleCurrencyConfirm(showCurrency, "USD")}>
                <div className="cc-flag">🇺🇸</div>
                <div className="cc-name">US Dollar</div>
                <div className="cc-code">USD</div>
                <div className="cc-amount">
                  USD {group.memberPays}
                </div>
                <div className="cc-methods">Visa · Mastercard · PayPal</div>
              </button>
            </div>

            <div className="info-box" style={{ marginTop:14, marginBottom:0, fontSize:"0.78rem" }}>
              💡 Rate: 1 USD ≈ KES {kesToUsd} (indicative). PesaPal applies the live rate at checkout.
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setCurrency(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
