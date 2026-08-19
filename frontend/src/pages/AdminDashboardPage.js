import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import { kes, kesRaw, useKesRate, refreshRate } from "../currency";
import "./AdminDashboardPage.css";
import "./EarningsPage.css";

function fmtCoins(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toString().replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

const SIDEBAR_SECTIONS = [
  { items: [
      { key: "dashboard", icon: "🏠", label: "Dashboard" },
      { key: "earnings",  icon: "💰", label: "Platform Earnings" },
    ] },
  { items: [
      { key: "marketplace",   icon: "🛍️", label: "Marketplace" },
      { key: "subscriptions", icon: "📑", label: "Subscriptions" },
      { key: "payments",      icon: "💳", label: "Payments", countKey: "pendingPaymentsCount" },
    ] },
  { items: [
      { key: "moderators", icon: "🛡️", label: "Moderators", countKey: "pendingModCount" },
      { key: "customers",  icon: "👥", label: "Customers" },
      { key: "users",      icon: "👤", label: "Users" },
      { key: "roles",      icon: "🔑", label: "Roles" },
      { key: "logs",       icon: "📜", label: "Logs" },
    ] },
  { items: [
      { key: "support",    icon: "🎧", label: "Support", countKey: "openSupportThreads" },
      { key: "automation", icon: "⚙️", label: "Automation" },
    ] },
  { items: [
      { key: "marketing", icon: "📣", label: "Marketing" },
      { key: "analytics", icon: "📊", label: "Analytics" },
      { key: "reports",   icon: "📈", label: "Reports" },
    ] },
  { items: [{ key: "settings", icon: "⚙️", label: "Settings" }] },
];

export default function AdminDashboardPage({ navigate }) {
  useKesRate(); // loads the platform's live USD→KES rate once, re-renders when it arrives
  const [view, setView]         = useState("dashboard");
  const [dashData, setDashData]     = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dateRangeKey, setDateRangeKey] = useState("7d");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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
  const [services, setServices]       = useState([]);
  const [editTarget, setEditTarget]   = useState(null);
  const [editForm, setEditForm]       = useState(null);
  const [editBusy, setEditBusy]       = useState(false);
  const [editMsg, setEditMsg]         = useState(null);
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
  const [ownAccount, setOwnAccount]     = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [payoutBusy, setPayoutBusy]     = useState({});
  const [payoutMsg, setPayoutMsg]       = useState(null);
  const [feePercent, setFeePercent]     = useState(8);
  const [feeInput, setFeeInput]         = useState("8");
  const [feeBusy, setFeeBusy]           = useState(false);
  const [feeMsg, setFeeMsg]             = useState(null);
  const [rateValue, setRateValue]       = useState(130);
  const [rateInput, setRateInput]       = useState("130");
  const [rateBusy, setRateBusy]         = useState(false);
  const [rateMsg, setRateMsg]           = useState(null);

  // Search + pending payments
  const [searchEmail, setSearchEmail]         = useState("");
  const [pendingPayments, setPendingPayments] = useState([]);
  const [confirmedPayments, setConfirmedPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

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
    if (!session.isSuperAdmin()) { navigate("login"); return; }
    loadAll();
  }, []);

  const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };
  const RANGE_LABELS = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "all": "All" };

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      let from, to;
      if (dateRangeKey === "all") {
        // Covers everything from the platform's earliest possible record up to now.
        to = new Date();
        from = new Date(0);
      } else if (dateRangeKey === "custom" && customFrom && customTo) {
        from = new Date(customFrom);
        to = new Date(customTo);
        to.setHours(23, 59, 59, 999); // include the whole "to" day
      } else {
        const days = RANGE_DAYS[dateRangeKey] || 7;
        to = new Date();
        from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      }
      const data = await api.getAdminDashboard(`?from=${from.toISOString()}&to=${to.toISOString()}`);
      setDashData(data);
    } catch (err) { console.error(err); }
    finally { setDashLoading(false); }
  }, [dateRangeKey, customFrom, customTo]);

  useEffect(() => {
    if (!session.isSuperAdmin()) return;
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === "pending-payments") loadPayments();
  }, [tab]);

  async function promote(uid) {
    setBusy(b => ({ ...b, [uid]: true }));
    try { await api.promoteToModerator(uid); await loadAll(); }
    catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(b => ({ ...b, [uid]: false })); }
  }

  async function unsuspend(uid) {
    setBusy(b => ({ ...b, [uid]: true }));
    try { await api.unsuspendUser(uid); await loadAll(); }
    catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(b => ({ ...b, [uid]: false })); }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u, g, subs, hist, pg, oeh, pq, ph, as_, svc] = await Promise.all([
        api.getPendingMods(), api.getUsers(), api.getGroups(),
        api.getSubscribers(), api.getNewsletterHistory(),
        api.getPendingGroups(), api.getOrganizerEmailHistory(),
        api.getPayoutQueue(), api.getPayoutHistory(), api.getAdminSettings(),
        api.getServices(),
      ]);
      setPending(p); setAllUsers(u); setGroups(g); setSubscribers(subs);
      setNlHistory(hist); setPGroups(pg); setOrgEmailHistory(oeh);
      setServices(svc || []);
      setPayoutQueue(pq?.queue || []); setPayoutHistory(ph || []); setOwnAccount(pq?.ownAccount || null);
      const fee = as_?.feePercent ?? 8;
      setFeePercent(fee); setFeeInput(String(fee));
      const rate = as_?.kesPerUsd ?? 130;
      setRateValue(rate); setRateInput(String(rate));
    } catch { navigate("login"); }
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

  function openEdit(g) {
    setEditTarget(g);
    setEditMsg(null);
    setEditForm({
      serviceId: g.serviceId || "",
      planName: g.planName || "",
      totalPrice: g.totalPrice ?? "",
      maxSlots: g.maxSlots ?? "",
      description: g.description || "",
      billingCycle: g.billingCycle || "monthly",
      subscriptionCost: g.subscriptionCost ?? "",
      renewDate: g.renewDate ? new Date(g.renewDate).toISOString().split("T")[0] : "",
    });
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditBusy(true); setEditMsg(null);
    try {
      const updated = await api.editGroup(editTarget.id, {
        ...editForm,
        totalPrice: +editForm.totalPrice,
        maxSlots: +editForm.maxSlots,
        subscriptionCost: editForm.subscriptionCost ? +editForm.subscriptionCost : 0,
      });
      setPGroups(list => list.map(g => g.id === updated.id ? { ...g, ...updated } : g));
      setMsg({ type:"ok", text:"Listing updated." });
      setEditTarget(null); setEditForm(null);
    } catch (err) { setEditMsg({ type:"err", text: err.message }); }
    finally { setEditBusy(false); }
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

  async function loadPayments() {
    setPaymentsLoading(true);
    try {
      const [pending, confirmed] = await Promise.all([
        api.getPendingPayments(), api.getConfirmedPayments(),
      ]);
      setPendingPayments(pending); setConfirmedPayments(confirmed);
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setPaymentsLoading(false); }
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

  const filteredConfirmedPayments = confirmedPayments.filter(cp =>
    !searchEmail.trim() || cp.email.toLowerCase().includes(searchEmail.toLowerCase().trim()) || cp.memberName?.toLowerCase().includes(searchEmail.toLowerCase().trim())
  );
  const confirmedTotalUSD = filteredConfirmedPayments.reduce((a, cp) => a + (cp.amount || 0), 0);

  const statusColor = { active:"var(--success)", pending:"var(--warning)", suspended:"var(--error)" };
  const roleBg = { customer:"rgba(74,222,128,0.12)", moderator:"rgba(124,106,255,0.12)", superadmin:"rgba(255,106,142,0.12)" };
  const roleColor = { customer:"var(--success)", moderator:"var(--accent)", superadmin:"var(--accent2)" };

  if (loading) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;

  const sidebarCounts = {
    pendingPaymentsCount: dashData?.needsAttention?.paymentsPending ?? pendingPayments.length,
    pendingModCount: pending.length,
    openSupportThreads: dashData?.needsAttention?.openSupportThreads ?? 0,
  };

  function goto(viewKey, tabKey) {
    setView(viewKey);
    if (tabKey) setTab(tabKey);
  }

  const adminUser = session.getUser();

  return (
    <div className="admin-shell fade-in">
      <aside className="admin-sidebar">
        <div className="admin-sb-logo">⚡ Split<span style={{color:"var(--accent)"}}>Subs</span></div>
        {SIDEBAR_SECTIONS.map((section, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="admin-sb-divider" />}
            <div className="admin-sb-section">
              {section.items.map(it => {
                const count = it.countKey ? sidebarCounts[it.countKey] : null;
                return (
                  <button key={it.key} className={`admin-sb-item ${view === it.key ? "active" : ""}`}
                    onClick={() => {
                      if (it.key === "analytics") return goto("earnings");
                      if (it.key === "marketplace") return goto("marketplace", "groups");
                      if (it.key === "payments")    return goto("payments", "pending-payments");
                      if (it.key === "moderators")  return goto("moderators", "moderators");
                      if (it.key === "customers")   return goto("customers", "customers");
                      if (it.key === "users")       return goto("users", "all");
                      if (it.key === "marketing")   return goto("marketing", "newsletter");
                      if (it.key === "reports")     return goto("reports", "reports");
                      if (it.key === "settings")    return goto("settings", "settings");
                      if (it.key === "subscriptions") return goto("subscriptions", "sub-all");
                      setView(it.key);
                    }}>
                    <span className="icon">{it.icon}</span>
                    <span className="lbl">{it.label}</span>
                    {!!count && <span className="count">{count}</span>}
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        ))}
        <div className="admin-sb-footer">
          <div className="user-av" style={{width:34,height:34,fontSize:"0.85rem"}}>{(adminUser?.name || "A")[0].toUpperCase()}</div>
          <div style={{minWidth:0}}>
            <div className="name">{adminUser?.name || "Admin"}</div>
            <div className="role">Superadmin</div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        {msg && <div className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:16}} onClick={()=>setMsg(null)}>{msg.text} <span style={{opacity:.4}}>✕</span></div>}

        {view === "dashboard" && (
          <AdminDashboardHome
            data={dashData} loading={dashLoading}
            adminName={adminUser?.name || "Admin"}
            dateRangeKey={dateRangeKey} setDateRangeKey={setDateRangeKey}
            rangeMenuOpen={rangeMenuOpen} setRangeMenuOpen={setRangeMenuOpen}
            rangeLabels={RANGE_LABELS}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
            onRefresh={loadDashboard}
            goto={goto}
            navigate={navigate}
          />
        )}

        {view === "earnings" && <EarningsView />}

        {view === "roles" && (
          <RolesView allUsers={allUsers} busy={busy} promote={promote} demote={demote} onProfile={loadProfile} />
        )}

        {view === "logs" && (
          <LogsView activity={dashData?.recentActivity} loading={dashLoading} onRefresh={loadDashboard} />
        )}

        {view === "automation" && <AutomationView />}

        {view === "support" && <SupportView />}

        {view === "marketplace" && (
          <div>
            <div className="admin-tabs" style={{marginBottom:16}}>
              <button className={`tab-btn ${tab==="groups"?"active":""}`} onClick={()=>setTab("groups")}>All Groups ({groups.length})</button>
              <button className={`tab-btn ${tab==="group-review"?"active":""}`} onClick={()=>setTab("group-review")}>⏳ Pending Products ({pendingGroups.length})</button>
            </div>
          </div>
        )}

        {view === "marketing" && (
          <div className="admin-tabs" style={{marginBottom:16}}>
            <button className={`tab-btn ${tab==="newsletter"?"active":""}`} onClick={()=>setTab("newsletter")}>📧 Newsletter</button>
            <button className={`tab-btn ${tab==="org-email"?"active":""}`} onClick={()=>setTab("org-email")}>✉️ Email Organizers</button>
          </div>
        )}

        {view === "moderators" && (
          <h2 className="section-h2" style={{margin:"0 0 16px"}}>🛡️ Moderators</h2>
        )}
        {view === "customers" && (
          <h2 className="section-h2" style={{margin:"0 0 16px"}}>👥 Customers</h2>
        )}
        {view === "users" && (
          <h2 className="section-h2" style={{margin:"0 0 16px"}}>👤 All Users</h2>
        )}

        {view === "reports" && (
          <div style={{marginBottom:4}}>
            <h2 className="section-h2" style={{margin:"0 0 4px"}}>📈 Reports</h2>
            <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:16}}>Moderator payout queue and history.</p>
          </div>
        )}

        {view === "settings" && (
          <div style={{marginBottom:4}}>
            <h2 className="section-h2" style={{margin:"0 0 4px"}}>⚙️ Settings</h2>
            <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:16}}>Platform-wide configuration.</p>
          </div>
        )}

        {["marketplace","payments","moderators","customers","users","marketing","reports","settings","subscriptions"].includes(view) && (
      <>
      {view === "subscriptions" && (
        <SubscriptionsView groups={groups} tab={tab} setTab={setTab} loadExpiredMembers={loadExpiredMembers} />
      )}
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
              Filtering by &ldquo;{searchEmail}&rdquo; · {tab === "pending-payments" ? `${filteredConfirmedPayments.length} confirmed · ${filteredPendingPayments.length} pending` : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
              <button className="btn btn-sm btn-outline" style={{ marginLeft:10, padding:"2px 10px" }} onClick={() => setSearchEmail("")}>Clear</button>
            </p>
          )}
        </div>
      )}

      {/* Payments tab — Confirmed / Pending, two columns */}
      {tab === "pending-payments" && (
        paymentsLoading ? <div style={{textAlign:"center",padding:60}}><span className="spinner"/></div> : (
        <div className="admin-payments-cols">
          {/* Confirmed Payments */}
          <div className="card">
            <h2 className="section-h2" style={{ marginBottom:4 }}>✅ Confirmed Payments</h2>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:6 }}>
              Completed transactions. These add up to the platform&rsquo;s Total Revenue.
            </p>
            <p style={{ fontSize:"0.9rem", fontWeight:700, color:"var(--success)", marginBottom:16 }}>
              KES {kes(confirmedTotalUSD)} · ${confirmedTotalUSD.toFixed(2)} total
            </p>
            {filteredConfirmedPayments.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">🧾</div>
                <h3>{searchEmail.trim() ? "No matches" : "No confirmed payments yet"}</h3>
                <p>{searchEmail.trim() ? "Try a different search." : "Completed payments will show up here."}</p>
              </div>
            ) : filteredConfirmedPayments.map(cp => (
              <div key={cp.id} className="card" style={{ marginBottom:12, padding:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  <div className="user-av">{cp.memberName?.[0]?.toUpperCase()}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600 }}>{cp.memberName}</div>
                    <div style={{ fontSize:"0.78rem", color:"var(--muted)", wordBreak:"break-all" }}>{cp.email}</div>
                    <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:4 }}>
                      {cp.group?.serviceIcon} <strong style={{ color:"var(--text)" }}>{cp.group?.serviceName} — {cp.group?.planName}</strong>
                      {cp.months ? ` · ${cp.months}mo` : ""}
                    </div>
                    <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:2 }}>
                      {cp.confirmedAt ? new Date(cp.confirmedAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                  <div style={{ fontWeight:700, color:"var(--success)", whiteSpace:"nowrap" }}>
                    KES {kes(cp.amount)} · ${(cp.amount || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pending Payments */}
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
        </div>
        )
      )}

      {/* User list */}
      {["pending","moderators","customers","all"].includes(tab) && (filtered.length === 0 ? (
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
                  <button className="btn btn-sm btn-outline"
                    style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}
                    onClick={() => loadProfile(u)}>
                    👤 Profile
                  </button>
                )}
                {u.role !== "superadmin" && (
                  <button className="btn btn-sm btn-outline" style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}
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
            <div key={g.id} className="user-card card" style={{cursor:"pointer"}} onClick={() => navigate("group", { id: g.id, slug: `${g.serviceName} ${g.planName}` })}>
              <div className="user-card-left">
                <div style={{fontSize:"2rem"}}>{g.serviceIcon}</div>
                <div>
                  <div className="user-card-name">{g.serviceName} — {g.planName}</div>
                  <div className="user-card-email">Organizer: {g.organizerName} · {g.memberCount || 0}/{g.maxSlots} members</div>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                    ${g.pricePerSlot}/member/mo · Created {new Date(g.createdAt).toLocaleDateString()}
                  {g.renewDate && (() => {
                    const days = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));
                    const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";
                    const bg = days <= 0 ? "rgba(248,113,113,0.1)" : days <= 7 ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)";
                    return <div style={{ marginTop:4, display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:99, background:bg, border:"1px solid " + color }}>
                      <span style={{ fontSize:"0.7rem", fontWeight:700, color }}>
                        {"📅 Renew: " + new Date(g.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) + (days <= 0 ? " · ⛔ OVERDUE " + Math.abs(days) + "d" : " · " + (days <= 7 ? "⚠️ " : "✓ ") + days + "d left")}
                      </span>
                    </div>;
                  })()}
                  {g.subscriptionCost > 0 && (
                    <div style={{ marginTop:4, display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:99,
                      background: g.profit >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                      border: "1px solid " + (g.profit >= 0 ? "var(--success)" : "var(--error)") }}>
                      <span style={{ fontSize:"0.7rem", fontWeight:700, color: g.profit >= 0 ? "var(--success)" : "var(--error)" }}>
                        {"💵 Cost: $" + g.subscriptionCost.toFixed(2) + " · 📈 Profit: " + (g.profit >= 0 ? "+" : "") + g.profit.toFixed(2) + "/mo"}
                      </span>
                    </div>
                  )}
                  </div>
                </div>
              </div>
              <div className="user-card-right">
                <span className={`tag tag-${g.status}`}>{g.status}</span>
                <button className="btn btn-sm btn-outline" onClick={e => {e.stopPropagation(); navigate("group", { id: g.id, slug: `${g.serviceName} ${g.planName}` });}}>
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
            <h2 className="section-h2" style={{margin:0}}>⏳ Pending Products</h2>
            <button className="btn btn-sm btn-outline" onClick={loadAll}>↻ Refresh</button>
          </div>
          <p style={{color:"var(--muted)",fontSize:"0.82rem",marginTop:-8,marginBottom:16}}>
            Every group submitted by a moderator waits here until you preview and approve it — nothing goes live to customers before that.
          </p>
          {pendingGroups.length === 0 ? (
            <div className="empty-state"><div className="emoji">✅</div><h3>All clear!</h3><p>No products pending approval.</p></div>
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
                  onClick={() => openEdit(g)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-sm btn-outline"
                  onClick={() => navigate("group", { id: g.id, slug: `${g.serviceName} ${g.planName}` })}>
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

      {/* Edit listing modal — change category/service, plan, pricing, slots, etc before publishing */}
      {editTarget && editForm && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditTarget(null)}>
          <div className="modal" style={{maxWidth:520}}>
            <h3>Edit Listing</h3>
            <p style={{color:"var(--muted)",fontSize:"0.84rem",marginBottom:16}}>
              Editing: <strong>{editTarget.serviceName} — {editTarget.planName}</strong>
            </p>

            {editMsg && (
              <div className={`msg-box ${editMsg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:12}} onClick={()=>setEditMsg(null)}>
                {editMsg.text} <span style={{opacity:.4}}>✕</span>
              </div>
            )}

            <div className="form-group">
              <label>Service / Category</label>
              <select value={editForm.serviceId} onChange={e=>setEditForm(f=>({...f, serviceId:e.target.value}))}>
                {Object.entries(
                  services.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {})
                ).map(([category, svcs]) => (
                  <optgroup key={category} label={category}>
                    {svcs.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Plan Name</label>
                <input value={editForm.planName} onChange={e=>setEditForm(f=>({...f, planName:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label>Billing Cycle</label>
                <select value={editForm.billingCycle} onChange={e=>setEditForm(f=>({...f, billingCycle:e.target.value}))}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="biannually">Every 6 mo</option>
                  <option value="annually">Annually</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Total Plan Price ($)</label>
                <input type="number" step="0.01" value={editForm.totalPrice} onChange={e=>setEditForm(f=>({...f, totalPrice:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label>Max Slots</label>
                <input type="number" min="1" value={editForm.maxSlots} onChange={e=>setEditForm(f=>({...f, maxSlots:e.target.value}))}/>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Subscription Cost ($)</label>
                <input type="number" step="0.01" value={editForm.subscriptionCost} onChange={e=>setEditForm(f=>({...f, subscriptionCost:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label>Renew Date</label>
                <input type="date" value={editForm.renewDate} onChange={e=>setEditForm(f=>({...f, renewDate:e.target.value}))}/>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea rows={3} value={editForm.description} onChange={e=>setEditForm(f=>({...f, description:e.target.value}))} style={{resize:"vertical"}}/>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={()=>{setEditTarget(null);setEditForm(null);}}>Cancel</button>
              <button className="btn btn-primary" disabled={editBusy} onClick={saveEdit}>
                {editBusy ? <span className="spinner"/> : "Save Changes"}
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

{/* ── Settings tab: platform fee ── */}
      {tab === "settings" && (
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:20,marginBottom:20,alignItems:"start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
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

            {/* Exchange rate editor */}
            <div className="card">
              <h2 className="section-h2" style={{marginBottom:14}}>💱 Currency</h2>
              <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:14}}>
                USD→KES rate used for every KES figure across the platform (dashboard, payments, payouts, pricing). Update this whenever the real market rate shifts.
              </p>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{color:"var(--muted)",fontSize:"0.9rem"}}>1 USD =</span>
                <input
                  type="number" min="1" max="1000" step="0.01"
                  className="form-input"
                  value={rateInput}
                  onChange={e => setRateInput(e.target.value)}
                  style={{width:110,fontWeight:700,fontSize:"1.1rem",textAlign:"center"}}
                />
                <span style={{color:"var(--muted)",fontSize:"0.9rem"}}>KES</span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={rateBusy}
                  onClick={async () => {
                    setRateBusy(true); setRateMsg(null);
                    try {
                      const r = await api.updateKesRate(parseFloat(rateInput));
                      setRateValue(r.kesPerUsd);
                      setRateMsg({type:"ok", text:`Exchange rate updated to KES ${r.kesPerUsd} per USD`});
                      loadAll(); refreshRate();
                    } catch(err) { setRateMsg({type:"err", text:err.message}); }
                    finally { setRateBusy(false); }
                  }}>
                  {rateBusy ? <span className="spinner"/> : "Save"}
                </button>
              </div>
              {rateMsg && (
                <div className={`msg-box ${rateMsg.type==="ok"?"msg-ok":"msg-err"}`}
                  style={{marginTop:12}} onClick={()=>setRateMsg(null)}>
                  {rateMsg.text} <span style={{opacity:.4}}>✕</span>
                </div>
              )}
            </div>
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
                    KES {kes(payoutQueue.reduce((a,m) => a + m.amountOwedUSD, 0))} · ${payoutQueue.reduce((a,m) => a + m.amountOwedUSD, 0).toFixed(2)}
                  </strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Platform fee rate</span>
                  <strong style={{color:"var(--success)"}}>{feePercent}%</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Exchange rate</span>
                  <strong style={{color:"var(--accent)"}}>1 USD = {rateValue} KES</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.84rem"}}>
                  <span style={{color:"var(--muted)"}}>Total payouts processed</span>
                  <strong>{payoutHistory.length}</strong>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* ── Reports tab: payout queue + history ── */}
      {tab === "reports" && (
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

            {/* Revenue from listings the superadmin's own account organizes never
                needs a Paystack payout — it's already in the platform wallet you
                control, so it's excluded from the table below and just noted here. */}
            {ownAccount && (
              <div style={{
                display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8,
                padding:"10px 14px", marginBottom:16, borderRadius:10,
                background:"rgba(124,106,255,0.06)", border:"1px solid var(--border)", fontSize:"0.82rem",
              }}>
                <span style={{color:"var(--muted)"}}>
                  🔑 Your own listings ({ownAccount.paymentCount} payment{ownAccount.paymentCount!==1?"s":""}) — already in your wallet, no payout needed
                </span>
                <strong>KES {kes(ownAccount.amountUSD)} · ${ownAccount.amountUSD.toFixed(2)}</strong>
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
                      <th style={{padding:"8px 12px",textAlign:"left"}}>Payout Destination</th>
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
                          {mod.paystackReady ? (
                            <span style={{
                              background:"rgba(74,222,128,0.1)",color:"var(--success)",
                              border:"1px solid rgba(74,222,128,0.25)",
                              borderRadius:6,padding:"3px 8px",fontSize:"0.78rem",fontFamily:"monospace"
                            }}>
                              {mod.payoutMethod === "mobile_money" ? "📱 " : "🏦 "}{mod.payoutDestination}
                            </span>
                          ) : (
                            <span style={{color:"var(--error)",fontSize:"0.78rem"}}>⚠ Paystack not set up</span>
                          )}
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right",color:"var(--muted)"}}>
                          {mod.paymentCount}
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right"}}>
                          <strong style={{color:"var(--accent)",fontSize:"1rem",whiteSpace:"nowrap"}}>
                            KES {kes(mod.amountOwedUSD)}
                          </strong>
                          <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>${mod.amountOwedUSD.toFixed(2)}</div>
                        </td>
                        <td style={{padding:"12px 12px",textAlign:"right"}}>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={payoutBusy[mod.moderatorId] || !mod.paystackReady}
                            title={!mod.paystackReady ? "Moderator hasn't set up Paystack payout details yet" : undefined}
                            onClick={async () => {
                              if (!window.confirm(
                                `Send KES ${kes(mod.amountOwedUSD)} ($${mod.amountOwedUSD.toFixed(2)}) to ${mod.moderatorName} via Paystack (${mod.payoutDestination})?

This will initiate a real transfer.`
                              )) return;
                              setPayoutBusy(b => ({...b,[mod.moderatorId]:true}));
                              try {
                                const result = await api.markPaid({ moderatorId: mod.moderatorId });
                                if (result.requiresOtp) {
                                  const otp = window.prompt("Paystack requires an OTP to confirm this transfer. Enter the code sent to your Paystack account:");
                                  if (otp) {
                                    await api.finalizePayoutOtp({ payoutId: result.payout.id, otp });
                                    setPayoutMsg({type:"ok", text:`✅ Transfer to ${mod.moderatorName} confirmed.`});
                                  } else {
                                    setPayoutMsg({type:"err", text:"Transfer created but not confirmed — enter the OTP from Payout History to complete it."});
                                  }
                                } else {
                                  setPayoutMsg({type:"ok", text: result.message || `✅ Transfer to ${mod.moderatorName} initiated.`});
                                }
                                loadAll();
                              } catch(err) { setPayoutMsg({type:"err", text:err.message}); }
                              finally { setPayoutBusy(b => ({...b,[mod.moderatorId]:false})); }
                            }}>
                            {payoutBusy[mod.moderatorId] ? <span className="spinner"/> : "⚡ Pay via Paystack"}
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
                    {p.method === "paystack" && <>{" · "}<span style={{fontFamily:"monospace"}}>via Paystack</span></>}
                  </div>
                  {p.notes && <div style={{fontSize:"0.72rem",color:"var(--muted)",fontStyle:"italic"}}>{p.notes}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:"var(--success)",fontSize:"0.95rem",whiteSpace:"nowrap"}}>KES {kes(p.amountPaid)} · ${(p.amountPaid || 0).toFixed(2)}</div>
                  {(() => {
                    const status = p.transferStatus;
                    const badge = status === "failed" || status === "reversed"
                      ? { label: `⚠ ${status === "failed" ? "Failed" : "Reversed"}`, bg: "rgba(248,113,113,0.1)", color: "var(--error)", border: "rgba(248,113,113,0.2)" }
                      : status === "otp"
                      ? { label: "⏳ Awaiting OTP", bg: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "rgba(251,191,36,0.25)" }
                      : { label: "Paid ✓", bg: "rgba(74,222,128,0.1)", color: "var(--success)", border: "rgba(74,222,128,0.2)" };
                    return (
                      <span style={{
                        padding:"2px 8px",borderRadius:99,fontSize:"0.68rem",fontWeight:600,
                        background:badge.bg,color:badge.color,border:`1px solid ${badge.border}`
                      }}>{badge.label}</span>
                    );
                  })()}
                  {p.transferStatus === "otp" && (
                    <div style={{marginTop:6}}>
                      <button className="btn btn-xs btn-outline" onClick={async () => {
                        const otp = window.prompt("Enter the OTP to confirm this transfer:");
                        if (!otp) return;
                        try {
                          await api.finalizePayoutOtp({ payoutId: p.id, otp });
                          setPayoutMsg({type:"ok", text:"✅ Transfer confirmed."});
                          loadAll();
                        } catch(err) { setPayoutMsg({type:"err", text:err.message}); }
                      }}>Enter OTP</button>
                    </div>
                  )}
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
      </>
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
                    { label:"Total Spent", value: "KES " + kes(profileData.totalSpent) },
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
                          <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{s.billingCycle} · {"KES " + kes(s.memberPays) + "/mo"}</div>
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
                        <span style={{ color:"var(--success)", fontWeight:600 }}>{"KES " + kes(p.amount) + " · $" + (p.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* SplitCoins */}
                <h4 style={{ margin:"16px 0 10px", fontSize:"0.88rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>🪙 SplitCoins</h4>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
                  <div style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginBottom:3 }}>Balance</div>
                    <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{fmtCoins(profileData.splitCoins.balance)}</div>
                  </div>
                  <div style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginBottom:3 }}>KES Value</div>
                    <div style={{ fontWeight:600, fontSize:"0.88rem" }}>KES {kes(profileData.splitCoins.kesValue)}</div>
                  </div>
                  <div style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginBottom:3 }}>Total Earned</div>
                    <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{fmtCoins(profileData.splitCoins.balance)}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:16, fontSize:"0.78rem", color:"var(--muted)", marginBottom:8 }}>
                  <span>From purchases: <strong style={{ color:"var(--text)" }}>{fmtCoins(profileData.splitCoins.earnedFromPurchases)}</strong></span>
                  <span>From referrals: <strong style={{ color:"var(--text)" }}>{fmtCoins(profileData.splitCoins.earnedFromReferrals)}</strong></span>
                </div>
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
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Dashboard overview — matches the reference mockup: greeting + date range,
//  KPI row, Needs Attention / Your Products, Recent Activity / Quick Actions.
//  Every number comes from GET /api/admin/dashboard — nothing is fabricated.
// ═══════════════════════════════════════════════════════════════════════════
function AdminDashboardHome({ data, loading, adminName, dateRangeKey, setDateRangeKey, rangeMenuOpen, setRangeMenuOpen, rangeLabels, customFrom, setCustomFrom, customTo, setCustomTo, onRefresh, goto, navigate }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading && !data) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;
  const k  = data?.kpis || {};
  const na = data?.needsAttention || {};
  const products = data?.yourProducts || [];
  const activity = data?.recentActivity || [];

  const healthColor = { Healthy: "var(--success)", Moderate: "var(--warning)", Full: "var(--error)" };
  const healthBg    = { Healthy: "rgba(22,163,74,0.12)", Moderate: "rgba(217,119,6,0.12)", Full: "rgba(220,38,38,0.12)" };

  const activityIcon = { group_created: "🛒", payment_confirmed: "👤", moderator_approved: "🛡️" };

  const fromLabel = data?.range?.from ? new Date(data.range.from).toLocaleDateString("en-GB", { day:"numeric", month:"short" }) : "";
  const toLabel   = data?.range?.to   ? new Date(data.range.to).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "";

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <div className="admin-greeting">{greeting}, {adminName.split(" ")[0]} 👋</div>
          <div className="admin-greeting-sub">Here's what's happening with your business.</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", position:"relative" }}>
          <button className="admin-daterange" onClick={() => setRangeMenuOpen(o => !o)}>
            📅 {dateRangeKey === "all" ? "All" : `${fromLabel} – ${toLabel}`} ⌄
          </button>
          {rangeMenuOpen && (
            <div style={{ position:"absolute", top:"110%", right:70, background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, boxShadow:"var(--shadow)", zIndex:10, minWidth:210 }}>
              {Object.keys(rangeLabels).map(key => (
                <button key={key}
                  onClick={() => { setDateRangeKey(key); setRangeMenuOpen(false); }}
                  style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 14px", background: key===dateRangeKey ? "var(--bg3)" : "transparent", border:"none", cursor:"pointer", fontSize:"0.85rem", color:"var(--text)" }}>
                  {rangeLabels[key]}
                </button>
              ))}
              <div style={{ borderTop:"1px solid var(--border)", padding:"10px 14px 12px" }}>
                <div style={{ fontSize:"0.72rem", fontWeight:600, color:"var(--muted)", marginBottom:7, textTransform:"uppercase", letterSpacing:"0.03em" }}>Custom range</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:"0.7rem", color:"var(--muted)" }}>
                    From
                    <input type="date" value={customFrom} max={customTo || undefined}
                      onChange={e => setCustomFrom(e.target.value)}
                      style={{ width:"100%", marginTop:3, fontSize:"0.8rem", padding:"6px 8px", borderRadius:7, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)" }} />
                  </label>
                  <label style={{ fontSize:"0.7rem", color:"var(--muted)" }}>
                    To
                    <input type="date" value={customTo} min={customFrom || undefined}
                      onChange={e => setCustomTo(e.target.value)}
                      style={{ width:"100%", marginTop:3, fontSize:"0.8rem", padding:"6px 8px", borderRadius:7, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)" }} />
                  </label>
                  <button className="btn btn-primary btn-sm" style={{ width:"100%", marginTop:2 }}
                    disabled={!customFrom || !customTo}
                    onClick={() => { setDateRangeKey("custom"); setRangeMenuOpen(false); }}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={onRefresh}>↻</button>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <div className="admin-kpi-card admin-kpi-combo">
          <div className="admin-kpi-combo-row">
            <div className="admin-kpi-combo-left">
              <span className="admin-kpi-combo-icon" style={{ background:"rgba(22,163,74,0.14)", color:"var(--success)" }}>💵</span>
              <div>
                <div className="admin-kpi-combo-label">Revenue</div>
                <div className="admin-kpi-combo-sub">${(k.revenueUSD || 0).toFixed(2)} · sales minus commissions</div>
              </div>
            </div>
            <div className="admin-kpi-combo-value" style={{whiteSpace:"nowrap"}}>KSh {kesRaw(k.revenueKES)}</div>
          </div>
          <div className="admin-kpi-combo-divider" />
          <div className="admin-kpi-combo-row">
            <div className="admin-kpi-combo-left">
              <span className="admin-kpi-combo-icon" style={{ background:"rgba(217,119,6,0.14)", color:"var(--warning)" }}>🏷️</span>
              <div>
                <div className="admin-kpi-combo-label">Commissions</div>
                <div className="admin-kpi-combo-sub">${(k.commissionsUSD || 0).toFixed(2)} · platform fees earned</div>
              </div>
            </div>
            <div className="admin-kpi-combo-value" style={{whiteSpace:"nowrap"}}>KSh {kesRaw(k.commissionsKES)}</div>
          </div>
          <div className="admin-kpi-combo-divider" />
          <div className="admin-kpi-combo-row admin-kpi-combo-total">
            <div className="admin-kpi-combo-left">
              <span className="admin-kpi-combo-icon" style={{ background:"rgba(124,106,255,0.14)", color:"var(--accent)" }}>💰</span>
              <div>
                <div className="admin-kpi-combo-label">Total Revenue</div>
                <div className="admin-kpi-combo-sub">{fromLabel} – {toLabel}</div>
              </div>
            </div>
            <div className="admin-kpi-combo-value" style={{whiteSpace:"nowrap"}}>KSh {kesRaw(k.totalRevenueKES)}</div>
          </div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(22,163,74,0.14)", color:"var(--success)" }}>👥</div>
          <div className="admin-kpi-label">Active Customers</div>
          <div className="admin-kpi-value">{(k.activeCustomers || 0).toLocaleString()}</div>
          <div className="admin-kpi-delta up">↑ {k.newCustomers || 0} new this period</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(59,130,246,0.14)", color:"#3b82f6" }}>📑</div>
          <div className="admin-kpi-label">Active Subscriptions</div>
          <div className="admin-kpi-value">{(k.activeSubscriptions || 0).toLocaleString()}</div>
          <div className="admin-kpi-delta up">↑ {k.newConfirmedPayments || 0} new this period</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(217,119,6,0.14)", color:"var(--warning)" }}>💳</div>
          <div className="admin-kpi-label">Pending Payments</div>
          <div className="admin-kpi-value">{k.pendingPaymentsCount || 0}</div>
          <div className="admin-kpi-delta" style={{color:"var(--warning)"}}>Needs attention</div>
        </div>
      </div>

      <div className="admin-panels-row">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <span className="admin-panel-title">Needs Attention</span>
          </div>
          <div className="na-row" onClick={() => goto("payments", "pending-payments")}>
            <div className="na-icon" style={{ background:"rgba(220,38,38,0.12)", color:"var(--error)" }}>⚠️</div>
            <div style={{ flex:1 }}>
              <div className="na-title">Payments pending</div>
              <div className="na-sub">Verify and capture payments</div>
            </div>
            <div className="na-count" style={{ color:"var(--error)" }}>{na.paymentsPending || 0}</div>
            <div className="na-chev">›</div>
          </div>
          <div className="na-row" onClick={() => goto("subscriptions", "sub-confirmed")}>
            <div className="na-icon" style={{ background:"rgba(217,119,6,0.12)", color:"var(--warning)" }}>⏰</div>
            <div style={{ flex:1 }}>
              <div className="na-title">Subscriptions expiring today</div>
              <div className="na-sub">Require renewal or will be canceled</div>
            </div>
            <div className="na-count" style={{ color:"var(--warning)" }}>{na.subscriptionsExpiringToday || 0}</div>
            <div className="na-chev">›</div>
          </div>
          <div className="na-row" onClick={() => goto("marketplace", "groups")}>
            <div className="na-icon" style={{ background:"rgba(124,106,255,0.12)", color:"var(--accent)" }}>👥</div>
            <div style={{ flex:1 }}>
              <div className="na-title">Groups at capacity</div>
              <div className="na-sub">No free slots left to sell</div>
            </div>
            <div className="na-count" style={{ color:"var(--accent)" }}>{na.groupsAtCapacity || 0}</div>
            <div className="na-chev">›</div>
          </div>
          <div className="na-row" onClick={() => goto("support")}>
            <div className="na-icon" style={{ background:"rgba(59,130,246,0.12)", color:"#3b82f6" }}>💬</div>
            <div style={{ flex:1 }}>
              <div className="na-title">Open support tickets</div>
              <div className="na-sub">Require your response</div>
            </div>
            <div className="na-count" style={{ color:"#3b82f6" }}>{na.openSupportThreads || 0}</div>
            <div className="na-chev">›</div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <span className="admin-panel-title">Your Products</span>
            <button className="admin-panel-viewall" onClick={() => goto("marketplace", "groups")}>View all</button>
          </div>
          {products.length === 0 ? (
            <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No active groups yet.</p>
          ) : products.map(p => (
            <div key={p.id} className="prod-row" onClick={() => navigate("group", { id: p.id, slug: `${p.serviceName} ${p.planName}` })} style={{cursor:"pointer"}}>
              <div className="prod-icon" style={{ background:"var(--bg3)" }}>{p.serviceIcon}</div>
              <div style={{ minWidth:0, flex:"0 0 34%" }}>
                <div className="prod-name" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.serviceName}</div>
                <div className="prod-plan" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.planName}</div>
              </div>
              <div className="prod-seats">{p.filled} / {p.maxSlots} seats</div>
              <div className="prod-bar-track"><div className="prod-bar-fill" style={{ width:`${Math.min(p.pct,100)}%`, background: healthColor[p.health] }} /></div>
              <div className="prod-pct">{p.pct}%</div>
              <span className="prod-health" style={{ color: healthColor[p.health], background: healthBg[p.health] }}>{p.health}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panels-row">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <span className="admin-panel-title">Recent Activity</span>
            <button className="admin-panel-viewall" onClick={() => goto("logs")}>View all</button>
          </div>
          {activity.length === 0 ? (
            <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>Nothing has happened yet.</p>
          ) : activity.map(a => (
            <div key={a.id} className="act-row">
              <span className="act-icon">{activityIcon[a.type] || "•"}</span>
              <span>{a.text}</span>
              <span className="act-time">{timeAgo(a.timestamp)}</span>
            </div>
          ))}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head"><span className="admin-panel-title">Quick Actions</span></div>
          <div className="qa-grid">
            <button className="qa-btn" onClick={() => navigate("create")}>
              <span className="qa-icon" style={{ background:"rgba(124,106,255,0.14)", color:"var(--accent)" }}>➕</span>
              <span className="qa-label">Add Subscription</span>
            </button>
            <button className="qa-btn" onClick={() => goto("users", "all")}>
              <span className="qa-icon" style={{ background:"rgba(22,163,74,0.14)", color:"var(--success)" }}>👤</span>
              <span className="qa-label">Add Customer</span>
            </button>
            <button className="qa-btn" onClick={() => goto("reports", "reports")}>
              <span className="qa-icon" style={{ background:"rgba(59,130,246,0.14)", color:"#3b82f6" }}>📄</span>
              <span className="qa-label">Create Payment</span>
            </button>
            <button className="qa-btn" onClick={() => goto("marketing", "newsletter")}>
              <span className="qa-icon" style={{ background:"rgba(217,119,6,0.14)", color:"var(--warning)" }}>📣</span>
              <span className="qa-label">Announcement</span>
            </button>
            <button className="qa-btn" onClick={() => goto("payments", "pending-payments")}>
              <span className="qa-icon" style={{ background:"rgba(220,38,38,0.14)", color:"var(--error)" }}>💳</span>
              <span className="qa-label">Capture Payment</span>
            </button>
            <button className="qa-btn" onClick={() => goto("support")}>
              <span className="qa-icon" style={{ background:"rgba(59,130,246,0.14)", color:"#3b82f6" }}>🎧</span>
              <span className="qa-label">New Ticket</span>
            </button>
            <button className="qa-btn" onClick={() => goto("marketing", "org-email")}>
              <span className="qa-icon" style={{ background:"rgba(124,106,255,0.14)", color:"var(--accent)" }}>✉️</span>
              <span className="qa-label">Send Email</span>
            </button>
            <button className="qa-btn" onClick={() => goto("automation")}>
              <span className="qa-icon" style={{ background:"rgba(22,163,74,0.14)", color:"var(--success)" }}>⚡</span>
              <span className="qa-label">Run Automation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  if (m < 1440) return Math.floor(m / 60) + "h ago";
  return Math.floor(m / 1440) + "d ago";
}

// ── Platform Earnings view — ported from the old standalone /earnings page ──
function EarningsView() {
  const [data, setData]       = useState(null);
  const [sc, setSc]           = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedMsg, setSchedMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getEarnings(), api.getAdminSplitCoins()])
      .then(([earnings, splitcoins]) => { setData(earnings); setSc(splitcoins); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;
  if (!data) return null;

  const maxMonthly = Math.max(...data.monthlyEarnings.map(m => m.total), 0.01);

  return (
    <div className="earnings-page">
      <div className="earnings-header">
        <div>
          <h1 className="page-title" style={{fontSize:"1.5rem",marginBottom:4}}>💰 Platform Earnings</h1>
          <p className="page-sub" style={{marginBottom:0}}>Your {data.feePercent}% cut from every PesaPal payment</p>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button className="btn btn-outline btn-sm" title="Run expiry email scheduler now"
            onClick={async () => {
              try { await api.runExpiryScheduler(); setSchedMsg({type:"ok",text:"✅ Expiry scheduler ran successfully."}); }
              catch (e) { setSchedMsg({type:"err",text:"Error: " + e.message}); }
            }}>
            ⏰ Run Scheduler
          </button>
          <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {schedMsg && (
        <div className={`msg-box ${schedMsg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:16}} onClick={()=>setSchedMsg(null)}>
          {schedMsg.text} <span style={{opacity:.4}}>✕</span>
        </div>
      )}

      <div className="admin-kpi-grid" style={{ marginBottom:24 }}>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(23,166,115,0.14)", color:"var(--accent3)" }}>💰</div>
          <div className="admin-kpi-label">Gross Fee Revenue</div>
          <div className="admin-kpi-value" style={{ whiteSpace:"nowrap" }}>KES {kes(data.totalEarned)}</div>
          <div className="admin-kpi-delta">${(data.totalEarned || 0).toFixed(2)}</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(124,106,255,0.14)", color:"var(--accent)" }}>🪙</div>
          <div className="admin-kpi-label">Net Revenue (after SplitCoins)</div>
          <div className="admin-kpi-value" style={{ whiteSpace:"nowrap", color: data.netEarned < 0 ? "var(--error)" : undefined }}>KES {kes(data.netEarned)}</div>
          <div className="admin-kpi-delta">−KES {kes(data.splitCoinsKesTotal)} allocated</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(22,163,74,0.14)", color:"var(--success)" }}>✅</div>
          <div className="admin-kpi-label">Completed Payments</div>
          <div className="admin-kpi-value">{data.completedOrders}</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(217,119,6,0.14)", color:"var(--warning)" }}>⏳</div>
          <div className="admin-kpi-label">Pending Orders</div>
          <div className="admin-kpi-value">{data.pendingOrders}</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(124,106,255,0.14)", color:"var(--accent)" }}>📁</div>
          <div className="admin-kpi-label">Total Groups</div>
          <div className="admin-kpi-value">{data.totalGroups}</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(59,130,246,0.14)", color:"#3b82f6" }}>👥</div>
          <div className="admin-kpi-label">Registered Users</div>
          <div className="admin-kpi-value">{data.totalUsers}</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ background:"rgba(217,119,6,0.14)", color:"var(--warning)" }}>🛡️</div>
          <div className="admin-kpi-label">Pending Moderators</div>
          <div className="admin-kpi-value">{data.pendingModerators}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:20 }}>
        <h2 className="section-h2" style={{ marginBottom:20 }}>Monthly Earnings (Last 12 Months)</h2>
        <div className="bar-chart">
          {data.monthlyEarnings.map(m => (
            <div key={m.label} className="bar-col">
              <div className="bar-amount">{m.total > 0 ? `KES ${kes(m.total)} · $${m.total.toFixed(2)}` : ""}</div>
              <div className="bar-fill" style={{ height:`${Math.max((m.total / maxMonthly) * 120, m.total > 0 ? 4 : 0)}px` }} />
              <div className="bar-label">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {sc && (
        <div className="card" style={{ marginBottom:20 }}>
          <h2 className="section-h2" style={{ marginBottom:16 }}>🪙 SplitCoins</h2>
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <div className="admin-kpi-label">Total SplitCoins Existing</div>
              <div className="admin-kpi-value">{fmtCoins(sc.totalExisting)}</div>
              <div className="admin-kpi-delta">KES {kes(sc.totalKesValue)}</div>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-label">Earned Through Purchases</div>
              <div className="admin-kpi-value">{fmtCoins(sc.totalFromPurchases)}</div>
              <div className="admin-kpi-delta">KES {kes(sc.totalFromPurchasesKes)}</div>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-label">Earned Through Referrals</div>
              <div className="admin-kpi-value">{fmtCoins(sc.totalFromReferrals)}</div>
              <div className="admin-kpi-delta">KES {kes(sc.totalFromReferralsKes)}</div>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-label">Platform's SplitCoins</div>
              <div className="admin-kpi-value">{fmtCoins(sc.platformBalance)}</div>
              <div className="admin-kpi-delta">KES {kes(sc.platformKesValue)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="earnings-grid">
        <div className="card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>Earnings by Group</h2>
          {data.byGroup.length === 0 ? (
            <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>No earnings yet. They appear once members pay via PesaPal.</p>
          ) : data.byGroup.slice().sort((a,b) => b.fees - a.fees).map(g => (
            <div key={g.groupId} className="earning-row">
              <div>
                <div style={{ fontWeight:600, fontSize:"0.9rem" }}>{g.serviceName}</div>
                <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>{g.planName}</div>
              </div>
              <div className="earn-amount">KES {kes(g.fees)} · ${g.fees.toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="section-h2" style={{ marginBottom:16 }}>Recent Transactions</h2>
          {data.recentEarnings.length === 0 ? (
            <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>No transactions yet.</p>
          ) : data.recentEarnings.map(e => (
            <div key={e.id} className="earning-row">
              <div>
                <div style={{ fontSize:"0.82rem", fontWeight:500, fontFamily:"monospace" }}>{e.orderId?.slice(0,18)}…</div>
                <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>
                  {e.earnedAt ? new Date(e.earnedAt).toLocaleString() : "—"} · {e.currency}
                </div>
              </div>
              <div className="earn-amount earn-green">+KES {kes(e.fee)} · +${e.fee.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Subscriptions view — flattened members across all groups, filterable ──
function SubscriptionsView({ groups, tab, setTab, loadExpiredMembers }) {
  useEffect(() => {
    if (tab === "expired") loadExpiredMembers();
  }, [tab]);

  const filter = tab === "expired" ? "expired" : tab === "sub-confirmed" ? "confirmed" : tab === "sub-pending" ? "pending" : "all";

  const flattened = [];
  (groups || []).forEach(g => {
    (g.members || []).forEach(m => {
      if (m.role === "organizer") return;
      if (filter === "confirmed" && m.paymentStatus !== "confirmed") return;
      if (filter === "pending" && m.paymentStatus !== "pending") return;
      flattened.push({ ...m, groupName: `${g.serviceName} ${g.planName}`, serviceIcon: g.serviceIcon });
    });
  });

  return (
    <div>
      <div className="admin-tabs" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="sub-all"?"active":""}`} onClick={()=>setTab("sub-all")}>All</button>
        <button className={`tab-btn ${tab==="sub-confirmed"?"active":""}`} onClick={()=>setTab("sub-confirmed")}>Confirmed</button>
        <button className={`tab-btn ${tab==="sub-pending"?"active":""}`} onClick={()=>setTab("sub-pending")}>Pending</button>
        <button className={`tab-btn ${tab==="expired"?"active":""}`} onClick={()=>setTab("expired")}>Expired</button>
      </div>
      {filter !== "expired" && (
        flattened.length === 0 ? (
          <div className="empty-state"><div className="emoji">📑</div><h3>No subscriptions</h3><p>Nothing matches this filter yet.</p></div>
        ) : (
          <div className="admin-user-list">
            {flattened.map(m => (
              <div key={m.id} className="user-card card">
                <div className="user-card-left">
                  <div style={{fontSize:"1.6rem"}}>{m.serviceIcon}</div>
                  <div>
                    <div className="user-card-name">{m.name}</div>
                    <div className="user-card-email">{m.email}</div>
                    <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                      {m.groupName} · ${m.memberPays}/mo{m.durationLabel ? ` · ${m.durationLabel}` : ""}
                    </div>
                  </div>
                </div>
                <div className="user-card-right">
                  <span className={`tag tag-${m.paymentStatus}`}>{m.paymentStatus}</span>
                  {m.expiresAt && <span style={{fontSize:"0.75rem",color:"var(--muted)"}}>Expires {new Date(m.expiresAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Roles view — role distribution + promote/demote actions ──
function RolesView({ allUsers, busy, promote, demote, onProfile }) {
  const counts = {
    superadmin: allUsers.filter(u => u.role === "superadmin").length || 1,
    moderator:  allUsers.filter(u => u.role === "moderator").length,
    customer:   allUsers.filter(u => u.role === "customer").length,
  };
  const changeable = allUsers.filter(u => u.role !== "superadmin" && u.status === "active");

  return (
    <div>
      <div className="admin-kpi-grid" style={{ marginBottom:20 }}>
        <div className="admin-kpi-card"><div className="admin-kpi-label">Superadmins</div><div className="admin-kpi-value">{counts.superadmin}</div></div>
        <div className="admin-kpi-card"><div className="admin-kpi-label">Moderators</div><div className="admin-kpi-value">{counts.moderator}</div></div>
        <div className="admin-kpi-card"><div className="admin-kpi-label">Customers</div><div className="admin-kpi-value">{counts.customer}</div></div>
      </div>
      <div className="admin-panel">
        <div className="admin-panel-head"><span className="admin-panel-title">Change a user's role</span></div>
        {changeable.length === 0 ? (
          <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No active users to manage.</p>
        ) : changeable.map(u => (
          <div key={u.id} className="user-card" style={{ padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
            <div className="user-card-left">
              <div className="user-av">{u.name?.[0]?.toUpperCase()}</div>
              <div>
                <div className="user-card-name">{u.name}</div>
                <div className="user-card-email">{u.email}</div>
              </div>
            </div>
            <div className="user-card-right">
              <span className="tag" style={{ background: u.role === "moderator" ? "rgba(124,106,255,0.12)" : "rgba(22,163,74,0.12)", color: u.role === "moderator" ? "var(--accent)" : "var(--success)", border:"none" }}>{u.role}</span>
              {u.role === "customer" && (
                <button className="btn btn-sm btn-outline" disabled={busy[u.id]} onClick={() => promote(u.id)} style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}>
                  {busy[u.id] ? <span className="spinner"/> : "🛡️ Make Moderator"}
                </button>
              )}
              {u.role === "moderator" && (
                <button className="btn btn-sm btn-outline" disabled={busy[u.id]}
                  onClick={() => { if (window.confirm(`Demote ${u.name} to customer?`)) demote(u.id); }}
                  style={{ borderColor:"rgba(217,119,6,0.3)", color:"var(--warning)" }}>
                  {busy[u.id] ? <span className="spinner"/> : "👤 Make Customer"}
                </button>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => onProfile(u)} style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}>👤 Profile</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Logs view — the same real activity feed shown on the dashboard ──
function LogsView({ activity, loading, onRefresh }) {
  const activityIcon = { group_created: "🛒", payment_confirmed: "👤", moderator_approved: "🛡️" };
  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <span className="admin-panel-title">Activity Log</span>
        <button className="btn btn-sm btn-outline" onClick={onRefresh}>{loading ? <span className="spinner"/> : "↻ Refresh"}</button>
      </div>
      {(!activity || activity.length === 0) ? (
        <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>Nothing has happened yet in this period.</p>
      ) : activity.map(a => (
        <div key={a.id} className="act-row">
          <span className="act-icon">{activityIcon[a.type] || "•"}</span>
          <span>{a.text}</span>
          <span className="act-time">{timeAgo(a.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Automation view — the one real scheduled job the platform has: the
// expiry reminder scheduler. Wired to the existing admin endpoint. ──
const EMAIL_TYPE_LABELS = {
  signup_otp: "Signup OTP", password_reset_otp: "Password Reset OTP", welcome: "Welcome / Slot Confirmed",
  credentials_updated: "Credentials Updated", expiry_warning: "Expiry Warning", expiry_today: "Expiry Today",
  payment_reminder: "Payment Reminder", expired_renewal_reminder: "Expired Renewal Reminder",
  group_message: "Coordinator Message", blog_notification: "Blog Notification", group_review: "Group Review Decision",
  admin_direct: "Admin Direct Email", renewal_confirm: "Renewal Confirmed", group_approved: "Group Approved",
  group_rejected: "Group Rejected", generic: "Other", backfilled: "Historical (Imported)",
};

const EMAIL_STATUS_STYLE = {
  sent:       { bg:"rgba(59,130,246,0.14)",  color:"#3b82f6",        label:"Sent" },
  delivered:  { bg:"rgba(22,163,74,0.14)",   color:"var(--success)", label:"Delivered" },
  failed:     { bg:"rgba(220,38,38,0.14)",   color:"var(--error)",   label:"Failed" },
  bounced:    { bg:"rgba(220,38,38,0.14)",   color:"var(--error)",   label:"Bounced" },
  complained: { bg:"rgba(217,119,6,0.14)",   color:"var(--warning)", label:"Complained" },
  delayed:    { bg:"rgba(217,119,6,0.14)",   color:"var(--warning)", label:"Delayed" },
  stubbed:    { bg:"rgba(148,163,184,0.16)", color:"var(--muted)",   label:"Stubbed" },
};

function AutomationView() {
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);

  const [logs, setLogs]         = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [typeFilter, setTypeFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all")   params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim())          params.set("search", search.trim());
      const data = await api.getEmailLogs(`?${params.toString()}`);
      setLogs(data || []);
    } catch {} finally { setLogsLoading(false); }
  }, [typeFilter, statusFilter, search]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.runExpiryScheduler();
      setMsg({ type:"ok", text: r.message || "Expiry scheduler ran successfully." });
      loadLogs();
    } catch (err) { setMsg({ type:"err", text: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="admin-panel" style={{ marginBottom:20 }}>
        <div className="admin-panel-head"><span className="admin-panel-title">Automations</span></div>
        {msg && (
          <div className={`msg-box ${msg.type==="ok"?"msg-ok":"msg-err"}`} style={{marginBottom:14}} onClick={()=>setMsg(null)}>
            {msg.text} <span style={{opacity:.4}}>✕</span>
          </div>
        )}
        <div className="user-card" style={{ padding:"14px 0" }}>
          <div className="user-card-left">
            <div className="user-av" style={{background:"linear-gradient(135deg,var(--accent),var(--accent2))"}}>⏰</div>
            <div>
              <div className="user-card-name">Expiry Reminder Scheduler</div>
              <div className="user-card-email">Scans for members whose subscription expired and sends renewal reminder emails.</div>
            </div>
          </div>
          <div className="user-card-right">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={run}>
              {busy ? <span className="spinner"/> : "▶ Run Now"}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head" style={{ flexWrap:"wrap", gap:10 }}>
          <span className="admin-panel-title">📧 System Emails</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <input
              type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search recipient or subject…"
              style={{ width:220, padding:"7px 10px", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:"0.82rem" }}
            />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ width:"auto", flexShrink:0, padding:"7px 10px", fontSize:"0.82rem" }}>
              <option value="all">All types</option>
              {Object.keys(EMAIL_TYPE_LABELS).map(k => <option key={k} value={k}>{EMAIL_TYPE_LABELS[k]}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ width:"auto", flexShrink:0, padding:"7px 10px", fontSize:"0.82rem" }}>
              <option value="all">All statuses</option>
              {Object.keys(EMAIL_STATUS_STYLE).map(k => <option key={k} value={k}>{EMAIL_STATUS_STYLE[k].label}</option>)}
            </select>
            <button className="btn btn-sm btn-outline" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? <span className="spinner"/> : "↻"}
            </button>
          </div>
        </div>

        {logsLoading && logs.length === 0 ? (
          <div style={{textAlign:"center",padding:50}}><span className="spinner"/></div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📭</div>
            <h3>No emails logged yet</h3>
            <p>System emails (OTPs, reminders, confirmations…) will show up here as they're sent.</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column" }}>
            {logs.map(log => {
              const st = EMAIL_STATUS_STYLE[log.status] || EMAIL_STATUS_STYLE.sent;
              return (
                <div key={log.id} onClick={() => setSelected(log)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 6px", borderBottom:"1px solid var(--border)", cursor:"pointer" }}>
                  <span className="tag" style={{ background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--muted)", flexShrink:0, fontSize:"0.7rem" }}>
                    {EMAIL_TYPE_LABELS[log.type] || log.type}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:"0.86rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.subject}</div>
                    <div style={{ fontSize:"0.76rem", color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.to}</div>
                  </div>
                  <span style={{ fontSize:"0.72rem", color:"var(--muted)", flexShrink:0 }}>{timeAgo(log.createdAt)}</span>
                  <span style={{ background:st.bg, color:st.color, borderRadius:99, padding:"3px 11px", fontSize:"0.72rem", fontWeight:700, flexShrink:0 }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20 }}
          onClick={() => setSelected(null)}>
          <div className="card" style={{ maxWidth:640, width:"100%", maxHeight:"85vh", display:"flex", flexDirection:"column", padding:0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:"0.98rem" }}>{selected.subject}</div>
                <div style={{ fontSize:"0.8rem", color:"var(--muted)", marginTop:3 }}>
                  To {selected.to} · {EMAIL_TYPE_LABELS[selected.type] || selected.type} · {new Date(selected.createdAt).toLocaleString()}
                </div>
                {selected.error && (
                  <div style={{ fontSize:"0.78rem", color:"var(--error)", marginTop:6 }}>⚠️ {selected.error}</div>
                )}
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelected(null)}>✕</button>
            </div>
            <iframe
              title="Email preview"
              srcDoc={selected.body}
              sandbox=""
              style={{ flex:1, border:"none", width:"100%", minHeight:400, background:"#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Support view — full-page version of the floating support inbox ──
function SupportView() {
  const [threads, setThreads]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft]       = useState("");
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try { setThreads(await api.adminGetSupportThreads() || []); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [load]);

  async function openThread(t) {
    try { setSelected(await api.adminGetSupportThread(t.id)); } catch {}
  }

  async function reply(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !selected) return;
    setSending(true);
    try {
      await api.adminReplySupport(selected.id, body);
      setDraft("");
      setSelected(await api.adminGetSupportThread(selected.id));
      load();
    } catch {} finally { setSending(false); }
  }

  if (loading) return <div style={{textAlign:"center",padding:60}}><span className="spinner"/></div>;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:16, alignItems:"start" }}>
      <div className="admin-panel" style={{ padding:0, maxHeight:600, overflowY:"auto" }}>
        {threads.length === 0 ? (
          <p style={{color:"var(--muted)",fontSize:"0.85rem",padding:20}}>No conversations yet.</p>
        ) : threads.map(t => (
          <div key={t.id} onClick={() => openThread(t)} style={{
            padding:"14px 16px", borderBottom:"1px solid var(--border)", cursor:"pointer",
            background: selected?.id === t.id ? "var(--bg3)" : (t.unreadByAdmin > 0 ? "rgba(220,38,38,0.05)" : "transparent"),
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <strong style={{fontSize:"0.88rem"}}>{t.userName}</strong>
              <span style={{fontSize:"0.7rem",color:"var(--muted)"}}>{timeAgo(t.updatedAt)}</span>
            </div>
            <div style={{fontSize:"0.76rem",color:"var(--muted)",marginBottom:3}}>{t.userEmail}</div>
            <div style={{fontSize:"0.8rem", display:"flex", justifyContent:"space-between", gap:8}}>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap", fontWeight: t.unreadByAdmin>0?700:400}}>{t.lastMessage || "(no messages)"}</span>
              {t.unreadByAdmin > 0 && <span style={{background:"var(--error)",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:"0.68rem",fontWeight:700}}>{t.unreadByAdmin}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-panel" style={{ minHeight:400, display:"flex", flexDirection:"column" }}>
        {!selected ? (
          <div style={{ margin:"auto", color:"var(--muted)", fontSize:"0.88rem" }}>Select a conversation to view messages.</div>
        ) : (
          <>
            <div style={{ borderBottom:"1px solid var(--border)", paddingBottom:10, marginBottom:12 }}>
              <strong>{selected.userName}</strong>
              <span style={{ color:"var(--muted)", fontSize:"0.8rem", marginLeft:8 }}>{selected.userEmail}</span>
            </div>
            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, marginBottom:12, maxHeight:400 }}>
              {(selected.messages || []).map(m => {
                const fromAdmin = m.senderRole === "superadmin";
                return (
                  <div key={m.id} style={{ alignSelf: fromAdmin ? "flex-end" : "flex-start", maxWidth:"75%" }}>
                    <div style={{
                      background: fromAdmin ? "linear-gradient(135deg,var(--accent),var(--accent2))" : "var(--bg3)",
                      color: fromAdmin ? "#fff" : "var(--text)",
                      padding:"9px 13px", borderRadius:12, fontSize:"0.86rem", whiteSpace:"pre-wrap",
                    }}>{m.body}</div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={reply} style={{ display:"flex", gap:8 }}>
              <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a reply…" style={{ flex:1 }} />
              <button className="btn btn-primary btn-sm" disabled={sending || !draft.trim()}>{sending ? <span className="spinner"/> : "Send"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
