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
  const [groups, setGroups]     = useState([]);

  useEffect(() => {
    if (!session.isSuperAdmin()) { navigate("admin-login"); return; }
    loadAll();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u, g] = await Promise.all([api.getPendingMods(), api.getUsers(), api.getGroups()]);
      setPending(p); setAllUsers(u); setGroups(g);
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
