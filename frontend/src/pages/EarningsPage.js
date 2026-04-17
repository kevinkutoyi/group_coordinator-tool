import React, { useEffect, useState, useCallback } from "react";
import { api, auth } from "../api";
import "./EarningsPage.css";

export default function EarningsPage({ navigate }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.getEarnings()
      .then(setData)
      .catch((err) => {
        if (err.message.includes("token") || err.message.includes("Token") || err.message.includes("No token")) {
          // Token expired or missing — send to login
          auth.clearToken();
          navigate("admin-login");
        } else {
          setError(err.message || "Could not load earnings.");
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    // Guard: must be logged in
    if (!auth.isLoggedIn()) {
      navigate("admin-login");
      return;
    }
    load();
  }, [load, navigate]);

  function handleLogout() {
    auth.clearToken();
    navigate("home");
  }

  if (loading) return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <span className="spinner" />
      <p style={{ color: "var(--muted)", marginTop: 16, fontSize: "0.85rem" }}>Loading earnings…</p>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 500, margin: "60px auto", textAlign: "center" }}>
      <div className="info-box">{error}</div>
      <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={load}>Try Again</button>
    </div>
  );

  if (!data) return null;

  const maxMonthly = Math.max(...data.monthlyEarnings.map((m) => m.total), 0.01);

  return (
    <div className="earnings-page fade-in">
      {/* Header */}
      <div className="earnings-header">
        <div>
          <h1 className="page-title">💰 Platform Earnings</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Your {data.feePercent}% cut from every PesaPal payment — admin view
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-danger btn-sm" onClick={handleLogout}>Sign Out</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="stats-row" style={{ marginBottom: 32 }}>
        <div className="stat-card earn-kpi">
          <div className="stat-value" style={{ color: "var(--accent3)" }}>${data.totalEarned}</div>
          <div className="stat-label">Total Earned</div>
        </div>
        <div className="stat-card earn-kpi">
          <div className="stat-value">{data.completedOrders}</div>
          <div className="stat-label">Completed Payments</div>
        </div>
        <div className="stat-card earn-kpi">
          <div className="stat-value" style={{ color: "var(--warning)" }}>{data.pendingOrders}</div>
          <div className="stat-label">Pending Orders</div>
        </div>
        <div className="stat-card earn-kpi">
          <div className="stat-value">{data.totalGroups}</div>
          <div className="stat-label">Total Groups</div>
        </div>
        <div className="stat-card earn-kpi">
          <div className="stat-value">{data.totalMembers}</div>
          <div className="stat-label">Total Members</div>
        </div>
        <div className="stat-card earn-kpi">
          <div className="stat-value">{data.feePercent}%</div>
          <div className="stat-label">Platform Fee</div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-h2" style={{ marginBottom: 20 }}>Monthly Earnings (Last 12 Months)</h2>
        <div className="bar-chart">
          {data.monthlyEarnings.map((m) => (
            <div key={m.label} className="bar-col">
              <div className="bar-amount">{m.total > 0 ? `$${m.total}` : ""}</div>
              <div
                className="bar-fill"
                style={{ height: `${Math.max((m.total / maxMonthly) * 120, m.total > 0 ? 4 : 0)}px` }}
              />
              <div className="bar-label">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column detail */}
      <div className="earnings-grid">
        {/* By group */}
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom: 16 }}>Earnings by Group</h2>
          {data.byGroup.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              No earnings yet. They appear once members pay via PesaPal.
            </p>
          ) : data.byGroup.sort((a, b) => b.fees - a.fees).map((g) => (
            <div key={g.groupId} className="earning-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{g.serviceName}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{g.planName}</div>
              </div>
              <div className="earn-amount">${g.fees}</div>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom: 16 }}>Recent Transactions</h2>
          {data.recentEarnings.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No transactions yet.</p>
          ) : data.recentEarnings.map((e) => (
            <div key={e.id} className="earning-row">
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 500, fontFamily: "monospace" }}>
                  {e.orderId?.slice(0, 18)}…
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {e.earnedAt ? new Date(e.earnedAt).toLocaleString() : "—"} · {e.currency}
                </div>
              </div>
              <div className="earn-amount earn-green">+${e.fee}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Security note */}
      <div className="info-box" style={{ marginTop: 24 }}>
        <strong>🔐 Security:</strong> This page is protected by JWT authentication.
        Your token expires in <strong>8 hours</strong> and is stored only in this browser session.
        Click "Sign Out" above to invalidate your session immediately.
      </div>
    </div>
  );
}
