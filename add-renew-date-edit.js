const fs = require('fs');

// ── 1. server.js — add PATCH /api/groups/:id/renew-date endpoint ──────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!serverLines.some(l => l.includes('/api/groups/:id/renew-date'))) {
  const idx = serverLines.findIndex(l => l.includes('app.patch("/api/groups/:id/status"'));
  const route = [
    `app.patch("/api/groups/:id/renew-date", requireRole("moderator", "superadmin"), async (req, res) => {`,
    `  const { renewDate } = req.body;`,
    `  const group = await prisma.group.findUnique({ where: { id: req.params.id } });`,
    `  if (!group) return res.status(404).json({ error: "Group not found" });`,
    `  const updated = await prisma.group.update({`,
    `    where: { id: req.params.id },`,
    `    data: {`,
    `      renewDate: renewDate ? new Date(renewDate) : null,`,
    `      renewReminderSent: false, // reset so reminder can be sent again`,
    `    },`,
    `  });`,
    `  console.log("[GROUP] Renew date set for", group.serviceName, group.planName, "->", renewDate);`,
    `  res.json({ ok: true, group: updated });`,
    `});`,
    ``,
  ];
  serverLines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, serverLines.join('\n'));
  console.log('✓ renew-date endpoint added');
} else { console.log('⚠ Already exists'); }

// ── 2. api.js — add setGroupRenewDate ────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('setGroupRenewDate')) {
  api = api.replace(
    '  renewSlot:              (gid)  => req(`/groups/${gid}/renew`, { method: "POST" }),',
    `  renewSlot:              (gid)        => req(\`/groups/\${gid}/renew\`, { method: "POST" }),\n  setGroupRenewDate:      (gid, date)  => req(\`/groups/\${gid}/renew-date\`, { method: "PATCH", body: { renewDate: date } }),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ setGroupRenewDate added to api.js');
} else { console.log('⚠ Already exists'); }

// ── 3. GroupDetailPage.js — add renew date section ───────────────────────
const gdpFile = 'frontend/src/pages/GroupDetailPage.js';
let gdpLines = fs.readFileSync(gdpFile, 'utf8').split('\n');

// Add renewDate state
if (!gdpLines.some(l => l.includes('renewDate') && l.includes('useState'))) {
  const idx = gdpLines.findIndex(l => l.includes('const [msg, setMsg]'));
  gdpLines.splice(idx + 1, 0,
    `  const [renewDate, setRenewDate]     = useState(group?.renewDate ? new Date(group.renewDate).toISOString().split('T')[0] : "");`,
    `  const [renewDateBusy, setRenewDateBusy] = useState(false);`,
    `  const [renewDateMsg, setRenewDateMsg]   = useState(null);`
  );
  console.log('✓ renewDate state added');
} else { console.log('⚠ State exists'); }

// Add saveRenewDate function
if (!gdpLines.some(l => l.includes('saveRenewDate'))) {
  const idx = gdpLines.findIndex(l => l.includes('async function handleStatusChange'));
  gdpLines.splice(idx, 0,
    `  async function saveRenewDate() {`,
    `    setRenewDateBusy(true); setRenewDateMsg(null);`,
    `    try {`,
    `      await api.setGroupRenewDate(id, renewDate || null);`,
    `      setRenewDateMsg({ type: "ok", text: renewDate ? "Renew date saved." : "Renew date cleared." });`,
    `      reload();`,
    `    } catch (err) { setRenewDateMsg({ type: "err", text: err.message }); }`,
    `    finally { setRenewDateBusy(false); }`,
    `  }`,
    ``
  );
  console.log('✓ saveRenewDate function added');
} else { console.log('⚠ Function exists'); }

// Add renew date UI in admin overview section
if (!gdpLines.some(l => l.includes('Subscription Renew Date'))) {
  const idx = gdpLines.findIndex(l => l.includes('"🛡️ Admin View"'));
  // Find end of admin view section - look for the closing of isSuperAdmin block
  let end = idx + 1;
  while (end < gdpLines.length && !gdpLines[end].includes(')}')) end++;

  gdpLines.splice(end + 1, 0,
    `              {canManage && (`,
    `                <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(124,106,255,0.06)", borderRadius: 10, border: "1px solid rgba(124,106,255,0.15)" }}>`,
    `                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>📅 Subscription Renew Date <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(admin only)</span></div>`,
    `                  {group.renewDate && (() => {`,
    `                    const days = Math.ceil((new Date(group.renewDate) - new Date()) / (1000*60*60*24));`,
    `                    const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";`,
    `                    return <div style={{ fontSize:"0.78rem", color, fontWeight:600, marginBottom:8 }}>`,
    `                      {days <= 0 ? "⛔ OVERDUE by " + Math.abs(days) + "d" : days <= 3 ? "⚠️ Due in " + days + "d" : days <= 7 ? "⚠️ Due in " + days + "d" : "✓ Due in " + days + "d"}`,
    `                      {" — "}{new Date(group.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`,
    `                    </div>;`,
    `                  })()}`,
    `                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>`,
    `                    <input type="date" value={renewDate}`,
    `                      onChange={e => setRenewDate(e.target.value)}`,
    `                      style={{ padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem" }}`,
    `                    />`,
    `                    <button className="btn btn-sm btn-primary" disabled={renewDateBusy} onClick={saveRenewDate}>`,
    `                      {renewDateBusy ? <><span className="spinner"/> Saving…</> : "💾 Save"}`,
    `                    </button>`,
    `                    {renewDate && <button className="btn btn-sm btn-outline" style={{ color:"var(--error)", borderColor:"var(--error)" }} onClick={() => { setRenewDate(""); }}>✕ Clear</button>}`,
    `                  </div>`,
    `                  {renewDateMsg && <div className={"msg-box " + (renewDateMsg.type==="ok"?"msg-ok":"msg-err")} style={{ marginTop:8, fontSize:"0.78rem" }} onClick={() => setRenewDateMsg(null)}>{renewDateMsg.text}</div>}`,
    `                </div>`,
    `              )}`
  );
  console.log('✓ Renew date UI added to GroupDetailPage');
} else { console.log('⚠ UI exists'); }

fs.writeFileSync(gdpFile, gdpLines.join('\n'));
console.log('✓ GroupDetailPage.js written');
console.log('\n✅ All done!');
