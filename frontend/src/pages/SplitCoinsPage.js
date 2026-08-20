import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";

const REASON_LABEL = {
  purchase_buyer:         "Purchase reward",
  purchase_owner:         "Group owner reward",
  purchase_platform:      "Platform share (purchase)",
  first_purchase_buyer:   "First purchase welcome bonus",
  first_purchase_owner:   "Group owner reward (first purchase)",
  first_purchase_platform:"Platform share (first purchase)",
  referral_referrer:      "Referral bonus",
  referral_buyer:         "Referral welcome bonus",
  referral_platform:      "Platform share (referral)",
  redeem_buyer:           "Redeemed at checkout",
  redeem_moderator:       "Redeemed by a buyer (group owner share)",
  redeem_platform:        "Redeemed by a buyer (platform share)",
};

function fmtCoins(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toString().replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export default function SplitCoinsPage({ navigate }) {
  const [data, setData]         = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);

  const isSuperAdmin = session.isSuperAdmin();

  const load = useCallback(() => {
    if (!session.isLoggedIn()) { navigate("login"); return; }
    setLoading(true);
    setError("");
    const calls = [api.getMySplitCoins()];
    if (isSuperAdmin) calls.push(api.getAdminSplitCoins());
    Promise.all(calls)
      .then(([me, admin]) => { setData(me); if (admin) setAdminData(admin); })
      .catch(err => setError(err.message || "Could not load SplitCoins"))
      .finally(() => setLoading(false));
  }, [navigate, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  function copyReferralLink() {
    if (!data?.referralCode) return;
    const link = `${window.location.origin}/signup?ref=${data.referralCode}`;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return (
    <div style={{ textAlign:"center", padding:80 }}>
      <span className="spinner" />
      <p style={{ color:"var(--muted)", marginTop:16, fontSize:"0.85rem" }}>Loading SplitCoins…</p>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth:500, margin:"60px auto", textAlign:"center" }}>
      <div className="info-box">{error}</div>
      <button className="btn btn-outline" style={{ marginTop:16 }} onClick={load}>Try Again</button>
    </div>
  );

  if (!data) return null;

  const referralLink = data.referralCode ? `${window.location.origin}/signup?ref=${data.referralCode}` : null;

  return (
    <div className="fade-in" style={{ maxWidth:920, margin:"0 auto", padding:"32px 20px 64px" }}>
      <h1 className="page-title">🪙 SplitCoins</h1>
      <p className="page-sub">Earned from successful purchases and successful referrals.</p>

      <div className="stats-row" style={{ marginBottom:28 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color:"var(--accent3)" }}>{fmtCoins(data.balance)}</div>
          <div className="stat-label">SplitCoins {isSuperAdmin ? "(Platform)" : "Balance"}</div>
        </div>
        {isSuperAdmin && (
          <div className="stat-card">
            <div className="stat-value">KES {data.kesValue.toLocaleString()}</div>
            <div className="stat-label">Value</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-value" style={{ color:"var(--success)" }}>{fmtCoins(data.earnedFromPurchases)}</div>
          <div className="stat-label">From Purchases</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:"var(--warning)" }}>{fmtCoins(data.earnedFromReferrals)}</div>
          <div className="stat-label">From Referrals</div>
        </div>
      </div>

      {referralLink && (
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"18px 20px", marginBottom:28 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Invite friends, earn SplitCoins</div>
          <p style={{ color:"var(--muted)", fontSize:"0.85rem", margin:"0 0 12px" }}>
            When someone signs up with your link and completes their first purchase, you earn 2 SplitCoins.
          </p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <input readOnly value={referralLink} onFocus={e => e.target.select()}
              style={{ flex:"1 1 260px", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg3)", color:"var(--text)", fontSize:"0.82rem" }} />
            <button className="btn btn-primary btn-sm" onClick={copyReferralLink}>{copied ? "✅ Copied" : "📋 Copy Link"}</button>
          </div>
        </div>
      )}

      {isSuperAdmin && adminData && (
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"18px 20px", marginBottom:28 }}>
          <div style={{ fontWeight:700, marginBottom:10 }}>Platform-wide totals</div>
          <div style={{ display:"flex", gap:24, flexWrap:"wrap", fontSize:"0.85rem" }}>
            <span><strong>{fmtCoins(adminData.totalMinted)}</strong> coins ever minted <span style={{ color:"var(--muted)" }}>(KES {adminData.totalKesValue.toLocaleString()})</span></span>
            <span><strong>{adminData.transactionCount}</strong> ledger transactions</span>
          </div>
          {Object.keys(adminData.byReason || {}).length > 0 && (
            <div style={{ marginTop:12, display:"flex", gap:16, flexWrap:"wrap", fontSize:"0.78rem", color:"var(--muted)" }}>
              {Object.entries(adminData.byReason).map(([reason, amt]) => (
                <span key={reason}>{REASON_LABEL[reason] || reason}: <strong style={{ color:"var(--text)" }}>{fmtCoins(amt)}</strong></span>
              ))}
            </div>
          )}
        </div>
      )}

      <h3 style={{ margin:"8px 0 12px" }}>Transaction history</h3>
      {data.history.length === 0 ? (
        <div className="info-box">No SplitCoins earned yet. Purchase a group slot or refer a friend to start earning.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.84rem" }}>
            <thead>
              <tr style={{ textAlign:"left", color:"var(--muted)", borderBottom:"1px solid var(--border)" }}>
                <th style={{ padding:"8px 10px" }}>Date</th>
                <th style={{ padding:"8px 10px" }}>Reason</th>
                <th style={{ padding:"8px 10px", textAlign:"right" }}>Coins</th>
                {isSuperAdmin && <th style={{ padding:"8px 10px", textAlign:"right" }}>KES</th>}
              </tr>
            </thead>
            <tbody>
              {data.history.map(row => (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"8px 10px", color:"var(--muted)" }}>{new Date(row.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</td>
                  <td style={{ padding:"8px 10px" }}>{REASON_LABEL[row.reason] || row.reason}</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:600, color: row.amount < 0 ? "var(--error)" : "var(--success)" }}>
                    {row.amount < 0 ? "" : "+"}{fmtCoins(row.amount)}
                  </td>
                  {isSuperAdmin && <td style={{ padding:"8px 10px", textAlign:"right", color:"var(--muted)" }}>{(row.amount * 10).toLocaleString()}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
