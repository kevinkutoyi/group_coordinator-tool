import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import "./GroupEmailPage.css";

const EMAIL_TEMPLATES = [
  {
    label: "📢 General Update",
    subject: "Update for your {service} group",
    body: "Hi everyone,\n\nI wanted to share a quick update about our {service} group.\n\n[Write your update here]\n\nThanks for being part of the group!\n{organizerName}",
  },
  {
    label: "🔑 Access Details",
    subject: "Your {service} access details",
    body: "Hi,\n\nHere are your {service} account access details:\n\nEmail: [shared email]\nPassword: [shared password or invite link]\n\nPlease do not share these credentials with anyone outside the group.\n\nThanks,\n{organizerName}",
  },
  {
    label: "💳 Payment Reminder",
    subject: "Payment reminder — {service} renewal coming up",
    body: "Hi,\n\nThis is a friendly reminder that your {service} subscription renewal is coming up soon.\n\nPlease log in to SplitPass to renew your slot before it expires.\n\nThanks,\n{organizerName}",
  },
  {
    label: "⚠️ Expiry Warning",
    subject: "Action needed — {service} access expiring soon",
    body: "Hi,\n\nYour {service} group access will expire soon. To keep your subscription active, please renew your slot on SplitPass.\n\nIf you do not renew, your slot will be released to other members.\n\nThanks,\n{organizerName}",
  },
];

export default function GroupEmailPage({ groupId, navigate }) {
  const [group, setGroup]       = useState(null);
  const [members, setMembers]   = useState([]);
  const [emails, setEmails]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("compose");
  const [form, setForm]         = useState({ subject:"", body:"", senderEmail:"" });
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState(null);
  const [expBusy, setExpBusy]   = useState(false);

  const isAdmin = session.isSuperAdmin();

  const loadAll = useCallback(async () => {
    try {
      const [g, m, e] = await Promise.all([
        api.getGroup(groupId),
        api.getGroupMembersAdmin(groupId),
        api.getGroupEmails(groupId),
      ]);
      setGroup(g);
      setMembers(m);
      setEmails(e);
    } catch (err) {
      setMsg({ type:"err", text: err.message });
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function applyTemplate(tpl) {
    if (!group) return;
    const replace = s => s
      .replace(/{service}/g, group.serviceName)
      .replace(/{organizerName}/g, group.organizerName);
    setForm(f => ({ ...f, subject: replace(tpl.subject), body: replace(tpl.body) }));
    setMsg(null);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) {
      setMsg({ type:"err", text:"Subject and message body are required." });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const res = await api.sendGroupEmail(groupId, form);
      setMsg({ type:"ok", text: res.message + (res.note ? `\n\n📌 ${res.note}` : "") });
      setForm(f => ({ ...f, subject:"", body:"" }));
      loadAll();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(false); }
  }

  async function sendExpiryReminder(memberId) {
    setExpBusy(true);
    try {
      const res = await api.sendExpiryReminder(groupId, memberId ? { memberId } : { daysThreshold: 30 });
      setMsg({ type:"ok", text: res.message });
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setExpBusy(false); }
  }

  if (loading) return <div style={{ textAlign:"center", padding:60 }}><span className="spinner"/></div>;
  if (!group)  return <div className="info-box">Group not found.</div>;

  const confirmed = members.filter(m => m.paymentStatus === "confirmed");
  const expiring  = confirmed.filter(m => m.daysLeft !== null && m.daysLeft <= 7 && m.daysLeft >= 0);
  const expired   = confirmed.filter(m => m.daysLeft !== null && m.daysLeft < 0);

  return (
    <div className="gep fade-in">
      {/* Header */}
      <div className="gep-header">
        <button className="btn btn-outline btn-sm" onClick={() => navigate("group", groupId)}>
          ← Back to Group
        </button>
        <div>
          <h1 className="page-title" style={{ marginBottom:4 }}>
            {group.serviceIcon} Group Emails
          </h1>
          <p style={{ color:"var(--muted)", fontSize:"0.85rem", margin:0 }}>
            {group.serviceName} — {group.planName} · {confirmed.length} active member{confirmed.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`}
          onClick={() => setMsg(null)}
          style={{ marginBottom:16, whiteSpace:"pre-wrap", cursor:"pointer" }}
        >
          {msg.text} <span style={{ opacity:.4, float:"right" }}>✕</span>
        </div>
      )}

      {/* Tabs */}
      <div className="gep-tabs">
        {[
          { key:"compose", label:"✉️ Compose" },
          { key:"members", label:`👥 Members (${confirmed.length})` },
          { key:"history", label:`📋 Sent (${emails.length})` },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?"active":""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        {expiring.length > 0 && (
          <button className={`tab-btn ${tab==="expiry"?"active":""} tab-btn-warn`} onClick={() => setTab("expiry")}>
            ⚠️ Expiring ({expiring.length + expired.length})
          </button>
        )}
      </div>

      {/* ── Compose tab ── */}
      {tab === "compose" && (
        <div className="gep-layout">
          <form className="card gep-form" onSubmit={handleSend}>
            <div className="form-group">
              <label>Quick Templates</label>
              <div className="template-pills">
                {EMAIL_TEMPLATES.map(tpl => (
                  <button key={tpl.label} type="button" className="tpl-pill"
                    onClick={() => applyTemplate(tpl)}>
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Subject</label>
                <input required value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject:e.target.value }))}
                  placeholder="e.g. Your Spotify access details" />
              </div>
              <div className="form-group">
                <label>Your Reply-To Email</label>
                <input type="email" value={form.senderEmail}
                  onChange={e => setForm(f => ({ ...f, senderEmail:e.target.value }))}
                  placeholder={group.organizerEmail || "your@email.com"} />
              </div>
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                required rows={10}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body:e.target.value }))}
                placeholder="Write your message here…"
                style={{ resize:"vertical" }}
              />
            </div>

            <div className="info-box" style={{ fontSize:"0.8rem", marginBottom:10 }}>
              📬 This email will be sent to <strong>{confirmed.length} confirmed paying member{confirmed.length !== 1?"s":""}</strong> of this group.
              Each member receives a personalised message with their name.
              {process.env.NODE_ENV !== "production" && " Set EMAIL_ENABLED=true in .env to send real emails."}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width:"100%" }} disabled={busy || confirmed.length === 0}>
              {busy
                ? <><span className="spinner"/> Sending…</>
                : confirmed.length === 0
                  ? "No confirmed members to message yet"
                  : `📨 Send to ${confirmed.length} Member${confirmed.length !== 1 ? "s" : ""}`
              }
            </button>
          </form>

          {/* Preview sidebar */}
          <div className="card gep-preview">
            <h2 className="section-h2">Email Preview</h2>
            <div className="email-preview-box">
              <div className="ep-from">From: {group.organizerName} &lt;{form.senderEmail || group.organizerEmail}&gt;</div>
              <div className="ep-subject"><strong>{form.subject || "(no subject)"}</strong></div>
              <hr style={{ border:"none", borderTop:"1px solid var(--border)", margin:"10px 0" }}/>
              <div className="ep-body" style={{ whiteSpace:"pre-wrap" }}>
                {form.body
                  ? `Hi [member name],\n\n${form.body}`
                  : <span style={{ color:"var(--muted)", fontStyle:"italic" }}>Start typing a message…</span>
                }
              </div>
            </div>
            <p style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:10, lineHeight:1.5 }}>
              Each member's name is personalised. The email arrives with the SplitPass branding.
            </p>
          </div>
        </div>
      )}

      {/* ── Members tab ── */}
      {tab === "members" && (
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>Confirmed Paying Members</h2>
          {confirmed.length === 0 ? (
            <div className="empty-state" style={{ padding:"30px 0" }}>
              <div className="emoji">👥</div>
              <h3>No confirmed members yet</h3>
              <p>Members appear here once they complete payment.</p>
            </div>
          ) : confirmed.map(m => {
            const expColor = m.daysLeft === null ? "var(--muted)"
              : m.daysLeft < 0 ? "var(--error)"
              : m.daysLeft <= 7 ? "var(--warning)"
              : "var(--success)";
            const expLabel = m.daysLeft === null ? "No expiry"
              : m.daysLeft < 0 ? "Expired"
              : m.daysLeft === 0 ? "Expires today"
              : `${m.daysLeft}d left`;
            return (
              <div key={m.id} className="member-row">
                <div className="member-avatar">{m.name[0].toUpperCase()}</div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>{m.email}</div>
                  {m.durationLabel && <div style={{ fontSize:"0.7rem", color:"var(--accent)" }}>📅 {m.durationLabel}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"0.78rem", fontWeight:600, color:expColor }}>{expLabel}</div>
                  {m.expiresAt && <div style={{ fontSize:"0.68rem", color:"var(--muted)" }}>{new Date(m.expiresAt).toLocaleDateString()}</div>}
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={expBusy}
                  onClick={() => sendExpiryReminder(m.id)}
                  title="Send expiry reminder to this member"
                >
                  {expBusy ? <span className="spinner"/> : "⏰ Remind"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Expiry tab ── */}
      {tab === "expiry" && (
        <div className="card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <h2 className="section-h2" style={{ margin:0 }}>⚠️ Expiring & Expired Members</h2>
            <button
              className="btn btn-outline btn-sm"
              disabled={expBusy}
              onClick={() => sendExpiryReminder(null)}
            >
              {expBusy ? <><span className="spinner"/> Sending…</> : "📨 Remind All Expiring"}
            </button>
          </div>

          {[...expiring, ...expired].length === 0 ? (
            <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>No members expiring within 7 days. 🎉</p>
          ) : [...expiring, ...expired].map(m => {
            const expColor = m.daysLeft < 0 ? "var(--error)" : m.daysLeft <= 3 ? "var(--accent2)" : "var(--warning)";
            const expLabel = m.daysLeft < 0 ? `Expired ${Math.abs(m.daysLeft)}d ago` : m.daysLeft === 0 ? "Expires TODAY" : `Expires in ${m.daysLeft}d`;
            return (
              <div key={m.id} className="member-row">
                <div className="member-avatar" style={{ background: m.daysLeft < 0 ? "var(--error)" : "var(--warning)", color:"#000" }}>
                  {m.name[0].toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>{m.email}</div>
                </div>
                <span style={{ fontWeight:700, color:expColor, fontSize:"0.82rem" }}>{expLabel}</span>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={expBusy}
                  onClick={() => sendExpiryReminder(m.id)}
                >
                  ⏰ Remind
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>Sent Email Campaigns</h2>
          {emails.length === 0 ? (
            <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>No emails sent to this group yet.</p>
          ) : emails.map(e => (
            <div key={e.id} className="email-history-row">
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{e.subject}</div>
                <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:3 }}>
                  {new Date(e.sentAt).toLocaleString()} · {e.recipientCount} recipients · by {e.senderName}
                </div>
                <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:2, fontStyle:"italic", maxWidth:400 }}>
                  {e.body?.slice(0,120)}{e.body?.length > 120 ? "…" : ""}
                </div>
              </div>
              <span className={`tag ${e.status==="sent"?"tag-open":"tag-pending"}`} style={{ alignSelf:"flex-start" }}>
                {e.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
