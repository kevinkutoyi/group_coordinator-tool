import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import "./ModeratorDashboardPage.css";

const STATUS_COLORS = { open:"var(--success)", full:"var(--warning)", closed:"var(--muted)", pending_review:"var(--accent)" };
const REVIEW_LABELS = { approved:"✅ Live", pending:"⏳ Under Review", rejected:"❌ Rejected" };
const REVIEW_COLORS = { approved:"var(--success)", pending:"var(--warning)", rejected:"var(--error)" };

export default function ModeratorDashboardPage({ navigate }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("overview");

  const load = useCallback(async () => {
    if (!session.isModerator()) { navigate("login"); return; }
    try {
      const d = await api.getModeratorDashboard();
      setData(d);
    } catch (err) {
      if (err.message.includes("pending") || err.message.includes("approved"))
        navigate("login");
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign:"center", padding:80 }}><span className="spinner"/></div>;
  if (!data)   return null;

  const { summary, groups, payoutHistory } = data;
  const user = session.getUser();

  // Backend fields: totalCollected, totalOwed, totalPaid, totalPending, feePercent, pesapalEmail, configured
  const feePercent = summary.feePercent ?? 8;
  const modKeeps   = +(100 - feePercent).toFixed(1);

  return (
    <div className="mod-dash fade-in">
      {/* Header */}
      <div className="mod-dash-header">
        <div className="mod-dash-greeting">
          <div className="mod-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <h1 className="mod-dash-title">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="mod-dash-sub">Group Moderator Dashboard · {new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" })}</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate("mod-settings")}>⚙️ Settings</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("create")}>+ New Group</button>
        </div>
      </div>

      {/* Setup warning */}
      {!summary.configured && (
        <div className="mod-setup-banner">
          <span>⚠️</span>
          <div>
            <strong>Register your PesaPal email to receive Sunday payouts.</strong>
            <span> Add your payout email in Settings so the admin knows where to send your earnings.</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("mod-settings")}>
            Set Up Now →
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="mod-kpis">
        <div className="mod-kpi-card">
          <div className="mod-kpi-icon">👥</div>
          <div className="mod-kpi-val">{summary.totalMembers}</div>
          <div className="mod-kpi-label">Total Members</div>
        </div>
        <div className="mod-kpi-card">
          <div className="mod-kpi-icon">📋</div>
          <div className="mod-kpi-val">{summary.activeGroups}<span>/{summary.totalGroups}</span></div>
          <div className="mod-kpi-label">Active Groups</div>
        </div>
        <div className="mod-kpi-card mod-kpi-earn">
          <div className="mod-kpi-icon">💰</div>
          <div className="mod-kpi-val" style={{ color:"var(--accent3)" }}>
            KES {(summary.totalOwed ?? 0).toFixed(2)}
          </div>
          <div className="mod-kpi-label">Total Owed to You</div>
        </div>
        <div className="mod-kpi-card">
          <div className="mod-kpi-icon">✅</div>
          <div className="mod-kpi-val" style={{ color:"var(--success)" }}>
            KES {(summary.totalPaid ?? 0).toFixed(2)}
          </div>
          <div className="mod-kpi-label">Already Paid Out</div>
        </div>
        {summary.totalPending > 0 && (
          <div className="mod-kpi-card mod-kpi-warn">
            <div className="mod-kpi-icon">🕐</div>
            <div className="mod-kpi-val" style={{ color:"var(--warning)" }}>
              KES {(summary.totalPending ?? 0).toFixed(2)}
            </div>
            <div className="mod-kpi-label">Pending Next Payout</div>
          </div>
        )}
        {summary.pendingReview > 0 && (
          <div className="mod-kpi-card mod-kpi-warn">
            <div className="mod-kpi-icon">⏳</div>
            <div className="mod-kpi-val" style={{ color:"var(--warning)" }}>{summary.pendingReview}</div>
            <div className="mod-kpi-label">Groups Awaiting Review</div>
          </div>
        )}
      </div>

      {/* Earnings breakdown card */}
      {summary.totalCollected > 0 && (
        <div className="card mod-earnings-card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>💰 Earnings Breakdown</h2>
          <div className="mod-earn-row">
            <span>Gross collected from members</span>
            <span>KES {(summary.totalCollected ?? 0).toFixed(2)}</span>
          </div>
          <div className="mod-earn-row mod-earn-split">
            <span>Platform fee ({feePercent}% — kept by SplitPass)</span>
            <span style={{ color:"var(--muted)" }}>
              − KES {((summary.totalCollected ?? 0) - (summary.totalOwed ?? 0)).toFixed(2)}
            </span>
          </div>
          <div className="mod-earn-row">
            <span>Your total owed ({modKeeps}% of gross)</span>
            <span style={{ color:"var(--accent3)" }}>KES {(summary.totalOwed ?? 0).toFixed(2)}</span>
          </div>
          <div className="mod-earn-row">
            <span>Already paid to you</span>
            <span style={{ color:"var(--success)" }}>KES {(summary.totalPaid ?? 0).toFixed(2)}</span>
          </div>
          <div className="mod-earn-row mod-earn-total">
            <span>Pending next Sunday payout</span>
            <span style={{ color:"var(--warning)" }}>KES {(summary.totalPending ?? 0).toFixed(2)}</span>
          </div>
          <p style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:12 }}>
            All payments land in the platform PesaPal account. Every Sunday the super admin pays out your {modKeeps}% share to your registered PesaPal email.
          </p>
        </div>
      )}

      {/* Payout history */}
      {payoutHistory?.length > 0 && (
        <div className="card" style={{ marginBottom:24 }}>
          <h2 className="section-h2" style={{ marginBottom:12 }}>📅 Payout History</h2>
          {payoutHistory.map(p => (
            <div key={p.id} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 0", borderBottom:"1px solid var(--border)", fontSize:"0.82rem",
            }}>
              <div>
                <div style={{ fontWeight:600 }}>KES {p.amountPaid?.toFixed(2)}</div>
                <div style={{ color:"var(--muted)", fontSize:"0.72rem" }}>
                  {new Date(p.paidAt).toLocaleDateString("en-KE", { weekday:"short", day:"numeric", month:"short", year:"numeric" })}
                  {p.notes && ` · ${p.notes}`}
                </div>
              </div>
              <span style={{
                padding:"3px 10px", borderRadius:99,
                background:"rgba(74,222,128,0.1)", color:"var(--success)",
                border:"1px solid rgba(74,222,128,0.2)", fontSize:"0.72rem", fontWeight:600,
              }}>Paid ✓</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="gep-tabs">
        {[
          { key:"overview", label:"📋 My Groups" },
          { key:"pending",  label:`⏳ Pending Review (${summary.pendingReview})` },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?"active":""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Groups list */}
      {tab === "overview" && (
        groups.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📋</div>
            <h3>No groups yet</h3>
            <p>Create your first group to start earning.</p>
            <br/>
            <button className="btn btn-primary" onClick={() => navigate("create")}>+ Create Group</button>
          </div>
        ) : (
          <div className="mod-groups-list">
            {groups.map(g => (
              <div key={g.id} className="mod-group-card card">
                <div className="mgc-left">
                  <span style={{ fontSize:"2rem" }}>{g.serviceIcon}</span>
                  <div>
                    <div className="mgc-name">{g.serviceName} — {g.planName}</div>
                    <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                      <span className="tag" style={{ color: STATUS_COLORS[g.status] || "var(--muted)", background:"var(--bg3)", border:"1px solid var(--border)", fontSize:"0.7rem" }}>
                        {g.status}
                      </span>
                      <span className="tag" style={{ color: REVIEW_COLORS[g.reviewStatus] || "var(--muted)", background:"var(--bg3)", border:"1px solid var(--border)", fontSize:"0.7rem" }}>
                        {REVIEW_LABELS[g.reviewStatus] || g.reviewStatus}
                      </span>
                      <span style={{ fontSize:"0.72rem", color:"var(--muted)" }}>
                        {g.confirmedMembers}/{g.totalSlots} members · {g.billingCycle}
                      </span>
                    </div>
                    {g.reviewStatus === "rejected" && (
                      <p style={{ fontSize:"0.75rem", color:"var(--error)", marginTop:4 }}>
                        ❌ Not approved — revise and resubmit by editing the group.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mgc-right">
                  {g.reviewStatus === "approved" && g.modOwed > 0 && (
                    <div className="mgc-earnings">
                      <div className="mgc-earn-val">KES {g.modOwed.toFixed(2)}</div>
                      <div className="mgc-earn-sub">total owed</div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => navigate("group", g.id)}>View</button>
                    <button className="btn btn-sm btn-outline" onClick={() => navigate("group-emails", g.id)}
                      style={{ color:"var(--accent)", borderColor:"rgba(124,106,255,0.3)" }}>
                      📧 Emails
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "pending" && (
        <div>
          {groups.filter(g => g.reviewStatus === "pending").length === 0 ? (
            <div className="empty-state">
              <div className="emoji">✅</div>
              <h3>All groups reviewed!</h3>
              <p>No groups are waiting for admin review.</p>
            </div>
          ) : groups.filter(g => g.reviewStatus === "pending").map(g => (
            <div key={g.id} className="mod-group-card card">
              <div className="mgc-left">
                <span style={{ fontSize:"2rem" }}>{g.serviceIcon}</span>
                <div>
                  <div className="mgc-name">{g.serviceName} — {g.planName}</div>
                  <p style={{ fontSize:"0.78rem", color:"var(--warning)", marginTop:4 }}>
                    ⏳ Submitted for admin review. You'll be notified by email once it's approved or rejected.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
