const fs = require("fs");

// ── 1. api.js ─────────────────────────────────────────────────────────────
const apiFile = "frontend/src/api.js";
let apiLines = fs.readFileSync(apiFile, "utf8").split("\n");

if (!apiLines.some(l => l.includes("renewSlot"))) {
  const idx = apiLines.findIndex(l => l.includes("adminReplySupport"));
  apiLines.splice(idx + 1, 0,
    '  renewSlot:              (gid)  => req(`/groups/${gid}/renew`, { method: "POST" }),',
    '',
    '  // Expired subscriptions',
    '  getExpiredMembers:      ()     => req("/admin/expired-members"),',
    '  remindExpiredAll:       ()     => req("/admin/expired-members/remind-all", { method: "POST" }),',
    '  remindExpiredMember:    (id)   => req(`/admin/expired-members/${id}/remind`, { method: "POST" }),'
  );
  fs.writeFileSync(apiFile, apiLines.join("\n"));
  console.log("✓ api.js patched");
} else {
  console.log("⚠ api.js already patched");
}

// ── 2. server.js ──────────────────────────────────────────────────────────
const serverFile = "backend/src/server.js";
let serverLines = fs.readFileSync(serverFile, "utf8").split("\n");

if (!serverLines.some(l => l.includes("/api/admin/expired-members"))) {
  const idx = serverLines.findIndex(l => l.includes("SUPER ADMIN") && l.includes("EARNINGS"));
  const routes = [
    '// ═══════════════════════════════════════════════════════════════════════════',
    '//  ADMIN - EXPIRED SUBSCRIPTIONS',
    '// ═══════════════════════════════════════════════════════════════════════════',
    '',
    'app.get("/api/admin/expired-members", requireSuperAdmin, async (req, res) => {',
    '  const now = new Date();',
    '  const members = await prisma.groupMember.findMany({',
    '    where: { role: { not: "organizer" }, paymentStatus: { in: ["expired", "confirmed"] }, expiresAt: { not: null, lte: now } },',
    '    include: { group: true },',
    '    orderBy: { expiresAt: "asc" },',
    '  });',
    '  res.json(members.map(m => ({',
    '    id: m.id, userId: m.userId, name: m.name, email: m.email, groupId: m.groupId,',
    '    groupName:    m.group.serviceName + " " + m.group.planName,',
    '    serviceIcon:  m.group.serviceIcon,',
    '    serviceName:  m.group.serviceName,',
    '    planName:     m.group.planName,',
    '    memberPays:   m.memberPays || m.group.memberPays,',
    '    billingCycle: m.group.billingCycle,',
    '    expiresAt:    m.expiresAt,',
    '    daysExpired:  Math.floor((now - new Date(m.expiresAt)) / (1000 * 60 * 60 * 24)),',
    '    paymentStatus: m.paymentStatus,',
    '  })));',
    '});',
    '',
    'app.post("/api/admin/expired-members/remind-all", requireSuperAdmin, async (req, res) => {',
    '  const now = new Date();',
    '  const members = await prisma.groupMember.findMany({',
    '    where: { role: { not: "organizer" }, paymentStatus: { in: ["expired", "confirmed"] }, expiresAt: { not: null, lte: now } },',
    '    include: { group: true },',
    '  });',
    '  if (!members.length) return res.json({ message: "No expired members found.", sent: 0, failed: 0 });',
    '  let sent = 0, failed = 0;',
    '  for (const m of members) {',
    '    try {',
    '      await emailService.sendExpiredRenewalReminder({',
    '        to: m.email, memberName: m.name,',
    '        groupName: m.group.serviceName + " " + m.group.planName,',
    '        serviceName: m.group.serviceName, planName: m.group.planName,',
    '        memberPays: m.memberPays || m.group.memberPays,',
    '        billingCycle: m.group.billingCycle, expiresAt: m.expiresAt,',
    '        daysExpired: Math.floor((now - new Date(m.expiresAt)) / (1000 * 60 * 60 * 24)),',
    '        renewUrl: (process.env.FRONTEND_URL || "https://splitsubs.com") + "/group/" + m.groupId,',
    '      });',
    '      sent++;',
    '    } catch { failed++; }',
    '  }',
    '  res.json({ message: "Reminders sent to " + sent + " expired member" + (sent !== 1 ? "s" : "") + "." + (failed > 0 ? " " + failed + " failed." : ""), sent, failed });',
    '});',
    '',
    'app.post("/api/admin/expired-members/:memberId/remind", requireSuperAdmin, async (req, res) => {',
    '  const now = new Date();',
    '  const member = await prisma.groupMember.findUnique({ where: { id: req.params.memberId }, include: { group: true } });',
    '  if (!member) return res.status(404).json({ error: "Member not found" });',
    '  try {',
    '    await emailService.sendExpiredRenewalReminder({',
    '      to: member.email, memberName: member.name,',
    '      groupName: member.group.serviceName + " " + member.group.planName,',
    '      serviceName: member.group.serviceName, planName: member.group.planName,',
    '      memberPays: member.memberPays || member.group.memberPays,',
    '      billingCycle: member.group.billingCycle, expiresAt: member.expiresAt,',
    '      daysExpired: Math.floor((now - new Date(member.expiresAt)) / (1000 * 60 * 60 * 24)),',
    '      renewUrl: (process.env.FRONTEND_URL || "https://splitsubs.com") + "/group/" + member.groupId,',
    '    });',
    '    res.json({ message: "Reminder sent to " + member.name + ".", ok: true });',
    '  } catch (err) { res.status(500).json({ error: "Could not send reminder" }); }',
    '});',
    '',
  ];
  serverLines.splice(idx - 1, 0, ...routes);
  fs.writeFileSync(serverFile, serverLines.join("\n"));
  console.log("✓ server.js patched");
} else {
  console.log("⚠ server.js already patched");
}

// ── 3. emailService.js ────────────────────────────────────────────────────
const emailFile = "backend/src/emailService.js";
let emailLines = fs.readFileSync(emailFile, "utf8").split("\n");

if (!emailLines.some(l => l.includes("sendExpiredRenewalReminder"))) {
  const idx = emailLines.findIndex(l => l.includes("module.exports"));
  const template = [
    '',
    'async function sendExpiredRenewalReminder({ to, memberName, groupName, serviceName, planName,',
    '  memberPays, billingCycle, expiresAt, daysExpired, renewUrl }) {',
    '  const expStr = new Date(expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });',
    '  const html = wrap(',
    '    "<h1>Your " + serviceName + " subscription has expired</h1>" +',
    '    "<div class=\'badge-red\'>Expired " + daysExpired + " day" + (daysExpired !== 1 ? "s" : "") + " ago</div>" +',
    '    "<p>Hi <span class=\'hi\'>" + memberName + "</span>,</p>" +',
    '    "<p>Your slot in <span class=\'hi\'>" + groupName + "</span> expired on <span style=\'color:#f87171;font-weight:600\'>" + expStr + "</span>.</p>" +',
    '    "<p>Renew now to get back in — your spot may still be available.</p>" +',
    '    "<table class=\'table\'>" +',
    '    "<tr><td>Group</td><td>" + groupName + "</td></tr>" +',
    '    "<tr><td>Service</td><td>" + serviceName + " - " + planName + "</td></tr>" +',
    '    "<tr><td>Billing cycle</td><td><span class=\'pill\'>" + (billingCycle || "Monthly") + "</span></td></tr>" +',
    '    "<tr><td>Renewal amount</td><td style=\'color:#4ade80;font-weight:700\'>$" + memberPays + "</td></tr>" +',
    '    "<tr><td>Expired on</td><td style=\'color:#f87171\'>" + expStr + "</td></tr>" +',
    '    "</table>" +',
    '    "<a href=\'" + renewUrl + "\' class=\'btn\' style=\'background:linear-gradient(90deg,#f59e0b,#ef4444)\'>Renew My Subscription</a>" +',
    '    "<hr/>" +',
    '    "<p style=\'font-size:13px;color:#666688\'>If you no longer wish to be part of this group, simply ignore this email.</p>",',
    '    "Your " + serviceName + " expired " + daysExpired + " day" + (daysExpired !== 1 ? "s" : "") + " ago"',
    '  );',
    '  return sendEmail({ to, subject: "Renew now - " + serviceName + " expired " + daysExpired + "d ago", html });',
    '}',
    '',
  ];
  emailLines.splice(idx, 0, ...template);
  const exportIdx = emailLines.findIndex(l => l.includes("sendGroupMessage, sendRenewalConfirm, runExpiryScheduler,"));
  if (exportIdx !== -1) {
    emailLines[exportIdx] = '  sendGroupMessage, sendRenewalConfirm, runExpiryScheduler, sendExpiredRenewalReminder,';
  }
  fs.writeFileSync(emailFile, emailLines.join("\n"));
  console.log("✓ emailService.js patched");
} else {
  console.log("⚠ emailService.js already patched");
}

// ── 4. AdminDashboardPage.js ──────────────────────────────────────────────
const adpFile = "frontend/src/pages/AdminDashboardPage.js";
let adpLines = fs.readFileSync(adpFile, "utf8").split("\n");

if (!adpLines.some(l => l.includes("expiredMembers"))) {
  const idx = adpLines.findIndex(l => l.includes("setPendingPayments] = useState"));
  adpLines.splice(idx + 1, 0,
    '',
    '  // Expired subscriptions',
    '  const [expiredMembers, setExpiredMembers] = useState([]);',
    '  const [expiredLoading, setExpiredLoading] = useState(false);',
    '  const [expiredMsg, setExpiredMsg]         = useState(null);',
    '  const [remindAllBusy, setRemindAllBusy]   = useState(false);'
  );
  console.log("✓ State added");
} else { console.log("⚠ State exists"); }

if (!adpLines.some(l => l.includes("loadExpiredMembers"))) {
  const idx = adpLines.findIndex(l => l.includes("async function sendPaymentReminder"));
  adpLines.splice(idx, 0,
    '  async function loadExpiredMembers() {',
    '    setExpiredLoading(true); setExpiredMsg(null);',
    '    try { const data = await api.getExpiredMembers(); setExpiredMembers(data); }',
    '    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }',
    '    finally { setExpiredLoading(false); }',
    '  }',
    '',
    '  async function remindExpiredAll() {',
    '    if (!window.confirm("Send renewal reminders to all " + expiredMembers.length + " expired members?")) return;',
    '    setRemindAllBusy(true); setExpiredMsg(null);',
    '    try { const r = await api.remindExpiredAll(); setExpiredMsg({ type: "ok", text: r.message }); loadExpiredMembers(); }',
    '    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }',
    '    finally { setRemindAllBusy(false); }',
    '  }',
    '',
    '  async function remindExpiredOne(memberId) {',
    '    setBusy(b => ({ ...b, [memberId]: true })); setExpiredMsg(null);',
    '    try { const r = await api.remindExpiredMember(memberId); setExpiredMsg({ type: "ok", text: r.message }); }',
    '    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }',
    '    finally { setBusy(b => ({ ...b, [memberId]: false })); }',
    '  }',
    ''
  );
  console.log("✓ Functions added");
} else { console.log("⚠ Functions exist"); }

if (!adpLines.some(l => l.includes('key:"expired"'))) {
  const idx = adpLines.findIndex(l => l.includes('key:"payouts"'));
  adpLines.splice(idx + 1, 0,
    '          {key:"expired", label:"🔴 Expired" + (expiredMembers.length > 0 ? " (" + expiredMembers.length + ")" : "")},'
  );
  console.log("✓ Tab button added");
} else { console.log("⚠ Tab button exists"); }

if (!adpLines.some(l => l.includes("loadExpiredMembers()"))) {
  const idx = adpLines.findIndex(l => l.includes("onClick={() => setTab(t.key)}"));
  if (idx !== -1) {
    adpLines[idx] = adpLines[idx].replace(
      "onClick={() => setTab(t.key)}",
      'onClick={() => { setTab(t.key); if (t.key === "expired") loadExpiredMembers(); }}'
    );
    console.log("✓ Auto-load added");
  }
} else { console.log("⚠ Auto-load exists"); }

if (!adpLines.some(l => l.includes('tab === "expired"'))) {
  const idx = adpLines.findIndex(l => l.includes("{/* Reject modal */}"));
  adpLines.splice(idx, 0,
    '      {tab === "expired" && (',
    '        <div>',
    '          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>',
    '            <div>',
    '              <h2 className="section-h2" style={{margin:0}}>🔴 Expired Subscriptions</h2>',
    '              <p style={{color:"var(--muted)",fontSize:"0.82rem",marginTop:4,marginBottom:0}}>Members whose subscriptions have lapsed. Send personalised renewal reminders.</p>',
    '            </div>',
    '            <div style={{display:"flex",gap:10}}>',
    '              <button className="btn btn-sm btn-outline" onClick={loadExpiredMembers} disabled={expiredLoading}>',
    '                {expiredLoading ? <span className="spinner"/> : "↻ Refresh"}',
    '              </button>',
    '              {expiredMembers.length > 0 && (',
    '                <button className="btn btn-sm btn-primary" style={{background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}',
    '                  disabled={remindAllBusy||expiredLoading} onClick={remindExpiredAll}>',
    '                  {remindAllBusy ? <><span className="spinner"/> Sending…</> : "📨 Remind All (" + expiredMembers.length + ")"}',
    '                </button>',
    '              )}',
    '            </div>',
    '          </div>',
    '          {expiredMsg && (',
    '            <div className={"msg-box " + (expiredMsg.type==="ok"?"msg-ok":"msg-err")} style={{marginBottom:16}} onClick={()=>setExpiredMsg(null)}>',
    '              {expiredMsg.text} <span style={{opacity:.4}}>✕</span>',
    '            </div>',
    '          )}',
    '          {expiredMembers.length > 0 && (',
    '            <div className="stats-row" style={{marginBottom:20}}>',
    '              <div className="stat-card"><div className="stat-value" style={{color:"var(--error)"}}>{expiredMembers.length}</div><div className="stat-label">Total Expired</div></div>',
    '              <div className="stat-card"><div className="stat-value" style={{color:"var(--warning)"}}>{expiredMembers.filter(m=>m.daysExpired<=7).length}</div><div className="stat-label">Expired 7d or less</div></div>',
    '              <div className="stat-card"><div className="stat-value" style={{color:"var(--error)"}}>{expiredMembers.filter(m=>m.daysExpired>7).length}</div><div className="stat-label">Expired over 7d</div></div>',
    '              <div className="stat-card"><div className="stat-value" style={{color:"var(--accent)"}}>{"$" + expiredMembers.reduce((a,m)=>a+(m.memberPays||0),0).toFixed(2)}</div><div className="stat-label">Potential Revenue</div></div>',
    '            </div>',
    '          )}',
    '          {expiredLoading ? <div style={{textAlign:"center",padding:60}}><span className="spinner"/></div>',
    '          : expiredMembers.length === 0 ? (',
    '            <div className="empty-state"><div className="emoji">🎉</div><h3>No expired subscriptions</h3><p>All confirmed members are still active.</p></div>',
    '          ) : expiredMembers.map(m => (',
    '            <div key={m.id} className="card" style={{marginBottom:12,padding:16,',
    '              borderLeft:m.daysExpired<=3?"3px solid var(--error)":m.daysExpired<=7?"3px solid var(--warning)":"3px solid var(--border)"}}>',
    '              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>',
    '                <div style={{fontSize:"1.8rem"}}>{m.serviceIcon}</div>',
    '                <div style={{flex:1,minWidth:0}}>',
    '                  <div style={{fontWeight:600,fontSize:"0.95rem"}}>{m.name}</div>',
    '                  <div style={{fontSize:"0.78rem",color:"var(--muted)",wordBreak:"break-all"}}>{m.email}</div>',
    '                  <div style={{fontSize:"0.78rem",marginTop:4}}>',
    '                    <strong style={{color:"var(--text)"}}>{m.groupName}</strong>',
    '                    {" · "}<span style={{color:"var(--accent)"}}>{"$" + m.memberPays + "/mo"}</span>',
    '                    {" · "}<span style={{color:"var(--muted)"}}>{m.billingCycle}</span>',
    '                  </div>',
    '                  <div style={{fontSize:"0.74rem",marginTop:3}}>',
    '                    <span style={{color:"var(--error)",fontWeight:600}}>{"🔴 Expired " + m.daysExpired + " day" + (m.daysExpired!==1?"s":"") + " ago"}</span>',
    '                    <span style={{color:"var(--muted)",marginLeft:8}}>{"(" + new Date(m.expiresAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) + ")"}</span>',
    '                  </div>',
    '                </div>',
    '                <button className="btn btn-sm btn-primary"',
    '                  style={{whiteSpace:"nowrap",background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}',
    '                  disabled={busy[m.id]} onClick={()=>remindExpiredOne(m.id)}>',
    '                  {busy[m.id] ? <><span className="spinner"/> Sending…</> : "📧 Send Reminder"}',
    '                </button>',
    '              </div>',
    '            </div>',
    '          ))}',
    '        </div>',
    '      )}',
    ''
  );
  console.log("✓ UI panel added");
} else { console.log("⚠ UI panel exists"); }

fs.writeFileSync(adpFile, adpLines.join("\n"));
console.log("✓ AdminDashboardPage.js written");
console.log("\n✅ All patches complete!");