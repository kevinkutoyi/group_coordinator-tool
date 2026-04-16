import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function PaymentCallbackPage({ params, navigate }) {
  const [status, setStatus]   = useState("verifying"); // verifying | success | failed | error
  const [data, setData]       = useState(null);
  const [groupId, setGroupId] = useState(null);

  useEffect(() => {
    // params can come from URL query string or prop
    const p = params || Object.fromEntries(new URLSearchParams(window.location.search));
    const { orderId, groupId: gid } = p;
    setGroupId(gid);

    if (!orderId) { setStatus("error"); return; }

    api.verifyPesapal(orderId)
      .then(res => {
        setData(res);
        if (res.status === "COMPLETED") setStatus("success");
        else if (res.status === "FAILED") setStatus("failed");
        else setStatus("pending");
      })
      .catch(() => setStatus("error"));
  }, []);

  const icons = { verifying: "⏳", success: "🎉", failed: "❌", pending: "🔄", error: "⚠️" };
  const titles = {
    verifying: "Verifying your payment…",
    success:   "Payment Confirmed!",
    failed:    "Payment Failed",
    pending:   "Payment Pending",
    error:     "Something went wrong",
  };
  const colors = {
    verifying: "var(--muted)",
    success:   "var(--success)",
    failed:    "var(--error)",
    pending:   "var(--warning)",
    error:     "var(--warning)",
  };

  return (
    <div className="fade-in" style={{ maxWidth: 500, margin: "60px auto", textAlign: "center" }}>
      <div style={{ fontSize: "4rem", marginBottom: 16 }}>{icons[status]}</div>
      <h1 style={{ fontFamily: "var(--font-head)", fontSize: "1.8rem", marginBottom: 12, color: colors[status] }}>
        {titles[status]}
      </h1>

      {status === "verifying" && <p style={{ color: "var(--muted)" }}>Checking with PesaPal…</p>}

      {status === "success" && data && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, margin: "20px 0", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--muted)" }}>Amount paid</span>
            <span style={{ fontWeight: 700 }}>${data.memberPays}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--muted)" }}>Organizer receives</span>
            <span style={{ color: "var(--success)", fontWeight: 600 }}>${data.organizerGets}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--muted)" }}>Platform fee</span>
            <span>${data.platformFee}</span>
          </div>
          <p style={{ marginTop: 16, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.6 }}>
            ✅ Your slot is confirmed. The organizer will share your account access details via email.
          </p>
        </div>
      )}

      {status === "failed" && (
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          Your payment was not completed. No charge was made. Please try again.
        </p>
      )}

      {status === "pending" && (
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          Your payment is still being processed. This page will update automatically. You can also check back in a few minutes.
        </p>
      )}

      {status === "error" && (
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          We couldn't verify your payment. If you were charged, please contact support with your order ID.
        </p>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
        {groupId && (
          <button className="btn btn-primary" onClick={() => navigate("group", groupId)}>
            View Group
          </button>
        )}
        <button className="btn btn-outline" onClick={() => navigate("groups")}>
          Browse Groups
        </button>
      </div>
    </div>
  );
}
