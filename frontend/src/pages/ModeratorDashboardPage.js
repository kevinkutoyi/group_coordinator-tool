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

  const { summary, groups } = data;
  const user = session.getUser();

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
            <strong>Connect your PesaPal account to start earning.</strong>
            <span> Set your profit percentage and PesaPal API credentials to receive payments.</span>
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
          <div className="mod-kpi-val" style={{ color:"var(--accent3)" }}>${summary.totalNet.toFixed(2)}</div>
          <div className="mod-kpi-label">Your Net Earnings</div>
        </div>
        <div className="mod-kpi-card">
          <div className="mod-kpi-icon">📊</div>
          <div className="mod-kpi-val">{summary.profitPercent}<span>%</span></div>
          <div className="mod-kpi-label">Your Profit Rate</div>
        </div>
        {summary.pendingReview > 0 && (
          <div className="mod-kpi-card mod-kpi-warn">
            <div className="mod-kpi-icon">⏳</div>
            <div className="mod-kpi-val" style={{ color:"var(--warning)" }}>{summary.pendingReview}</div>
            <div className="mod-kpi-label">Awaiting Review</div>
          </div>
        )}
      </div>

      {/* Earnings breakdown card */}
      {summary.configured && summary.totalGross > 0 && (
        <div className="card mod-earnings-card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>💰 Earnings Breakdown</h2>
          <div className="mod-earn-row">
            <span>Gross collected from members</span>
            <span>${summary.totalGross.toFixed(2)}</span>
          </div>
          <div className="mod-earn-row">
            <span>Your profit ({summary.profitPercent}% of gross)</span>
            <span style={{ color:"var(--accent3)" }}>${summary.totalProfit.toFixed(2)}</span>
          </div>
          <div className="mod-earn-row mod-earn-split">
            <span>Platform cut ({summary.platformCutPercent}% of your profit → goes to SplitPass)</span>
            <span style={{ color:"var(--muted)" }}>−${summary.totalPlatformTake.toFixed(2)}</span>
          </div>
          <div className="mod-earn-row mod-earn-total">
            <span>Your net earnings</span>
            <span style={{ color:"var(--success)" }}>${summary.totalNet.toFixed(2)}</span>
          </div>
          <p style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:12 }}>
            Profit flows automatically: {summary.profitPercent}% profit → {summary.platformCutPercent}% of that ({summary.totalPlatformTake > 0 ? ((summary.platformCutPercent/100)*summary.profitPercent).toFixed(1) : "–"}% total) goes to SplitPass, you keep the rest.
          </p>
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
                  {g.reviewStatus === "approved" && (
                    <div className="mgc-earnings">
                      <div className="mgc-earn-val">${g.netEarned.toFixed(2)}</div>
                      <div className="mgc-earn-sub">net earned</div>
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
