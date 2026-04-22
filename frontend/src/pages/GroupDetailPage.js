import React, { useEffect, useState, useCallback } from "react";
import CredentialVault from "../components/CredentialVault";
import { api, session } from "../api";
import "./GroupDetailPage.css";

export default function GroupDetailPage({ id, navigate, user }) {
  const [group, setGroup]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showJoin, setShowJoin]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [payingId, setPayingId]   = useState(null);
  const [showCurrency, setCurrency] = useState(null);
  const [kesToUsd, setKesToUsd]   = useState(130);
  const [msg, setMsg]             = useState(null);

  // ── Credential vault state lifted here so reload() doesn't reset it ────
  const [creds, setCreds]         = useState(null);
  const [credsLoading, setCredsLoading] = useState(true);
  const [editing, setEditing]     = useState(false);
  const [editSlots, setEditSlots] = useState([]);
  const [editNote, setEditNote]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null);

  const reload = useCallback(() =>
    api.getGroup(id).then(setGroup).catch(() => navigate("groups")),
  [id, navigate]);

  const loadCreds = useCallback(async () => {
    setCredsLoading(true);
    try {
      const data = await api.getCredentials(id);
      setCreds(data);
    } catch (err) {
      if (err.message?.includes("denied") || err.message?.includes("payment") || err.message?.includes("403")) {
        setCreds({ locked: true });
      } else {
        setCreds(null);
      }
    } finally { setCredsLoading(false); }
  }, [id]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
    loadCreds();
    api.getCurrencyRate().then(r => setKesToUsd(r.KES_PER_USD)).catch(() => {});
  }, [id]);

  const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };
  const groupMonths = CYCLE_MONTHS[group?.billingCycle] || 1;

  // New fee model: memberPays = base (fee comes OUT of it, not added on top)
  function calcMemberPays(pricePerSlot, months) {
    const base = +(pricePerSlot * months).toFixed(2);
    return base; // member pays base; platform takes its cut internally
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!session.isLoggedIn()) { navigate("login"); return; }
    if (!session.isCustomer()) {
      setMsg({ type: "err", text: "Only customers can join groups. Moderators organise them." });
      return;
    }
    setBusy(true);
    try {
      await api.joinGroup(id, {});
      setMsg({ type: "ok", text: `Joined! Now pay your ${groupMonths}-month share via PesaPal to confirm your slot.` });
      setShowJoin(false);
      reload();
    } catch (err) { setMsg({ type: "err", text: err.message }); }
    finally { setBusy(false); }
  }

  async function handleCurrencyConfirm(member, currency) {
    setCurrency(null);
    setPayingId(member.id);
    try {
      const res = await api.initiatePay({ groupId: id, memberId: member.id, currency });
      window.location.href = res.redirectUrl;
    } catch (err) { setMsg({ type: "err", text: err.message }); setPayingId(null); }
  }

  async function handleStatusChange(newStatus) {
    try {
      await api.updateStatus(id, newStatus);
      setMsg({ type: "ok", text: `Group status changed to "${newStatus}".` });
      reload();
    } catch (err) { setMsg({ type: "err", text: err.message }); }
  }

  // ── Credential vault handlers ─────────────────────────────────────────
  function startEdit() {
    const slots = creds?.exists && creds.slots?.length > 0
      ? creds.slots.map(s => ({ label: s.label, username: s.username, password: s.password, note: s.note }))
      : [{ label: "", username: "", password: "", note: "" }];
    setEditSlots(slots);
    setEditNote(creds?.generalNote || "");
    setEditing(true);
    setSaveMsg(null);
  }

  async function handleSave() {
    const filled = editSlots.filter(s => s.username || s.password);
    if (!filled.length) { setSaveMsg({ type: "err", text: "Add at least one slot with credentials." }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      await api.saveCredentials(id, { slots: editSlots, generalNote: editNote });
      setSaveMsg({ type: "ok", text: "Credentials saved! Confirmed members have been notified." });
      setEditing(false);
      loadCreds();
    } catch (err) { setSaveMsg({ type: "err", text: err.message }); }
    finally { setSaving(false); }
  }

  async function handleDeleteCreds() {
    try {
      await api.deleteCredentials(id);
      setCreds({ exists: false, slots: [] });
    } catch (err) { setSaveMsg({ type: "err", text: err.message }); }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;
  if (!group) return null;

  const currentUserId = session.getUser()?.id;
  const isSuperAdmin  = session.isSuperAdmin();
  const isOrganizer   = group.organizerId === currentUserId;
  const canManage     = isSuperAdmin || isOrganizer || session.isModerator();

  const payingMembers = group.members?.filter(m => m.role !== "organizer") || [];
  const filled        = payingMembers.length;
  const pct           = Math.round((filled / group.maxSlots) * 100);
  const spotsLeft     = group.maxSlots - filled;
  const myMember      = payingMembers.find(m => m.userId === currentUserId);

  const feePercent    = group.feePercent || 8;
  const memberPays    = group.pricePerSlot; // fee is deducted from this, not added on top
  const platformFee   = +(memberPays * feePercent / 100).toFixed(2);
  const moderatorGets = +(memberPays - platformFee).toFixed(2);
  const totalForPeriod = +(memberPays * groupMonths).toFixed(2);

  return (
    <div className="gd fade-in">
      <button className="btn btn-outline btn-sm" onClick={() => navigate("groups")} style={{ marginBottom: 20 }}>
        ← Back to Groups
      </button>

      {msg && (
        <div className={`msg-box ${msg.type === "ok" ? "msg-ok" : "msg-err"}`} onClick={() => setMsg(null)} style={{ marginBottom: 16 }}>
          {msg.text} <span style={{ opacity: .4 }}>✕</span>
        </div>
      )}

      {/* ── Hero card ── */}
      <div className="gd-header card">
        <div className="gd-hero">
          <span className="gd-icon">{group.serviceIcon}</span>
          <div style={{ flex: 1 }}>
            <h1 className="gd-title">{group.serviceName} — {group.planName}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span className={`tag tag-${group.status}`}>
                {group.status === "open" ? "● Open" : group.status === "full" ? "● Full" : "Closed"}
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                Created {new Date(group.createdAt).toLocaleDateString()}
              </span>
              {group.billingCycle && (
                <span className="tag" style={{ background: "var(--bg3)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                  🔄 {group.billingCycle}
                </span>
              )}
              {isSuperAdmin && (
                <span className="tag" style={{ background: "rgba(255,106,142,0.12)", color: "var(--accent2)", border: "none" }}>
                  🛡️ Admin View
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {group.status === "open" && !myMember && session.isCustomer() && !isOrganizer && (
              <button className="btn btn-primary" onClick={() => setShowJoin(true)}>Join Group</button>
            )}
            {group.status === "open" && !session.isLoggedIn() && (
              <button className="btn btn-primary" onClick={() => navigate("login")}>Sign In to Join</button>
            )}
            {isOrganizer && (
              <span className="tag" style={{ background: "rgba(124,106,255,0.15)", color: "var(--accent)", border: "1px solid rgba(124,106,255,0.2)", padding: "5px 12px" }}>
                🛡️ You are the organizer
              </span>
            )}
            {myMember && <span className="tag tag-open">✓ You're a member</span>}
            {canManage && (
              <button className="btn btn-sm btn-outline" onClick={() => navigate("group-emails", id)}
                style={{ borderColor: "rgba(124,106,255,0.3)", color: "var(--accent)" }}>
                📧 Group Emails
              </button>
            )}
            {canManage && (
              <div className="manage-controls">
                {group.status !== "open"   && <button className="btn btn-sm btn-outline" onClick={() => handleStatusChange("open")}>🔓 Reopen</button>}
                {group.status === "open"   && <button className="btn btn-sm btn-outline" onClick={() => handleStatusChange("closed")}>🔒 Close</button>}
                {group.status !== "closed" && <button className="btn btn-sm btn-danger" onClick={() => { if (window.confirm("Close this group permanently?")) handleStatusChange("closed"); }}>⛔ Close Permanently</button>}
              </div>
            )}
          </div>
        </div>

        {group.description && <p className="gd-desc">{group.description}</p>}

        {/* Fee banner — corrected: fee is deducted from price, not added on top */}
        <div className="fee-banner">
          <div className="fee-item">
            <span className="fee-label">Monthly share per member</span>
            <span className="fee-val">${group.pricePerSlot}</span>
          </div>
          <div className="fee-plus" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>of which</div>
          <div className="fee-item">
            <span className="fee-label">Platform fee ({feePercent}%)</span>
            <span className="fee-val fee-small" style={{ color: "var(--muted)" }}>${platformFee}</span>
          </div>
          <div className="fee-equals">=</div>
          <div className="fee-item fee-total">
            <span className="fee-label">Members pay/month</span>
            <span className="fee-val fee-highlight">${group.pricePerSlot}</span>
          </div>
        </div>

        {/* ── CREDENTIAL VAULT — rendered inline with lifted state ── */}
        <div className="gd-vault-spotlight">
          <CredentialVaultInline
            groupId={id}
            groupName={`${group.serviceName} ${group.planName}`}
            serviceName={group.serviceName}
            serviceIcon={group.serviceIcon}
            maxSlots={group.maxSlots}
            onJoin={() => setShowJoin(true)}
            onLogin={() => navigate("login")}
            groupStatus={group.status}
            isLoggedIn={session.isLoggedIn()}
            isCustomer={session.isCustomer()}
            isMyMember={!!myMember}
            isOrganizer={isOrganizer}
            canManage={canManage}
            // lifted state
            creds={creds}
            loading={credsLoading}
            editing={editing}
            editSlots={editSlots}
            editNote={editNote}
            saving={saving}
            saveMsg={saveMsg}
            onStartEdit={startEdit}
            onSetEditSlots={setEditSlots}
            onSetEditNote={setEditNote}
            onSave={handleSave}
            onCancelEdit={() => { setEditing(false); setSaveMsg(null); }}
            onDelete={handleDeleteCreds}
            onSaveMsgClear={() => setSaveMsg(null)}
          />
        </div>

        {/* Billing cycle bar */}
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
          <div className="gd-stat"><div className="gd-stat-val">${group.pricePerSlot}<span>/mo</span></div><div className="gd-stat-lbl">Members Pay</div></div>
          <div className="gd-stat"><div className="gd-stat-val">${(group.totalPrice - group.pricePerSlot).toFixed(2)}<span>/mo</span></div><div className="gd-stat-lbl">Savings/member</div></div>
          <div className="gd-stat">
            <div className="gd-stat-val">{filled}<span>/{group.maxSlots}</span></div>
            <div className="gd-stat-lbl">Paying Slots Filled</div>
          </div>
        </div>

        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
          <span>{filled}/{group.maxSlots} paying slots filled · {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft > 1 ? "s" : ""} left` : "Full"}</span>
          <span>{pct}%</span>
        </div>

        <div className="organizer-bar">
          <span className="ob-label">🛡️ Coordinator</span>
          <span className="ob-name">{group.organizerName}</span>
          <span className="ob-note">Organizer holds the plan &amp; does not occupy a slot</span>
        </div>
      </div>

      {/* ── Two columns ── */}
      <div className="gd-cols">
        <div className="card">
          <h2 className="section-h2">Paying Members</h2>
          {payingMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>👥</div>
              No paying members yet. Be the first to join!
            </div>
          ) : payingMembers.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-avatar">{m.name?.[0]?.toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">{m.name}</div>
                {canManage && <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{m.email}</div>}
                {m.durationLabel && <div style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: 1 }}>📅 {m.durationLabel}</div>}
                {m.expiresAt && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Expires {new Date(m.expiresAt).toLocaleDateString()}</div>}
              </div>
              <span className={`tag tag-${m.paymentStatus}`}>{m.paymentStatus}</span>
              {m.userId === currentUserId && m.paymentStatus === "pending" && (
                <button className="btn btn-sm pesapal-btn" onClick={() => setCurrency(m)} disabled={payingId === m.id}>
                  {payingId === m.id ? <><span className="spinner" /> Redirecting…</> : "🔒 Pay via PesaPal"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h2 className="section-h2">Organizer / Coordinator</h2>
            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{group.organizerName}</p>
            {isSuperAdmin && <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{group.organizerEmail}</p>}
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
              The organizer coordinates the group and purchases the subscription. They do <strong>not</strong> occupy a paying slot.
            </p>
          </div>

          {isSuperAdmin && (
            <div className="admin-group-panel">
              <div className="agp-title">🛡️ Admin Overview</div>
              <div className="agp-row"><span>Paying slots filled</span><span style={{ color: "var(--success)" }}>{filled}/{group.maxSlots}</span></div>
              <div className="agp-row"><span>Confirmed payments</span><span style={{ color: "var(--success)" }}>{payingMembers.filter(m => m.paymentStatus === "confirmed").length}</span></div>
              <div className="agp-row"><span>Pending payments</span><span style={{ color: "var(--warning)" }}>{payingMembers.filter(m => m.paymentStatus === "pending").length}</span></div>
              <div className="agp-row"><span>Platform revenue</span><span style={{ color: "var(--accent3)" }}>${group.payments?.reduce((acc, p) => acc + (p.platformFee || 0), 0).toFixed(2) || "0.00"}</span></div>
              <div className="agp-row"><span>Moderator owed</span><span>${group.payments?.reduce((acc, p) => acc + (p.moderatorOwed || p.organizerGets || 0), 0).toFixed(2) || "0.00"}</span></div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-sm btn-outline" onClick={() => navigate("earnings")}>💰 Earnings</button>
                <button className="btn btn-sm btn-outline" onClick={() => navigate("admin")}>🛡️ Admin</button>
              </div>
            </div>
          )}

          <div className="pesapal-info-card">
            <div className="pesapal-logo">🔒 Secured by PesaPal</div>
            <p>Accepted: 📱 M-Pesa &nbsp;💳 Visa/Mastercard &nbsp;🏦 Bank Transfer &nbsp;📲 Airtel Money</p>
            <p className="fee-note">
              A {feePercent}% platform fee is included in the price. The organizer receives ${moderatorGets}/mo per member.
            </p>
          </div>

          <div className="card">
            <h2 className="section-h2">Payment Log</h2>
            {!group.payments?.length ? (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No confirmed payments yet.</p>
            ) : group.payments.map(p => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{p.memberName}</span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>${p.amount} · {p.months}mo</span>
                </div>
                {p.platformFee && (
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                    Platform: ${p.platformFee} · Moderator: ${p.moderatorOwed || p.organizerGets}
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
            <p style={{ fontSize: "0.83rem", color: "var(--muted)", marginBottom: 16 }}>
              {spotsLeft} slot{spotsLeft !== 1 ? "s" : ""} remaining · {group.maxSlots} total paying slots.
            </p>
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
                  <span className="lcb-val">${group.pricePerSlot} × {groupMonths}mo = ${totalForPeriod}</span>
                </div>
              </div>
              <p className="lcb-note">The billing cycle is fixed by the group organizer and cannot be changed.</p>
            </div>
            <div className="dur-summary">
              <div className="dur-sum-row"><span>Total charged via PesaPal</span><span style={{ fontWeight: 700, color: "var(--accent)" }}>${totalForPeriod}</span></div>
              <div className="dur-sum-row" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                <span>Incl. {feePercent}% platform fee (${+(totalForPeriod * feePercent / 100).toFixed(2)})</span>
              </div>
            </div>
            <div className="info-box" style={{ marginTop: 12, marginBottom: 0, fontSize: "0.8rem" }}>
              You'll be redirected to PesaPal to pay <strong>${totalForPeriod}</strong>. Your slot is held pending payment.
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={busy}>
                {busy ? <><span className="spinner" /> Joining…</> : "Confirm & Pay →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Currency picker modal ── */}
      {showCurrency && (() => {
        // Derive BOTH amounts from the same canonical KES value so they are
        // always equivalent — matches the backend initiatePay conversion logic.
        const kesCharge = Math.round(showCurrency.memberPays * kesToUsd);  // whole shillings
        const usdCharge = (kesCharge / kesToUsd).toFixed(2);               // back-derived USD
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCurrency(null)}>
            <div className="modal">
              <h3>Choose Payment Currency</h3>
              <p style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 20 }}>
                Select the currency you'd like to pay in. Both options charge the same amount.
              </p>
              <div className="currency-grid">
                <button className="currency-card" onClick={() => handleCurrencyConfirm(showCurrency, "KES")}>
                  <div className="cc-flag">🇰🇪</div>
                  <div className="cc-name">Kenyan Shilling</div>
                  <div className="cc-code">KES</div>
                  <div className="cc-amount">
                    KES {kesCharge}
                  </div>
                  <div className="cc-rate">= ${usdCharge} USD</div>
                  <div className="cc-methods">M-Pesa · Airtel Money · Bank</div>
                </button>
                <button className="currency-card" onClick={() => handleCurrencyConfirm(showCurrency, "USD")}>
                  <div className="cc-flag">🇺🇸</div>
                  <div className="cc-name">US Dollar</div>
                  <div className="cc-code">USD</div>
                  <div className="cc-amount">
                    USD {usdCharge}
                  </div>
                  <div className="cc-rate">= KES {kesCharge}</div>
                  <div className="cc-methods">Visa · Mastercard · PayPal</div>
                </button>
              </div>
              <div className="info-box" style={{ marginTop: 14, marginBottom: 0, fontSize: "0.78rem" }}>
                💡 Rate used: 1 USD = KES {kesToUsd}. Both options charge the same value —
                KES {kesCharge} or the equivalent USD {usdCharge}.
                KES payments go via M-Pesa, USD via card.
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setCurrency(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Inline credential vault component (uses lifted state from parent) ──────
function CredentialVaultInline({
  groupId, groupName, serviceName, serviceIcon, maxSlots,
  onJoin, onLogin, groupStatus, isLoggedIn, isCustomer, isMyMember, isOrganizer,
  canManage, creds, loading, editing, editSlots, editNote, saving, saveMsg,
  onStartEdit, onSetEditSlots, onSetEditNote, onSave, onCancelEdit, onDelete, onSaveMsgClear,
}) {
  const [copied, setCopied] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reveals, setReveals] = useState({});

  function copy(key, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    });
  }

  if (loading) return (
    <div className="cv-wrap cv-loading">
      <span className="spinner" /><span>Loading vault…</span>
    </div>
  );

  // ── LOCKED ────────────────────────────────────────────────────────────────
  if (creds?.locked) {
    const canJoin = groupStatus === "open" && isCustomer && !isMyMember && !isOrganizer;
    const needsLogin = !isLoggedIn;
    return (
      <div className="cv-wrap cv-locked-teaser">
        <div className="cvt-shimmer" />
        <div className="cvt-top-label">
          <span className="cvt-key-icon">🔑</span>
          <span>Access Credentials Vault</span>
          <span className="cvt-live-badge">LIVE</span>
        </div>
        <div className="cvt-preview-area">
          <div className="cvt-preview-slot">
            <div className="cvt-preview-slot-label"><span className="cvt-slot-dot" />{serviceName} Account</div>
            <div className="cvt-fake-fields">
              <div className="cvt-fake-field">
                <span className="cvt-fake-label">EMAIL</span>
                <span className="cvt-fake-value cvt-blur">shared.account@example.com</span>
                <span className="cvt-fake-copy">⎘</span>
              </div>
              <div className="cvt-fake-field">
                <span className="cvt-fake-label">PASSWORD</span>
                <span className="cvt-fake-value cvt-blur cvt-mono">••••••••••••••</span>
                <span className="cvt-fake-copy">⎘</span>
              </div>
            </div>
          </div>
          <div className="cvt-blur-overlay">
            <div className="cvt-lock-badge"><span className="cvt-lock-emoji">🔒</span><span className="cvt-lock-text">Locked</span></div>
          </div>
        </div>
        <div className="cvt-perks">
          <div className="cvt-perk">✅ Instant access to credentials after payment</div>
          <div className="cvt-perk">✅ Password reveal toggle + one-click copy</div>
          <div className="cvt-perk">✅ Email notification when credentials update</div>
        </div>
        <div className="cvt-cta-area">
          {needsLogin ? (
            <><p className="cvt-cta-hint">Sign in to join this group and unlock the credential vault.</p>
            <button className="cvt-cta-btn" onClick={onLogin}>🔓 Sign In to Unlock</button></>
          ) : canJoin ? (
            <><p className="cvt-cta-hint">Join now — credentials unlock instantly after payment.</p>
            <button className="cvt-cta-btn" onClick={onJoin}>🔓 Join & Unlock Credentials</button></>
          ) : isMyMember ? (
            <p className="cvt-cta-hint cvt-pending-hint">⏳ Complete your payment above — the vault unlocks automatically once confirmed.</p>
          ) : (
            <p className="cvt-cta-hint">{groupStatus === "full" ? "This group is full — check back for openings." : "Credentials locked."}</p>
          )}
        </div>
      </div>
    );
  }

  // ── EMPTY — no credentials set yet ───────────────────────────────────────
  if (!editing && !creds?.exists) return (
    <div className="cv-wrap cv-empty">
      <div className="cv-empty-icon">🔐</div>
      <h3 className="cv-empty-title">Credential Vault</h3>
      {canManage ? (
        <>
          <p className="cv-empty-desc">Set the access credentials. Confirmed paying members will see them here immediately.</p>
          <button className="btn btn-primary cv-set-btn" onClick={onStartEdit}>🔑 Set Credentials Now</button>
        </>
      ) : (
        <p className="cv-empty-desc">Your coordinator hasn't added credentials yet. You'll be notified by email the moment they do.</p>
      )}
    </div>
  );

  // ── EDIT MODE ─────────────────────────────────────────────────────────────
  if (editing) return (
    <div className="cv-wrap cv-edit-mode">
      <div className="cv-edit-header">
        <div className="cv-edit-icon">{serviceIcon} 🔑</div>
        <div>
          <h3 className="cv-edit-title">Set Access Credentials</h3>
          <p className="cv-edit-sub">Only confirmed paying members can view these. They're notified on every update.</p>
        </div>
      </div>
      <div className="cv-slots-list">
        {editSlots.map((slot, i) => (
          <div key={i} className="cv-slot-editor">
            <div className="cv-slot-editor-head">
              <span className="cv-slot-num">Slot {i + 1}</span>
              {editSlots.length > 1 && (
                <button className="cv-remove-btn" onClick={() => onSetEditSlots(s => s.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Label</label>
                <input value={slot.label} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder={`Slot ${i + 1}`} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email / Username</label>
                <input value={slot.username} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, username: e.target.value } : x))} placeholder="shared@email.com" autoComplete="off" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input value={slot.password} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, password: e.target.value } : x))} placeholder="password here" type="text" autoComplete="new-password" />
              </div>
            </div>
            <div className="form-group">
              <label>Extra Note (PIN, profile, invite link, etc.)</label>
              <input value={slot.note} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="e.g. Use Profile 2 · PIN: 1234" />
            </div>
          </div>
        ))}
      </div>
      {editSlots.length < maxSlots && (
        <button className="cv-add-slot-btn" onClick={() => onSetEditSlots(s => [...s, { label: "", username: "", password: "", note: "" }])}>+ Add Another Slot</button>
      )}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label>General Note (visible to all members)</label>
        <textarea rows={3} value={editNote} onChange={e => onSetEditNote(e.target.value)} placeholder="e.g. Use incognito mode. Don't change the password." style={{ resize: "vertical" }} />
      </div>
      {saveMsg && (
        <div className={`cv-save-msg ${saveMsg.type === "ok" ? "cv-msg-ok" : "cv-msg-err"}`} onClick={onSaveMsgClear}>
          {saveMsg.text}
        </div>
      )}
      <div className="cv-edit-actions">
        <button className="btn btn-outline" onClick={onCancelEdit}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : "💾 Save Credentials"}
        </button>
      </div>
    </div>
  );

  // ── VIEW MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="cv-wrap cv-view-mode">
      <div className="cv-vault-header">
        <div className="cv-vault-icon-wrap">
          <span className="cv-vault-service-icon">{serviceIcon}</span>
          <span className="cv-vault-key">🔑</span>
        </div>
        <div className="cv-vault-title-block">
          <h3 className="cv-vault-title">🔓 Access Credentials Unlocked</h3>
          <p className="cv-vault-subtitle">
            {creds.slots?.length} slot{creds.slots?.length !== 1 ? "s" : ""} · Updated {new Date(creds.updatedAt).toLocaleDateString()}
          </p>
        </div>
        {canManage && (
          <div className="cv-manage-btns">
            <button className="btn btn-sm btn-outline" onClick={onStartEdit}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>
        )}
      </div>
      {creds.generalNote && (
        <div className="cv-general-note"><span className="cv-note-icon">📌</span><span>{creds.generalNote}</span></div>
      )}
      <div className="cv-slots">
        {creds.slots?.map((slot, i) => (
          <div key={i} className="cv-slot">
            <div className="cv-slot-header">
              <span className="cv-slot-badge">#{slot.slotNumber || i + 1}</span>
              <span className="cv-slot-label">{slot.label}</span>
              <button className="cv-copy-all-btn" onClick={() => copy(`slot-all-${i}`, `${slot.label}\nUsername: ${slot.username}\nPassword: ${slot.password}${slot.note ? `\nNote: ${slot.note}` : ""}`)}>
                {copied[`slot-all-${i}`] ? "✓ Copied!" : "⎘ Copy All"}
              </button>
            </div>
            {slot.username && (
              <div className="cv-field">
                <div className="cv-field-label">Email / Username</div>
                <div className="cv-field-row">
                  <span className="cv-field-value">{slot.username}</span>
                  <div className="cv-field-actions">
                    <button className={`cv-copy-btn ${copied[`u-${i}`] ? "copied" : ""}`} onClick={() => copy(`u-${i}`, slot.username)}>
                      {copied[`u-${i}`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {slot.password && (
              <div className="cv-field">
                <div className="cv-field-label">Password</div>
                <div className="cv-field-row">
                  <span className={`cv-field-value ${!reveals[i] ? "cv-masked" : ""}`}>
                    {!reveals[i] ? "•".repeat(Math.min(slot.password.length, 16)) : slot.password}
                  </span>
                  <div className="cv-field-actions">
                    <button className="cv-icon-btn" onClick={() => setReveals(r => ({ ...r, [i]: !r[i] }))}>
                      {reveals[i] ? "🙈" : "👁️"}
                    </button>
                    <button className={`cv-copy-btn ${copied[`p-${i}`] ? "copied" : ""}`} onClick={() => copy(`p-${i}`, slot.password)}>
                      {copied[`p-${i}`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {slot.note && (
              <div className="cv-field">
                <div className="cv-field-label">Note</div>
                <div className="cv-field-row"><span className="cv-field-value" style={{ color: "var(--muted)" }}>{slot.note}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>
      {confirmDelete && (
        <div style={{ marginTop: 16, padding: 16, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10 }}>
          <p style={{ fontSize: "0.84rem", color: "var(--error)", marginBottom: 12 }}>⚠️ Delete all credentials? Members will lose access.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={() => { onDelete(); setConfirmDelete(false); }}>Confirm Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
