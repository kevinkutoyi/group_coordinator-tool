import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import "./AdminDashboardPage.css";

export default function AdminDashboardPage({ navigate }) {
  const [tab, setTab]           = useState("pending");
  const [pending, setPending]   = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState({});
  const [msg, setMsg]           = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [subscribers, setSubscribers]   = useState(null);
  const [nlHistory, setNlHistory]       = useState([]);
  const [nlForm, setNlForm]             = useState({ subject:"", body:"", senderName:"", senderEmail:"" });
  const [nlBusy, setNlBusy]             = useState(false);
  const [nlMsg, setNlMsg]               = useState(null);
  const [groups, setGroups]         = useState([]);
  const [pendingGroups, setPGroups]   = useState([]);
  const [reviewBusy, setReviewBusy]   = useState({});
  const [reviewNote, setReviewNote]   = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [orgEmailForm, setOrgEmailForm] = useState({ subject:"", body:"", senderEmail:"" });
  const [orgEmailBusy, setOrgEmailBusy] = useState(false);
  const [orgEmailMsg, setOrgEmailMsg]   = useState(null);
  const [orgEmailHistory, setOrgEmailHistory] = useState([]);

  // Delete group
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy]       = useState(false);

  // Payouts
  const [payoutQueue, setPayoutQueue]   = useState([]);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [payoutBusy, setPayoutBusy]     = useState({});
  const [payoutMsg, setPayoutMsg]       = useState(null);
  const [feePercent, setFeePercent]     = useState(8);
  const [feeInput, setFeeInput]         = useState("8");
  const [feeBusy, setFeeBusy]           = useState(false);
  const [feeMsg, setFeeMsg]             = useState(null);

  // Search + pending payments
  const [searchEmail, setSearchEmail]         = useState("");
  const [pendingPayments, setPendingPayments] = useState([]);

  // Expired subscriptions
  const [expiredMembers, setExpiredMembers] = useState([]);
  const [expiredLoading, setExpiredLoading] = useState(false);
  const [expiredMsg, setExpiredMsg]         = useState(null);
  const [remindAllBusy, setRemindAllBusy]   = useState(false);

  // User email modal
  const [profileTarget, setProfileTarget] = useState(null);
  const [profileData, setProfileData]     = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [emailTarget, setEmailTarget]   = useState(null);
  const [emailForm, setEmailForm]       = useState({ subject: "", body: "" });
  const [emailBusy, setEmailBusy]       = useState(false);
  const [emailModalMsg, setEmailModalMsg] = useState(null);

  useEffect(() => {
    if (!session.isSuperAdmin()) { navigate("admin-login"); return; }
    loadAll();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u, g, subs, hist, pg, oeh, pq, ph, as_] = await Promise.all([
        api.getPendingMods(), api.getUsers(), api.getGroups(),
        api.getSubscribers(), api.getNewsletterHistory(),
        api.getPendingGroups(), api.getOrganizerEmailHistory(),
        api.getPayoutQueue(), api.getPayoutHistory(), api.getAdminSettings(),
      ]);
      setPending(p); setAllUsers(u); setGroups(g); setSubscribers(subs);
      setNlHistory(hist); setPGroups(pg); setOrgEmailHistory(oeh);
      setPayoutQueue(pq?.queue || []); setPayoutHistory(ph || []);
      const fee = as_?.feePercent ?? 8;
      setFeePercent(fee); setFeeInput(String(fee));
    } catch { navigate("admin-login"); }
    finally { setLoading(false); }
  }, [navigate]);

  async function demote(uid) {
    setBusy(b => ({ ...b, [uid]: true }));
    try {
      await api.demoteToCustomer(uid);
      const data = await api.getUsers();
      setAllUsers(data);
    } catch (err) { alert(err.message); }
    finally { setBusy(b => ({ ...b, [uid]: false })); }
  }

  async function approve(id) {
    setBusy(b => ({...b, [id]: true}));
    try {
      await api.approveUser(id);
      setMsg({ type:"ok", text:"Moderator approved! They can now log in and create groups." });
      loadAll();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(b => ({...b, [id]: false})); }
  }

  async function reject(id) {
    setBusy(b => ({...b, [id]: true}));
    try {
      await api.rejectUser(id, rejectReason);
      setMsg({ type:"ok", text:"Moderator application rejected." });
      setRejectId(null); setRejectReason("");
      loadAll();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(b => ({...b, [id]: false})); }
  }

  async function suspend(id) {
    if (!window.confirm("Suspend this user?")) return;
    try { await api.suspendUser(id); loadAll(); } catch (err) { setMsg({ type:"err", text: err.message }); }
  }

  async function loadExpiredMembers() {
    setExpiredLoading(true); setExpiredMsg(null);
    try { const data = await api.getExpiredMembers(); setExpiredMembers(data); }
    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setExpiredLoading(false); }
  }

  async function remindExpiredAll() {
    if (!window.confirm("Send renewal reminders to all " + expiredMembers.length + " expired members?")) return;
    setRemindAllBusy(true); setExpiredMsg(null);
    try { const r = await api.remindExpiredAll(); setExpiredMsg({ type: "ok", text: r.message }); loadExpiredMembers(); }
    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setRemindAllBusy(false); }
  }

  async function remindExpiredOne(memberId) {
    setBusy(b => ({ ...b, [memberId]: true })); setExpiredMsg(null);
    try { const r = await api.remindExpiredMember(memberId); setExpiredMsg({ type: "ok", text: r.message }); }
    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setBusy(b => ({ ...b, [memberId]: false })); }
  }

  async function loadProfile(user) {
    setProfileTarget(user);
    setProfileData(null);
    setProfileLoading(true);
    try {
      const data = await api.getUserProfile(user.id);
      setProfileData(data);
    } catch (err) { console.error(err); }
    finally { setProfileLoading(false); }
  }

  async function sendEmailToUser() {
    if (!emailTarget || !emailForm.subject || !emailForm.body) return;
    setEmailBusy(true); setEmailModalMsg(null);
    try {
      const r = await api.sendUserEmail({ userId: emailTarget.id, subject: emailForm.subject, body: emailForm.body });
      setEmailModalMsg({ type: "ok", text: r.message });
      setEmailForm({ subject: "", body: "" });
    } catch (err) { setEmailModalMsg({ type: "err", text: err.message }); }
    finally { setEmailBusy(false); }
  }

  async function deleteExpiredMember(memberId, name) {
    if (!window.confirm("Remove " + name + " from this group? This will delete their membership record.")) return;
    setBusy(b => ({ ...b, ["del_" + memberId]: true })); setExpiredMsg(null);
    try {
      await api.deleteGroupMember(memberId);
      setExpiredMsg({ type: "ok", text: name + " removed successfully." });
      loadExpiredMembers();
    } catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setBusy(b => ({ ...b, ["del_" + memberId]: false })); }
  }

  async function sendPaymentReminder(memberId) {
    setBusy(b => ({...b, [memberId]: true}));
    try {
      const r = await api.remindPendingPayment(memberId);
      setMsg({ type:"ok", text: r.message });
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(b => ({...b, [memberId]: false})); }
  }

  async function handleDeleteGroup() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") { setMsg({ type:"err", text:"Type DELETE to confirm." }); return; }
    setDeleteBusy(true);
    try {
      const r = await api.deleteGroup(deleteTarget.id);
      const d = r.deleted || {};
      setMsg({ type:"ok", text:`Deleted "${d.serviceName||""} — ${d.planName||""}". Removed ${d.members||0} members, ${d.payments||0} payments, ${d.pesapalOrders||0} orders, ${d.platformEarnings||0} earnings.` });
      setDeleteTarget(null); setDeleteConfirm(""); loadAll();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setDeleteBusy(false); }
  }

  const filtered = allUsers.filter(u => {
    if (tab === "pending")    return u.role === "moderator" && u.status === "pending";
    if (tab === "moderators") return u.role === "moderator";
    if (tab === "customers")  return u.role === "customer";
    if (tab === "groups")     return false; // handled separately
    if (tab === "pending-payments") return false; // handled separately
    return true;
  }).filter(u => !searchEmail.trim() || u.email.toLowerCase().includes(searchEmail.toLowerCase().trim()));

  const filteredPendingPayments = pendingPayments.filter(pp =>
    !searchEmail.trim() || pp.email.toLowerCase().includes(searchEmail.toLowerCase().trim()) || pp.name?.toLowerCase().includes(searchEmail.toLowerCase().trim())
  );

  const statusColor = { active:"var(--success)", pending:"var(--warning)", suspended:"var(--error)" };
  const roleBg = { customer:"rgba(74,222,128,0.12)", moderator:"rgba(124,106,255,0.12)", superadmin:"rgba(255,106,142,0.12)" };
  const roleColor = { customer:"var(--success)", moderator:"var(--accent)", superadmin:"var(--accent2)" };

  if (loading) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;

  return (
    <div className="admin-page fade-in">
      <div className="admin-header">
        <div>
          <h1 className="page-title">🛡️ Admin Dashboard</h1>
          <p className="page-sub" style={{marginBottom:0}}>Manage users, approve moderators, oversee platform</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-outline btn-sm" onClick={loadAll}>↻ Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("earnings")}>💰 Earnings</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-row" style={{marginBottom:28}}>
        <div className="stat-card">
          <div className="stat-value" style={{color:"var(--warning)"}}>{pending.length}</div>
          <div className="stat-label">Pending Approvals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{allUsers.filter(u=>u.role==="moderator").length}</div>
          <div className="stat-label">Moderators</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{allUsers.filter(u=>u.role==="customer").length}</div>
          <div className="stat-label">Customers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:"var(--error)"}}>{allUsers.filter(u=>u.status==="suspended").length}</div>
          <div className="stat-label">Suspended</div>
        </div>
      </div>

      {msg && <div className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:16}} onClick={()=>setMsg(null)}>{msg.text} <span style={{opacity:.4}}>✕</span></div>}

      {/* Tabs */}
      <div className="admin-tabs">
        {[
          {key:"pending",    label:`Pending (${pending.length})`},
          {key:"moderators", label:"Moderators"},
          {key:"customers",  label:"Customers"},
          {key:"all",        label:"All Users"},
          {key:"groups",     label:`Groups (${groups.length})`},
          {key:"newsletter",  label:`📧 Newsletter${subscribers ? ` (${subscribers.total})` : ""}`},
          {key:"group-review", label:`🔍 Group Review (${pendingGroups.length})`},
          {key:"org-email",    label:"✉️ Email Organizers"},
          {key:"pending-payments", label:`💳 Pending Payments${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ""}`},
          {key:"payouts",       label:`💸 Payouts${payoutQueue.length > 0 ? ` (${payoutQueue.length})` : ""}`},
          {key:"expired", label:"🔴 Expired" + (expiredMembers.length > 0 ? " (" + expiredMembers.length + ")" : "")},
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?"active":""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Search bar (visible on user-list and pending-payments tabs) */}
      {["pending","moderators","customers","all","pending-payments"].includes(tab) && (
        <div style={{ marginBottom:16 }}>
          <input
            type="search"
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            placeholder="🔍 Search by email or name…"
            style={{ width:"100%", padding:"11px 16px", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:10, color:"var(--text)", fontSize:"0.92rem", outline:"none" }}
          />
          {searchEmail.trim() && (
            <p style={{ fontSize:"0.78rem", color:"var(--muted)", margin:"6px 4px 0 4px" }}>
              Filtering by &ldquo;{searchEmail}&rdquo; · {tab === "pending-payments" ? `${filteredPendingPayments.length} pending payment${filteredPendingPayments.length !== 1 ? "s" : ""}` : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
              <button className="btn btn-sm btn-outline" style={{ marginLeft:10, padding:"2px 10px" }} onClick={() => setSearchEmail("")}>Clear</button>
            </p>
          )}
        </div>
      )}

      {/* Pending Payments tab */}
      {tab === "pending-payments" && (
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom:8 }}>💳 Pending Payments</h2>
          <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:18 }}>
            Members who joined a group but haven&rsquo;t completed payment. Click <strong>🔔 Send Reminder</strong> to nudge them with a personalised email.
          </p>
          {filteredPendingPayments.length === 0 ? (
            <div className="empty-state">
              <div className="emoji">✅</div>
              <h3>{searchEmail.trim() ? "No matches" : "No pending payments"}</h3>
              <p>{searchEmail.trim() ? "Try a different search." : "All joiners have either paid or expired out."}</p>
            </div>
          ) : filteredPendingPayments.map(pp => (
            <div key={pp.id} className="card" style={{ marginBottom:12, padding:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                <div className="user-av">{pp.name?.[0]?.toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600 }}>{pp.name}</div>
                  <div style={{ fontSize:"0.78rem", color:"var(--muted)", wordBreak:"break-all" }}>{pp.email}</div>
                  <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:4 }}>
                    {pp.group.serviceIcon} <strong style={{ color:"var(--text)" }}>{pp.group.serviceName} — {pp.group.planName}</strong>
                    {" · "}${pp.memberPays}{pp.durationLabel ? ` · ${pp.durationLabel}` : ""}
                  </div>
                  <div style={{ fontSize:"0.74rem", color: pp.daysWaiting >= 3 ? "var(--error)" : "var(--warning)", marginTop:2 }}>
                    ⏳ Pending {pp.daysWaiting} day{pp.daysWaiting !== 1 ? "s" : ""}
                    {" · "}joined {new Date(pp.joinedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy[pp.id]}
                  onClick={() => sendPaymentReminder(pp.id)}
                  style={{ whiteSpace:"nowrap" }}
                >
                  {busy[pp.id] ? <><span className="spinner"/> Sending…</> : "🔔 Send Reminder"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User list */}
      {!["pending-payments","groups","newsletter","group-review","org-email","payouts","expired"].includes(tab) && (filtered.length === 0 ? (
        <div className="empty-state"><div className="emoji">✅</div><h3>Nothing here</h3><p>No users in this category.</p></div>
      ) : (
        <div className="admin-user-list">
          {filtered.map(u => (
            <div key={u.id} className="user-card card">
              <div className="user-card-left">
                <div className="user-av">{u.name?.[0]?.toUpperCase()}</div>
                <div>
                  <div className="user-card-name">{u.name}</div>
                  <div className="user-card-email">{u.email}</div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                    Joined {new Date(u.createdAt).toLocaleDateString()}
                    {u.approvedAt && ` · Approved ${new Date(u.approvedAt).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              <div className="user-card-right">
                <span className="tag" style={{background:roleBg[u.role], color:roleColor[u.role], border:"none"}}>{u.role}</span>
                <span className="tag" style={{color:statusColor[u.status]||"var(--muted)", background:"var(--bg3)", border:"1px solid var(--border)"}}>
                  {u.status}
                </span>
                {u.role === "moderator" && u.status === "pending" && (
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-sm btn-primary" disabled={busy[u.id]} onClick={() => approve(u.id)}>
                      {busy[u.id] ? <span className="spinner"/> : "✅ Approve"}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => setRejectId(u.id)}>❌ Reject</button>
                  </div>
                )}
                {u.status === "active" && u.role === "customer" && (
                  <button className="btn btn-sm btn-outline" disabled={busy[u.id]} onClick={() => promote(u.id)}
                    style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}>
                    {busy[u.id] ? <span className="spinner"/> : "🛡️ Make Moderator"}
                  </button>
                )}
                {u.status === "active" && u.role === "moderator" && (
                  <button className="btn btn-sm btn-outline" disabled={busy[u.id]} onClick={() => {
                    if (window.confirm("Demote " + u.name + " from moderator to customer? They will lose moderator privileges.")) demote(u.id);
                  }} style={{ borderColor:"rgba(251,191,36,0.3)", color:"var(--warning)" }}>
                    {busy[u.id] ? <span className="spinner"/> : "👤 Make Customer"}
                  </button>
                )}
                {u.status === "active" && u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-danger" disabled={busy[u.id]} onClick={() => suspend(u.id)}>
                    {busy[u.id] ? <span className="spinner"/> : "⛔ Suspend"}
                  </button>
                )}
                {u.status === "suspended" && u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-primary" disabled={busy[u.id]} onClick={() => unsuspend(u.id)}>
                    {busy[u.id] ? <span className="spinner"/> : "✅ Unsuspend"}
                  </button>
                )}
                {u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-outline" style={{borderColor:"rgba(124,106,255,0.3)",color:"var(--accent)"}}
                {u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-outline"
                    style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}
                    onClick={() => loadProfile(u)}>
                    👤 Profile
                  </button>
                )}
                    onClick={() => { setEmailTarget(u); setEmailForm({ subject: "", body: "" }); setEmailModalMsg(null); }}>
                    ✉️ Email
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ── Newsletter tab ── */}
      {tab === "newsletter" && (
        <div className="newsletter-panel">
          {/* Subscriber counts */}
          <div className="stats-row" style={{marginBottom:24}}>
            <div className="stat-card">
              <div className="stat-value" style={{color:"var(--accent)"}}>{subscribers?.subscribers?.length || 0}</div>
              <div className="stat-label">Registered Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{color:"var(--accent2)"}}>{subscribers?.footerSubs?.length || 0}</div>
              <div className="stat-label">Footer Sign-ups</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{color:"var(--accent3)"}}>{subscribers?.total || 0}</div>
              <div className="stat-label">Total Subscribers</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{nlHistory.length}</div>
              <div className="stat-label">Campaigns Sent</div>
            </div>
          </div>

          <div className="nl-grid">
            {/* Compose form */}
            <div className="card">
              <h2 className="section-h2" style={{marginBottom:16}}>✉️ Compose Newsletter</h2>

              <div className="form-row">
                <div className="form-group">
                  <label>Sender Name</label>
                  <input value={nlForm.senderName} onChange={e=>setNlForm(f=>({...f,senderName:e.target.value}))} placeholder="SplitSubs Team" />
                </div>
                <div className="form-group">
                  <label>Sender Email</label>
                  <input type="email" value={nlForm.senderEmail} onChange={e=>setNlForm(f=>({...f,senderEmail:e.target.value}))} placeholder="newsletter@splitsubs.com" />
                </div>
              </div>

              <div className="form-group">
                <label>Subject</label>
                <input value={nlForm.subject} onChange={e=>setNlForm(f=>({...f,subject:e.target.value}))} placeholder="e.g. New Spotify groups available this week!" />
              </div>

              <div className="form-group">
                <label>Message Body</label>
                <textarea rows={8} value={nlForm.body} onChange={e=>setNlForm(f=>({...f,body:e.target.value}))}
                  placeholder={"Hi {name},\n\nWe have exciting new groups available...\n\nCheck them out at splitsubs.com\n\nBest,\nThe SplitSubs Team"}
                  style={{resize:"vertical", fontFamily:"monospace", fontSize:"0.82rem"}} />
              </div>

              {nlMsg && (
                <div className={`msg-box ${nlMsg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:12}} onClick={()=>setNlMsg(null)}>
                  {nlMsg.text} <span style={{opacity:.4}}>✕</span>
                </div>
              )}

              <div className="info-box" style={{marginBottom:12,fontSize:"0.78rem"}}>
                <strong>📌 Note:</strong> This logs the campaign to the database. To actually deliver emails,
                connect <strong>Resend</strong>, <strong>Mailgun</strong>, or <strong>SendGrid</strong> in
                <code style={{background:"var(--bg3)",padding:"1px 5px",borderRadius:4}}> backend/src/server.js</code> at the <code style={{background:"var(--bg3)",padding:"1px 5px",borderRadius:4}}>/api/admin/newsletter/send</code> route.
              </div>

              <button className="btn btn-primary" style={{width:"100%"}} disabled={nlBusy || !nlForm.subject || !nlForm.body}
                onClick={async () => {
                  setNlBusy(true); setNlMsg(null);
                  try {
                    const r = await api.sendNewsletter(nlForm);
                    setNlMsg({type:"ok", text:r.message});
                    setNlForm(f=>({...f,subject:"",body:""}));
                    const hist = await api.getNewsletterHistory();
                    setNlHistory(hist);
                  } catch(err) { setNlMsg({type:"err",text:err.message}); }
                  finally { setNlBusy(false); }
                }}>
                {nlBusy ? <><span className="spinner"/> Sending…</> : `📨 Send to ${subscribers?.total || 0} Subscribers`}
              </button>
            </div>

            {/* Campaign history + subscriber list */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="card">
                <h2 className="section-h2" style={{marginBottom:12}}>📋 Campaign History</h2>
                {nlHistory.length === 0 ? (
                  <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No campaigns sent yet.</p>
                ) : nlHistory.map(c => (
                  <div key={c.id} className="earning-row">
                    <div>
                      <div style={{fontWeight:600,fontSize:"0.85rem"}}>{c.subject}</div>
                      <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>
                        {new Date(c.sentAt).toLocaleString()} · {c.recipientCount} recipients
                      </div>
                      <div style={{fontSize:"0.7rem",color:"var(--muted)"}}>From: {c.senderEmail}</div>
                    </div>
                    <span className="tag" style={{background:"rgba(74,222,128,0.1)",color:"var(--success)",border:"none",fontSize:"0.7rem"}}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2 className="section-h2" style={{marginBottom:12}}>👥 Recent Subscribers</h2>
                {(subscribers?.subscribers || []).slice(0,8).map(s => (
                  <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:"0.8rem"}}>
                    <span>{s.name} <span style={{color:"var(--muted)"}}>({s.role})</span></span>
                    <span style={{color:"var(--muted)",fontSize:"0.72rem"}}>{s.email}</span>
                  </div>
                ))}
                {(subscribers?.footerSubs || []).slice(0,5).map(s => (
                  <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:"0.8rem"}}>
                    <span style={{color:"var(--muted)"}}>Footer sign-up</span>
                    <span style={{color:"var(--muted)",fontSize:"0.72rem"}}>{s.email}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Groups tab ── */}
      {tab === "groups" && (
        <div className="admin-user-list">
          {groups.length === 0 ? (
            <div className="empty-state"><div className="emoji">📋</div><h3>No groups yet</h3></div>
          ) : groups.map(g => (
            <div key={g.id} className="user-card card" style={{cursor:"pointer"}} onClick={() => navigate("group", g.id)}>
              <div className="user-card-left">
                <div style={{fontSize:"2rem"}}>{g.serviceIcon}</div>
                <div>
                  <div className="user-card-name">{g.serviceName} — {g.planName}</div>
                  <div className="user-card-email">Organizer: {g.organizerName} · {g.memberCount || 0}/{g.maxSlots} members</div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                    ${g.pricePerSlot}/member/mo · Created {new Date(g.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="user-card-right">
                <span className={`tag tag-${g.status}`}>{g.status}</span>
                <button className="btn btn-sm btn-outline" onClick={e => {e.stopPropagation(); navigate("group", g.id);}}>
                  Manage →
                </button>
                <button className="btn btn-sm btn-danger" title="Delete this group permanently" onClick={e => { e.stopPropagation(); setDeleteTarget(g); setDeleteConfirm(""); }}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Group Review tab ── */}
      {tab === "group-review" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 className="section-h2" style={{margin:0}}>🔍 Groups Awaiting Review</h2>
            <button className="btn btn-sm btn-outline" onClick={loadAll}>↻ Refresh</button>
          </div>
          {pendingGroups.length === 0 ? (
            <div className="empty-state"><div className="emoji">✅</div><h3>All clear!</h3><p>No groups pending review.</p></div>
          ) : pendingGroups.map(g => (
            <div key={g.id} className="user-card card" style={{marginBottom:12}}>
              <div className="user-card-left" style={{flexWrap:"wrap",gap:12}}>
                <span style={{fontSize:"2.2rem"}}>{g.serviceIcon}</span>
                <div>
                  <div className="user-card-name">{g.serviceName} — {g.planName}</div>
                  <div className="user-card-email">
                    {g.billingCycle} · ${g.pricePerSlot}/slot · {g.maxSlots} slots max
                  </div>
                  {g.organizerDetails && (
                    <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                      Organizer: {g.organizerDetails.name} ({g.organizerDetails.email})
                    </div>
                  )}
                  {g.description && (
                    <div style={{fontSize:"0.75rem",color:"var(--muted)",marginTop:4,maxWidth:400,fontStyle:"italic"}}>
                      "{g.description}"
                    </div>
                  )}
                  <div style={{fontSize:"0.7rem",color:"var(--muted)",marginTop:2}}>
                    Submitted {new Date(g.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="user-card-right">
                <button className="btn btn-sm btn-primary" disabled={reviewBusy[g.id]}
                  onClick={async () => {
                    setReviewBusy(b=>({...b,[g.id]:true}));
                    try { await api.reviewGroup(g.id,{decision:"approved",note:""}); setMsg({type:"ok",text:"Group approved and is now live!"}); loadAll(); }
                    catch(err) { setMsg({type:"err",text:err.message}); }
                    finally { setReviewBusy(b=>({...b,[g.id]:false})); }
                  }}>
                  {reviewBusy[g.id] ? <span className="spinner"/> : "✅ Approve"}
                </button>
                <button className="btn btn-sm btn-danger"
                  onClick={() => setReviewTarget(g)}>
                  ❌ Reject
                </button>
                <button className="btn btn-sm btn-outline"
                  onClick={() => navigate("group", g.id)}>
                  👁️ Preview
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Email Organizers tab ── */}
      {tab === "org-email" && (
        <div className="nl-grid">
          <div className="card">
            <h2 className="section-h2" style={{marginBottom:16}}>✉️ Email All Active Organizers</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Reply-To Email</label>
                <input type="email" value={orgEmailForm.senderEmail}
                  onChange={e=>setOrgEmailForm(f=>({...f,senderEmail:e.target.value}))}
                  placeholder="admin@splitsubs.com"/>
              </div>
              <div className="form-group">
                <label>Subject</label>
                <input value={orgEmailForm.subject}
                  onChange={e=>setOrgEmailForm(f=>({...f,subject:e.target.value}))}
                  placeholder="e.g. Important platform update"/>
              </div>
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea rows={8} value={orgEmailForm.body}
                onChange={e=>setOrgEmailForm(f=>({...f,body:e.target.value}))}
                placeholder={"Hi {name},\n\nWrite your message to all organizers here...\n\n— SplitSubs Admin"}
                style={{resize:"vertical",fontFamily:"monospace",fontSize:"0.82rem"}}/>
            </div>
            {orgEmailMsg && (
              <div className={`msg-box ${orgEmailMsg.type==="ok"?"msg-ok":"msg-err"}`}
                style={{marginBottom:12}} onClick={()=>setOrgEmailMsg(null)}>
                {orgEmailMsg.text} <span style={{opacity:.4}}>✕</span>
              </div>
            )}
            <button className="btn btn-primary" style={{width:"100%"}}
              disabled={orgEmailBusy || !orgEmailForm.subject || !orgEmailForm.body}
              onClick={async () => {
                setOrgEmailBusy(true); setOrgEmailMsg(null);
                try {
                  const r = await api.emailOrganizers(orgEmailForm);
                  setOrgEmailMsg({type:"ok", text:r.message + (r.note ? `\n📌 ${r.note}` : "")});
                  setOrgEmailForm(f=>({...f,subject:"",body:""}));
                  loadAll();
                } catch(err) { setOrgEmailMsg({type:"err",text:err.message}); }
                finally { setOrgEmailBusy(false); }
              }}>
              {orgEmailBusy ? <><span className="spinner"/> Sending…</> : `📨 Send to All Active Organizers`}
            </button>
          </div>
          <div className="card">
            <h2 className="section-h2" style={{marginBottom:12}}>📋 Email History</h2>
            {orgEmailHistory.length === 0 ? (
              <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No organizer emails sent yet.</p>
            ) : orgEmailHistory.map(e => (
              <div key={e.id} className="earning-row">
                <div>
                  <div style={{fontWeight:600,fontSize:"0.85rem"}}>{e.subject}</div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>
                    {new Date(e.sentAt).toLocaleString()} · {e.recipientCount} recipients
                  </div>
                </div>
                <span className="tag tag-open" style={{fontSize:"0.7rem"}}>{e.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review reject modal */}
      {reviewTarget && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setReviewTarget(null)}>
          <div className="modal">
            <h3>Reject Group</h3>
            <p style={{color:"var(--muted)",fontSize:"0.84rem",marginBottom:16}}>
              Rejecting: <strong>{reviewTarget.serviceName} — {reviewTarget.planName}</strong>
            </p>
            <div className="form-group">
              <label>Reason for rejection (sent to organizer)</label>
              <textarea rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
                placeholder="e.g. Price is too high, description is incomplete, or service not supported"
                style={{resize:"vertical"}}/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={()=>{setReviewTarget(null);setReviewNote("");}}>Cancel</button>
              <button className="btn btn-danger"
                disabled={reviewBusy[reviewTarget.id]}
                onClick={async () => {
                  setReviewBusy(b=>({...b,[reviewTarget.id]:true}));
                  try {
                    await api.reviewGroup(reviewTarget.id,{decision:"rejected",note:reviewNote});
                    setMsg({type:"ok",text:"Group rejected. Organizer has been notified."});
                    setReviewTarget(null); setReviewNote(""); loadAll();
                  } catch(err) { setMsg({type:"err",text:err.message}); }
                  finally { setReviewBusy(b=>({...b,[reviewTarget.id]:false})); }
                }}>
                {reviewBusy[reviewTarget?.id] ? <span className="spinner"/> : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Delete group modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && !deleteBusy && setDeleteTarget(null)}>
          <div className="modal">
            <h3 style={{color:"var(--error)"}}>🗑️ Delete Group Permanently</h3>
            <p style={{color:"var(--muted)",fontSize:"0.84rem",marginBottom:12}}>You are about to delete:</p>
            <div style={{background:"rgba(255,106,142,0.08)",border:"1px solid rgba(255,106,142,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:"0.95rem"}}>{deleteTarget.serviceIcon} {deleteTarget.serviceName} — {deleteTarget.planName}</div>
              <div style={{fontSize:"0.76rem",color:"var(--muted)",marginTop:4}}>Organizer: {deleteTarget.organizerName} · {deleteTarget.memberCount || 0}/{deleteTarget.maxSlots} members · status <code>{deleteTarget.status}</code></div>
            </div>
            <div style={{background:"rgba(255,180,0,0.08)",border:"1px solid rgba(255,180,0,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:"0.82rem",lineHeight:1.55}}>
              <strong>⚠️ This is irreversible.</strong> The following will be wiped:
              <ul style={{margin:"8px 0 0 18px",padding:0}}>
                <li>The group itself</li><li>All members and their roles</li><li>All credential vault slots</li>
                <li>All payments and PesaPal orders for this group</li><li>All platform earnings for this group</li><li>All emails sent to this group</li>
              </ul>
              <div style={{marginTop:8,color:"var(--muted)"}}>Members will <strong>not</strong> be auto-refunded.</div>
            </div>
            <div className="form-group">
              <label>Type <strong>DELETE</strong> to confirm</label>
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" autoFocus disabled={deleteBusy}/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" disabled={deleteBusy} onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}>Cancel</button>
              <button className="btn btn-danger" disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== "DELETE"} onClick={handleDeleteGroup}>
                {deleteBusy ? <span className="spinner"/> : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}

{/* ── Payouts tab ── */}
      {tab === "payouts" && (
        <div>
          {/* Sunday reminder banner */}
          {new Date().getDay() === 0 && (
            <div style={{
              background:"rgba(124,106,255,0.12)", border:"1px solid rgba(124,106,255,0.3)",
              borderRadius:12, padding:"14px 20px", marginBottom:20,
              display:"flex", alignItems:"center", gap:12, fontSize:"0.88rem"
            }}>
              <span style={{fontSize:"1.4rem"}}>🎉</span>
              <div>
                <strong>It's Sunday — Payout Day!</strong>
                <div style={{color:"var(--muted)",fontSize:"0.78rem",marginTop:2}}>
                  Review the queue below and send each moderator their earnings via PesaPal.
                </div>
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:20,marginBottom:20,alignItems:"start"}}>
            {/* Platform fee editor */}
            <div className="card">
              <h2 className="section-h2" style={{marginBottom:14}}>⚙️ Platform Fee</h2>
              <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:14}}>
                This percentage is deducted from every payment. The remainder is owed to the group moderator and queued here every Sunday.
              </p>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <input
                  type="number" min="1" max="50" step="0.5"
                  className="form-input"
                  value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  style={{width:100,fontWeight:700,fontSize:"1.1rem",textAlign:"center"}}
                />
                <span style={{color:"var(--muted)",fontSize:"0.9rem"}}>%</span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={feeBusy}
                  onClick={async () => {
                    setFeeBusy(true); setFeeMsg(null);
                    try {
                      const r = await api.updateFeePercent(parseFloat(feeInput));
                      setFeePercent(r.feePercent);
                      setFeeMsg({type:"ok", text:`Platform fee updated to ${r.feePercent}%`});
                      loadAll();
                    } catch(err) { setFeeMsg({type:"err", text:err.message}); }
                    finally { setFeeBusy(false); }
                  }}>
                  {feeBusy ? <span className="spinner"/> : "Save"}
                </button>
              </div>
              {feeMsg && (
                <div className={`msg-box ${feeMsg.type==="ok"?"msg-ok":"msg-err"}`}
                  style={{marginTop:12}} onClick={()=>setFeeMsg(null)}>
                  {feeMsg.text} <span style={{opacity:.4}}>✕</span>
                </div>
              )}
            </div>

            {/* Payout summary */}
            <div className="card">
              <h2 className="section-h2" style={{marginBottom:14}}>📊 Summary</h2>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Moderators with pending payouts</span>
                  <strong>{payoutQueue.length}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Total owed this cycle</span>
                  <strong style={{color:"var(--accent)"}}>
                    KES {payoutQueue.reduce((a,m) => a + m.amountOwed, 0).toFixed(2)}
                  </strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Platform fee rate</span>
                  <strong style={{color:"var(--success)"}}>{feePercent}%</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Total payouts processed</span>
                  <strong>{payoutHistory.length}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Payout queue */}
          <div className="card" style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 className="section-h2" style={{margin:0}}>
                💸 Pending Payouts
                {new Date().getDay() !== 0 && (
                  <span style={{fontSize:"0.72rem",fontWeight:400,color:"var(--muted)",marginLeft:10}}>
                    (Next payout Sunday: {(() => { const d=new Date(); d.setDate(d.getDate()+(7-d.getDay())%7||7); return d.toLocaleDateString("en-KE",{weekday:"long",day:"numeric",month:"short"}); })()})
                  </span>
                )}
              </h2>
              <button className="btn btn-sm btn-outline" onClick={loadAll}>↻ Refresh</button>
            </div>

            {payoutMsg && (
              <div className={`msg-box ${payoutMsg.type==="ok"?"msg-ok":"msg-err"}`}
                style={{marginBottom:14}} onClick={()=>setPayoutMsg(null)}>
                {payoutMsg.text} <span style={{opacity:.4}}>✕</span>
              </div>
            )}

            {payoutQueue.length === 0 ? (
              <div className="empty-state" style={{padding:"30px 0"}}>
                <div className="emoji">✅</div>
                <h3>All paid up!</h3>
                <p>No pending moderator payouts. Check back after members make payments.</p>
              </div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.84rem"}}>
                  <thead>
                    <tr style={{borderBottom:"2px solid var(--border)",color:"var(--muted)",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>
                      <th style={{padding:"8px 12px",textAlign:"left"}}>Moderator</th>
                      <th style={{padding:"8px 12px",textAlign:"left"}}>PesaPal Email</th>
                      <th style={{padding:"8px 12px",textAlign:"right"}}>Payments</th>
                      <th style={{padding:"8px 12px",textAlign:"right"}}>Amount Owed</th>
                      <th style={{padding:"8px 12px",textAlign:"right"}}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutQueue.map(mod => (
                      <tr key={mod.moderatorId} style={{borderBottom:"1px solid var(--border)"}}>
                        <td style={{padding:"12px 12px"}}>
                          <div style={{fontWeight:600}}>{mod.moderatorName}</div>
                          <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>{mod.moderatorEmail}</div>
                        </td>
                        <td style={{padding:"12px 12px"}}>
                          {mod.pesapalEmail ? (
                            <span style={{
                              background:"rgba(74,222,128,0.1)",color:"var(--success)",
                              border:"1px solid rgba(74,222,128,0.25)",
                              borderRadius:6,padding:"3px 8px",fontSize:"0.78rem",fontFamily:"monospace"
                            }}>
                              {mod.pesapalEmail}
                            </span>
                          ) : (
                            <span style={{color:"var(--error)",fontSize:"0.78rem"}}>⚠ Not set</span>
                          )}
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right",color:"var(--muted)"}}>
                          {mod.paymentCount}
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right"}}>
                          <strong style={{color:"var(--accent)",fontSize:"1rem"}}>
                            {mod.currency} {mod.amountOwed.toFixed(2)}
                          </strong>
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right"}}>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={payoutBusy[mod.moderatorId]}
                            onClick={async () => {
                              if (!window.confirm(
                                `Confirm payout of ${mod.currency} ${mod.amountOwed.toFixed(2)} to ${mod.moderatorName} at ${mod.pesapalEmail || mod.moderatorEmail}?

Make sure you have already sent the funds via PesaPal before clicking OK.`
                              )) return;
                              setPayoutBusy(b => ({...b,[mod.moderatorId]:true}));
                              try {
                                await api.markPaid({ moderatorId: mod.moderatorId });
                                setPayoutMsg({type:"ok", text:`✅ Payout of ${mod.currency} ${mod.amountOwed.toFixed(2)} to ${mod.moderatorName} recorded.`});
                                loadAll();
                              } catch(err) { setPayoutMsg({type:"err", text:err.message}); }
                              finally { setPayoutBusy(b => ({...b,[mod.moderatorId]:false})); }
                            }}>
                            {payoutBusy[mod.moderatorId] ? <span className="spinner"/> : "✓ Mark as Paid"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payout history */}
          <div className="card">
            <h2 className="section-h2" style={{marginBottom:14}}>📋 Payout History</h2>
            {payoutHistory.length === 0 ? (
              <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No payouts processed yet.</p>
            ) : payoutHistory.map(p => (
              <div key={p.id} className="earning-row">
                <div>
                  <div style={{fontWeight:600,fontSize:"0.85rem"}}>{p.moderatorName}</div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>
                    {new Date(p.paidAt).toLocaleDateString("en-KE",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}
                    {" · "}{p.paymentCount} payment{p.paymentCount!==1?"s":""}
                    {" · "}<span style={{fontFamily:"monospace"}}>{p.pesapalEmail}</span>
                  </div>
                  {p.notes && <div style={{fontSize:"0.72rem",color:"var(--muted)",fontStyle:"italic"}}>{p.notes}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:"var(--success)",fontSize:"0.95rem"}}>{p.currency} {p.amountPaid?.toFixed(2)}</div>
                  <span style={{
                    padding:"2px 8px",borderRadius:99,fontSize:"0.68rem",fontWeight:600,
                    background:"rgba(74,222,128,0.1)",color:"var(--success)",border:"1px solid rgba(74,222,128,0.2)"
                  }}>Paid ✓</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "expired" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <div>
              <h2 className="section-h2" style={{margin:0}}>🔴 Expired Subscriptions</h2>
              <p style={{color:"var(--muted)",fontSize:"0.82rem",marginTop:4,marginBottom:0}}>Members whose subscriptions have lapsed. Send personalised renewal reminders.</p>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-sm btn-outline" onClick={loadExpiredMembers} disabled={expiredLoading}>
                {expiredLoading ? <span className="spinner"/> : "↻ Refresh"}
              </button>
              {expiredMembers.length > 0 && (
                <button className="btn btn-sm btn-primary" style={{background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}
                  disabled={remindAllBusy||expiredLoading} onClick={remindExpiredAll}>
                  {remindAllBusy ? <><span className="spinner"/> Sending…</> : "📨 Remind All (" + expiredMembers.length + ")"}
                </button>
              )}
            </div>
          </div>
          {expiredMsg && (
            <div className={"msg-box " + (expiredMsg.type==="ok"?"msg-ok":"msg-err")} style={{marginBottom:16}} onClick={()=>setExpiredMsg(null)}>
              {expiredMsg.text} <span style={{opacity:.4}}>✕</span>
            </div>
          )}
          {expiredMembers.length > 0 && (
            <div className="stats-row" style={{marginBottom:20}}>
              <div className="stat-card"><div className="stat-value" style={{color:"var(--error)"}}>{expiredMembers.length}</div><div className="stat-label">Total Expired</div></div>
              <div className="stat-card"><div className="stat-value" style={{color:"var(--warning)"}}>{expiredMembers.filter(m=>m.daysExpired<=7).length}</div><div className="stat-label">Expired 7d or less</div></div>
              <div className="stat-card"><div className="stat-value" style={{color:"var(--error)"}}>{expiredMembers.filter(m=>m.daysExpired>7).length}</div><div className="stat-label">Expired over 7d</div></div>
              <div className="stat-card"><div className="stat-value" style={{color:"var(--accent)"}}>{"$" + expiredMembers.reduce((a,m)=>a+(m.memberPays||0),0).toFixed(2)}</div><div className="stat-label">Potential Revenue</div></div>
            </div>
          )}
          {expiredLoading ? <div style={{textAlign:"center",padding:60}}><span className="spinner"/></div>
          : expiredMembers.length === 0 ? (
            <div className="empty-state"><div className="emoji">🎉</div><h3>No expired subscriptions</h3><p>All confirmed members are still active.</p></div>
          ) : expiredMembers.map(m => (
            <div key={m.id} className="card" style={{marginBottom:12,padding:16,
              borderLeft:m.daysExpired<=3?"3px solid var(--error)":m.daysExpired<=7?"3px solid var(--warning)":"3px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                <div style={{fontSize:"1.8rem"}}>{m.serviceIcon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:"0.95rem"}}>{m.name}</div>
                  <div style={{fontSize:"0.78rem",color:"var(--muted)",wordBreak:"break-all"}}>{m.email}</div>
                  <div style={{fontSize:"0.78rem",marginTop:4}}>
                    <strong style={{color:"var(--text)"}}>{m.groupName}</strong>
                    {" · "}<span style={{color:"var(--accent)"}}>{"$" + m.memberPays + "/mo"}</span>
                    {" · "}<span style={{color:"var(--muted)"}}>{m.billingCycle}</span>
                  </div>
                  <div style={{fontSize:"0.74rem",marginTop:3}}>
                    <span style={{color:"var(--error)",fontWeight:600}}>{"🔴 Expired " + m.daysExpired + " day" + (m.daysExpired!==1?"s":"") + " ago"}</span>
                    <span style={{color:"var(--muted)",marginLeft:8}}>{"(" + new Date(m.expiresAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) + ")"}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <button className="btn btn-sm btn-primary"
                    style={{whiteSpace:"nowrap",background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}
                    disabled={busy[m.id]} onClick={()=>remindExpiredOne(m.id)}>
                    {busy[m.id] ? <><span className="spinner"/> Sending…</> : "📧 Send Reminder"}
                  </button>
                  <button className="btn btn-sm btn-danger"
                    style={{whiteSpace:"nowrap"}}
                    disabled={busy["del_" + m.id]}
                    onClick={()=>deleteExpiredMember(m.id, m.name)}>
                    {busy["del_" + m.id] ? <><span className="spinner"/> Deleting…</> : "🗑️ Remove"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Email User Modal ── */}
      {emailTarget && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setEmailTarget(null)}>
          <div className="modal" style={{maxWidth:520}}>
            <h3>✉️ Email {emailTarget.name}</h3>
            <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:16}}>
              Sending to: <strong style={{color:"var(--text)"}}>{emailTarget.email}</strong>
              <span style={{marginLeft:8,fontSize:"0.75rem",background:"var(--bg3)",padding:"2px 8px",borderRadius:99}}>{emailTarget.role}</span>
            </p>
            <div className="form-group">
              <label>Subject</label>
              <input value={emailForm.subject}
                onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Important update about your account"/>
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea rows={6} value={emailForm.body}
                onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
                placeholder={"Hi " + emailTarget.name + ",\n\nWrite your message here...\n\n— SplitSubs Admin"}
                style={{resize:"vertical",fontFamily:"monospace",fontSize:"0.82rem"}}/>
            </div>
            {emailModalMsg && (
              <div className={"msg-box " + (emailModalMsg.type==="ok"?"msg-ok":"msg-err")}
                style={{marginBottom:12}} onClick={()=>setEmailModalMsg(null)}>
                {emailModalMsg.text} <span style={{opacity:.4}}>✕</span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setEmailTarget(null); setEmailModalMsg(null); }}>Cancel</button>
              <button className="btn btn-primary" disabled={emailBusy || !emailForm.subject || !emailForm.body} onClick={sendEmailToUser}>
                {emailBusy ? <><span className="spinner"/> Sending…</> : "📨 Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Profile Modal ── */}
      {profileTarget && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setProfileTarget(null)}>
          <div className="modal" style={{ maxWidth:620, maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <h3 style={{ margin:0 }}>👤 {profileTarget.name}</h3>
                <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:4 }}>{profileTarget.email}</div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setProfileTarget(null)}>✕</button>
            </div>

            {profileLoading ? (
              <div style={{ textAlign:"center", padding:40 }}><span className="spinner"/></div>
            ) : profileData ? (
              <div>
                {/* Basic info */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                  {[
                    { label:"Role", value: profileData.role },
                    { label:"Status", value: profileData.status },
                    { label:"Phone", value: profileData.phone || "—" },
                    { label:"Joined", value: new Date(profileData.joinedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) },
                    { label:"Last Active", value: profileData.lastSeen ? new Date(profileData.lastSeen).toLocaleString("en-GB", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "Never" },
                    { label:"Online Now", value: profileData.online ? "🟢 Yes" : "⚫ No" },
                    { label:"Total Spent", value: "$" + (profileData.totalSpent || 0).toFixed(2) },
                    { label:"Subscriptions", value: profileData.subscriptions.length },
                  ].map(item => (
                    <div key={item.label} style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginBottom:3 }}>{item.label}</div>
                      <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Subscriptions */}
                <h4 style={{ margin:"0 0 10px", fontSize:"0.88rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>Subscriptions</h4>
                {profileData.subscriptions.length === 0 ? (
                  <div style={{ color:"var(--muted)", fontSize:"0.82rem", marginBottom:16 }}>No subscriptions yet.</div>
                ) : profileData.subscriptions.map(s => {
                  const days = s.expiresAt ? Math.ceil((new Date(s.expiresAt) - new Date()) / (1000*60*60*24)) : null;
                  return (
                    <div key={s.id} style={{ background:"var(--bg3)", borderRadius:10, padding:"12px 14px", marginBottom:8,
                      borderLeft: s.paymentStatus === "confirmed" ? "3px solid var(--success)" : s.paymentStatus === "expired" ? "3px solid var(--error)" : "3px solid var(--border)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:"1.4rem" }}>{s.serviceIcon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{s.groupName}</div>
                          <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{s.billingCycle} · {"$" + s.memberPays + "/mo"}</div>
                          {s.expiresAt && (
                            <div style={{ fontSize:"0.72rem", marginTop:3 }}>
                              <span style={{ color: days !== null && days <= 0 ? "var(--error)" : days !== null && days <= 7 ? "var(--warning)" : "var(--muted)" }}>
                                {days !== null && days <= 0 ? "⛔ Expired " + Math.abs(days) + "d ago" : days !== null && days <= 7 ? "⚠️ Expires in " + days + "d" : "Expires " + new Date(s.expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                              </span>
                              {s.expiryAdjustmentDays !== 0 && (
                                <span style={{ marginLeft:8, fontSize:"0.68rem", color: s.expiryAdjustmentDays > 0 ? "var(--success)" : "var(--error)" }}>
                                  🛡️ {s.expiryAdjustmentDays > 0 ? "+" : ""}{s.expiryAdjustmentDays}d admin adj.
                                </span>
                              )}
                            </div>
                          )}
                          <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginTop:2 }}>Joined {new Date(s.joinedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>
                        </div>
                        <span className={"tag tag-" + s.paymentStatus} style={{ fontSize:"0.68rem" }}>{s.paymentStatus}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Payment history */}
                {profileData.payments.length > 0 && (
                  <>
                    <h4 style={{ margin:"16px 0 10px", fontSize:"0.88rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>Payment History</h4>
                    {profileData.payments.map(p => (
                      <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:"0.82rem" }}>
                        <span style={{ color:"var(--muted)" }}>{p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—"}</span>
                        <span>{p.months} month{p.months !== 1 ? "s" : ""}</span>
                        <span style={{ color:"var(--success)", fontWeight:600 }}>{"$" + (p.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : null}

            <div className="modal-actions" style={{ marginTop:20 }}>
              <button className="btn btn-outline" onClick={() => setProfileTarget(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setProfileTarget(null); setEmailTarget(profileTarget); setEmailForm({ subject:"", body:"" }); setEmailModalMsg(null); }}>
                ✉️ Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setRejectId(null)}>
          <div className="modal">
            <h3>Reject Moderator Application</h3>
            <div className="form-group" style={{marginTop:12}}>
              <label>Reason (optional — shown to user)</label>
              <textarea rows={3} value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                placeholder="e.g. Incomplete information provided" style={{resize:"vertical"}}/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setRejectId(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={busy[rejectId]} onClick={() => reject(rejectId)}>
                {busy[rejectId] ? <span className="spinner"/> : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Groups tab sub-component embedded at bottom of the file ──
// (imported inline by adding a "groups" tab to the existing component above)
