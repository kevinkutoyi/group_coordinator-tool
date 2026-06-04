const fs = require('fs');

const content = `import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";

function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
}

function CountdownBar({ expiresAt, billingCycle }) {
  const days = daysLeft(expiresAt);
  if (days === null) return null;
  const cycleDays = { monthly: 30, quarterly: 90, biannually: 180, annually: 365 }[billingCycle] || 30;
  const pct = Math.max(0, Math.min(100, (days / cycleDays) * 100));
  const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";
  const label = days <= 0 ? "Expired" : days === 1 ? "1 day left" : days <= 7 ? days + " days left" : days + " days left";
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600 }}>{days <= 7 && days > 0 ? "⚠️ " : days > 7 ? "✓ " : "⛔ "}{label}</span>
        <span style={{ color: "var(--muted)" }}>
          {days > 0
            ? "Expires " + new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : "Expired " + new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
      <div style={{ background: "var(--bg2)", borderRadius: 99, height: 6, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: color, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

export default function MyGroupsPage({ navigate }) {
  const [groups, setGroups]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [renewBusy, setRenewBusy] = useState({});
  const [msg, setMsg]             = useState(null);

  const uid = session.getUser()?.id;

  const load = useCallback(() => {
    if (!session.isLoggedIn()) { navigate("login"); return; }
    api.getGroups()
      .then(all => {
        const mine = all.filter(g => {
          const isOrganizer = g.organizerId === uid;
          const isMember = g.members?.some(m => m.userId === uid && m.role !== "organizer");
          return isOrganizer || isMember;
        });
        setGroups(mine);
      })
      .finally(() => setLoading(false));
  }, [uid, navigate]);

  useEffect(() => { load(); }, [load]);

  async function handleRenew(e, groupId) {
    e.stopPropagation();
    setRenewBusy(b => ({ ...b, [groupId]: true }));
    try {
      await api.renewSlot(groupId);
      load();
      navigate("group", groupId);
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally {
      setRenewBusy(b => ({ ...b, [groupId]: false }));
    }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;

  const mySubscriptions = groups.filter(g => g.organizerId !== uid);
  const myOrganized     = groups.filter(g => g.organizerId === uid);

  const sorted = [...mySubscriptions].sort((a, b) => {
    const ma = a.members?.find(m => m.userId === uid && m.role !== "organizer");
    const mb = b.members?.find(m => m.userId === uid && m.role !== "organizer");
    const da = daysLeft(ma?.expiresAt) ?? 999;
    const db = daysLeft(mb?.expiresAt) ?? 999;
    return da - db;
  });

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
      <h1 className="page-title">My Subscriptions</h1>
      <p className="page-sub">Track your active subscriptions, expiry countdowns and renewals</p>

      {msg && (
        <div className={"msg-box " + (msg.type === "ok" ? "msg-ok" : "msg-err")}
          style={{ marginBottom: 16 }} onClick={() => setMsg(null)}>
          {msg.text} <span style={{ opacity: .4 }}>✕</span>
        </div>
      )}

      {mySubscriptions.length > 0 && (() => {
        const confirmed   = mySubscriptions.filter(g => { const m = g.members?.find(m => m.userId === uid && m.role !== "organizer"); return m?.paymentStatus === "confirmed"; });
        const expiring    = confirmed.filter(g => { const m = g.members?.find(m => m.userId === uid && m.role !== "organizer"); const d = daysLeft(m?.expiresAt); return d !== null && d <= 7 && d > 0; });
        const expiredList = mySubscriptions.filter(g => { const m = g.members?.find(m => m.userId === uid && m.role !== "organizer"); return m?.paymentStatus === "expired" || (daysLeft(m?.expiresAt) !== null && daysLeft(m?.expiresAt) <= 0); });
        return (
          <div className="stats-row" style={{ marginBottom: 28 }}>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{mySubscriptions.length}</div><div className="stat-label">Total</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--success)" }}>{confirmed.length}</div><div className="stat-label">Active</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--warning)" }}>{expiring.length}</div><div className="stat-label">Expiring Soon</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--error)" }}>{expiredList.length}</div><div className="stat-label">Expired</div></div>
          </div>
        );
      })()}

      {sorted.length === 0 && myOrganized.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📋</div>
          <h3>No subscriptions yet</h3>
          <p>Browse available groups and join one to get started.</p>
          <br />
          <button className="btn btn-primary" onClick={() => navigate("groups")}>Browse Groups</button>
        </div>
      ) : (
        <>
          {sorted.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>🔑 My Subscriptions</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sorted.map(g => {
                  const m = g.members?.find(mem => mem.userId === uid && mem.role !== "organizer");
                  if (!m) return null;
                  const days        = daysLeft(m.expiresAt);
                  const isExpired   = m.paymentStatus === "expired" || (days !== null && days <= 0);
                  const isExpiring  = !isExpired && days !== null && days <= 7;
                  const isPending   = m.paymentStatus === "pending";
                  const isConfirmed = m.paymentStatus === "confirmed" && !isExpired;
                  const showRenew   = isExpired || isExpiring;
                  const borderColor = isExpired ? "var(--error)" : isExpiring ? "var(--warning)" : isPending ? "rgba(124,106,255,0.4)" : "var(--border)";

                  return (
                    <div key={g.id} className="card"
                      style={{ borderLeft: "3px solid " + borderColor, cursor: "pointer", padding: 20 }}
                      onClick={() => navigate("group", g.id)}>

                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                        <span style={{ fontSize: "2.2rem" }}>{g.serviceIcon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{g.serviceName}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{g.planName} · {g.billingCycle}</div>
                        </div>
                        <span className={"tag tag-" + (isExpired ? "closed" : m.paymentStatus)} style={{ fontSize: "0.72rem" }}>
                          {isExpired ? "expired" : m.paymentStatus}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 20, fontSize: "0.8rem", flexWrap: "wrap", marginBottom: 4 }}>
                        <div><span style={{ color: "var(--muted)" }}>Your share </span><strong style={{ color: "var(--accent)" }}>{"$" + (m.memberPays || g.pricePerSlot) + "/mo"}</strong></div>
                        <div><span style={{ color: "var(--muted)" }}>Savings </span><strong style={{ color: "var(--success)" }}>{"$" + (g.totalPrice - g.pricePerSlot).toFixed(2) + "/mo"}</strong></div>
                        {m.expiresAt && (
                          <div>
                            <span style={{ color: "var(--muted)" }}>{isExpired ? "Expired " : "Expires "}</span>
                            <strong>{new Date(m.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong>
                          </div>
                        )}
                      </div>

                      {m.expiresAt && isConfirmed && <CountdownBar expiresAt={m.expiresAt} billingCycle={g.billingCycle} />}

                      {isExpired && (
                        <div style={{ marginTop: 8, padding: "6px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8, fontSize: "0.78rem", color: "var(--error)", fontWeight: 600 }}>
                          {"⛔ Expired " + Math.abs(days) + "d ago — renew to restore access"}
                        </div>
                      )}

                      {isExpiring && (
                        <div style={{ marginTop: 8, padding: "6px 12px", background: "rgba(251,191,36,0.1)", borderRadius: 8, fontSize: "0.78rem", color: "var(--warning)", fontWeight: 600 }}>
                          {"⚠️ Expiring in " + days + " day" + (days !== 1 ? "s" : "") + " — renew to avoid interruption"}
                        </div>
                      )}

                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                        {isPending && (
                          <button className="btn btn-sm pesapal-btn" onClick={e => { e.stopPropagation(); navigate("group", g.id); }}>
                            🔒 Complete Payment →
                          </button>
                        )}
                        {showRenew && (
                          <button className="btn btn-sm btn-primary"
                            style={{ background: "linear-gradient(90deg,#f59e0b,#ef4444)", border: "none" }}
                            disabled={renewBusy[g.id]}
                            onClick={e => handleRenew(e, g.id)}>
                            {renewBusy[g.id] ? <><span className="spinner" /> Renewing…</> : "🔄 Renew Subscription"}
                          </button>
                        )}
                        <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); navigate("group", g.id); }}>
                          View Group →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {myOrganized.length > 0 && (
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>🛡️ Groups I Coordinate</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {myOrganized.map(g => {
                  const payingMembers = g.members?.filter(m => m.role !== "organizer") || [];
                  const filled        = payingMembers.filter(m => m.paymentStatus === "confirmed").length;
                  const pending       = payingMembers.filter(m => m.paymentStatus === "pending").length;
                  const expiredCount  = payingMembers.filter(m => m.paymentStatus === "expired").length;
                  const monthlyRevenue = (g.pricePerSlot * filled * (1 - (g.feePercent || 8) / 100)).toFixed(2);

                  return (
                    <div key={g.id} className="card" style={{ cursor: "pointer", padding: 20 }} onClick={() => navigate("group", g.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                        <span style={{ fontSize: "2.2rem" }}>{g.serviceIcon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{g.serviceName} — {g.planName}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>🛡️ You coordinate · {g.billingCycle}</div>
                        </div>
                        <span className={"tag tag-" + g.status}>{g.status}</span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, fontSize: "0.8rem" }}>
                        <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ color: "var(--muted)", fontSize: "0.7rem" }}>Paying slots</div>
                          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{filled}<span style={{ color: "var(--muted)", fontWeight: 400 }}>{"/" + g.maxSlots}</span></div>
                        </div>
                        <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ color: "var(--muted)", fontSize: "0.7rem" }}>Monthly earnings</div>
                          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--success)" }}>{"$" + monthlyRevenue}</div>
                        </div>
                        {pending > 0 && (
                          <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ color: "var(--warning)", fontSize: "0.7rem" }}>Pending payment</div>
                            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--warning)" }}>{pending}</div>
                          </div>
                        )}
                        {expiredCount > 0 && (
                          <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ color: "var(--error)", fontSize: "0.7rem" }}>Expired members</div>
                            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--error)" }}>{expiredCount}</div>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); navigate("group", g.id); }}>Manage Group →</button>
                        <button className="btn btn-sm btn-outline" style={{ borderColor: "rgba(124,106,255,0.3)", color: "var(--accent)" }}
                          onClick={e => { e.stopPropagation(); navigate("group-emails", g.id); }}>📧 Email Members</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
`;

fs.writeFileSync('frontend/src/pages/MyGroupsPage.js', content);
console.log('✓ MyGroupsPage.js written');
console.log('✅ Done!');
