import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function UnsubscribePage({ email, navigate }) {
  const [status, setStatus] = useState("loading"); // loading | success | error | resubscribed
  const [error, setError]   = useState("");
  const cleanEmail = (email || "").toLowerCase().trim();

  useEffect(() => {
    if (!cleanEmail) { setStatus("error"); setError("No email provided in the unsubscribe link."); return; }
    api.unsubscribe(cleanEmail)
      .then(() => setStatus("success"))
      .catch(e => { setStatus("error"); setError(e.message || "Network error"); });
  }, [cleanEmail]);

  async function handleResubscribe() {
    try { await api.resubscribe(cleanEmail); setStatus("resubscribed"); }
    catch (e) { setError(e.message || "Could not resubscribe"); }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px" }}>
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        {status === "loading" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>📭</div>
            <h1 className="page-title" style={{ marginBottom: 12 }}>Unsubscribing…</h1>
            <p style={{ color: "var(--muted)" }}>Updating your preferences.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>✅</div>
            <h1 className="page-title" style={{ marginBottom: 12 }}>You've been unsubscribed</h1>
            <p style={{ color: "var(--muted)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>{cleanEmail}</strong> will no longer receive marketing or broadcast emails from SplitSubs.
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 24 }}>
              You'll still get transactional emails about your account, payments, and group activity.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={handleResubscribe}>Changed your mind? Resubscribe</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("home")}>Back to home</button>
            </div>
          </>
        )}

        {status === "resubscribed" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>📬</div>
            <h1 className="page-title" style={{ marginBottom: 12 }}>Welcome back!</h1>
            <p style={{ color: "var(--muted)", marginBottom: 24 }}>
              <strong style={{ color: "var(--text)" }}>{cleanEmail}</strong> is subscribed again.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate("home")}>Back to home</button>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>⚠️</div>
            <h1 className="page-title" style={{ marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: "var(--error)", marginBottom: 24 }}>{error}</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate("home")}>Back to home</button>
          </>
        )}
      </div>
    </div>
  );
}
