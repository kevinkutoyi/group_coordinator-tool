import React, { useEffect, useState } from "react";
import { api } from "../api";
import "./EarningsPage.css";

export default function EarningsPage({ navigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    api.getEarnings()
      .then(setData)
      .catch(() => setError("Could not load earnings. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;
  if (error)   return <div className="info-box" style={{ maxWidth: 500, margin: "40px auto" }}>{error}</div>;

  return (
    <div className="earnings-page fade-in">
      <h1 className="page-title">💰 Platform Earnings</h1>
      <p className="page-sub">Your {data.feePercent}% cut from every PesaPal payment processed</p>

      {/* Top stats */}
      <div className="stats-row" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent3)" }}>${data.totalEarned}</div>
          <div className="stat-label">Total Earned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.earningsCount}</div>
          <div className="stat-label">Payments Processed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--warning)" }}>{data.pendingOrders}</div>
          <div className="stat-label">Pending Orders</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.feePercent}%</div>
          <div className="stat-label">Platform Fee</div>
        </div>
      </div>

      <div className="earnings-grid">
        {/* By group */}
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom: 16 }}>Earnings by Group</h2>
          {data.byGroup.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No earnings yet. Earnings appear once members pay via PesaPal.</p>
          ) : data.byGroup.map(g => (
            <div key={g.groupId} className="earning-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{g.serviceName}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{g.planName}</div>
              </div>
              <div style={{ color: "var(--accent3)", fontWeight: 700, fontFamily: "var(--font-head)" }}>
                ${g.fees}
              </div>
            </div>
          ))}
        </div>

        {/* Recent */}
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom: 16 }}>Recent Transactions</h2>
          {data.recentEarnings.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No transactions yet.</p>
          ) : data.recentEarnings.map(e => (
            <div key={e.id} className="earning-row">
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 500 }}>Order {e.orderId?.slice(0, 16)}…</div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {e.earnedAt ? new Date(e.earnedAt).toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ color: "var(--success)", fontWeight: 700 }}>+${e.fee} {e.currency}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="info-box" style={{ marginTop: 24 }}>
        <strong>🔐 Production Note:</strong> Protect this page with authentication before deploying publicly.
        Add a password check or admin JWT to the <code>/api/admin/earnings</code> route in <code>server.js</code>.
      </div>
    </div>
  );
}
