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

  // Payouts
  const [payoutQueue, setPayoutQueue]   = useState([]);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [payoutBusy, setPayoutBusy]     = useState({});
  const [payoutMsg, setPayoutMsg]       = useState(null);
  const [feePercent, setFeePercent]     = useState(8);
  const [feeInput, setFeeInput]         = useState("8");
  const [feeBusy, setFeeBusy]           = useState(false);
  const [feeMsg, setFeeMsg]             = useState(null);

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

  const filtered = allUsers.filter(u => {
    if (tab === "pending")    return u.role === "moderator" && u.status === "pending";
    if (tab === "moderators") return u.role === "moderator";
    if (tab === "customers")  return u.role === "customer";
    if (tab === "groups")     return false; // handled separately
    return true;
  });

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
          {key:"payouts",       label:`💸 Payouts${payoutQueue.length > 0 ? ` (${payoutQueue.length})` : ""}`},
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?"active":""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
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
                {u.status === "active" && u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-danger" onClick={() => suspend(u.id)}>⛔ Suspend</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
                  <input value={nlForm.senderName} onChange={e=>setNlForm(f=>({...f,senderName:e.target.value}))} placeholder="SplitPass Team" />
                </div>
                <div className="form-group">
                  <label>Sender Email</label>
                  <input type="email" value={nlForm.senderEmail} onChange={e=>setNlForm(f=>({...f,senderEmail:e.target.value}))} placeholder="newsletter@splitpass.com" />
                </div>
              </div>

              <div className="form-group">
                <label>Subject</label>
                <input value={nlForm.subject} onChange={e=>setNlForm(f=>({...f,subject:e.target.value}))} placeholder="e.g. New Spotify groups available this week!" />
              </div>

              <div className="form-group">
                <label>Message Body</label>
                <textarea rows={8} value={nlForm.body} onChange={e=>setNlForm(f=>({...f,body:e.target.value}))}
                  placeholder={"Hi {name},\n\nWe have exciting new groups available...\n\nCheck them out at splitpass.com\n\nBest,\nThe SplitPass Team"}
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
                  placeholder="admin@splitpass.com"/>
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
                placeholder={"Hi {name},\n\nWrite your message to all organizers here...\n\n— SplitPass Admin"}
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
