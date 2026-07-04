const fs = require('fs');

// ── 1. server.js — add demote endpoint ───────────────────────────────────
const serverFile = 'backend/src/server.js';
let lines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!lines.some(l => l.includes('demote-to-customer'))) {
  const idx = lines.findIndex(l => l.includes('app.patch("/api/admin/users/:id/promote-to-moderator"'));
  const route = [
    `app.patch("/api/admin/users/:id/demote-to-customer", requireSuperAdmin, async (req, res) => {`,
    `  const user = await prisma.user.findUnique({ where: { id: req.params.id } });`,
    `  if (!user) return res.status(404).json({ error: "User not found" });`,
    `  if (user.role === "superadmin") return res.status(400).json({ error: "Cannot demote superadmin" });`,
    `  if (user.role === "customer") return res.status(400).json({ error: "User is already a customer" });`,
    `  const updated = await prisma.user.update({`,
    `    where: { id: req.params.id },`,
    `    data: { role: "customer" },`,
    `  });`,
    `  // Also update their group memberships role from organizer to member if any`,
    `  await prisma.groupMember.updateMany({`,
    `    where: { userId: req.params.id, role: "moderator" },`,
    `    data: { role: "member" },`,
    `  });`,
    `  console.log("[ADMIN] Demoted to customer:", updated.email);`,
    `  res.json({ ok: true, user: updated });`,
    `});`,
    ``,
  ];
  lines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, lines.join('\n'));
  console.log('✓ demote-to-customer endpoint added');
} else {
  console.log('⚠ Already exists');
}

// ── 2. api.js — add demote method ────────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('demote')) {
  api = api.replace(
    '  adjustMemberExpiry:     (mid, days, note) => req(`/admin/members/${mid}/adjust-expiry`, { method: "PATCH", body: { days, note } }),',
    `  adjustMemberExpiry:     (mid, days, note) => req(\`/admin/members/\${mid}/adjust-expiry\`, { method: "PATCH", body: { days, note } }),\n  demoteToCustomer:       (uid) => req(\`/admin/users/\${uid}/demote-to-customer\`, { method: "PATCH" }),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ demoteToCustomer added to api.js');
} else {
  console.log('⚠ Already exists');
}

// ── 3. AdminDashboardPage.js — add demote function + button ──────────────
const adpFile = 'frontend/src/pages/AdminDashboardPage.js';
let adpLines = fs.readFileSync(adpFile, 'utf8').split('\n');

// Add demote function after promote function
if (!adpLines.some(l => l.includes('demote'))) {
  const idx = adpLines.findIndex(l => l.includes('async function promote('));
  // Find end of promote function
  let end = idx + 1;
  while (end < adpLines.length && !adpLines[end].includes('async function')) end++;
  
  adpLines.splice(end, 0,
    `  async function demote(uid) {`,
    `    setBusy(b => ({ ...b, [uid]: true }));`,
    `    try {`,
    `      await api.demoteToCustomer(uid);`,
    `      const data = await api.getUsers();`,
    `      setAllUsers(data);`,
    `    } catch (err) { alert(err.message); }`,
    `    finally { setBusy(b => ({ ...b, [uid]: false })); }`,
    `  }`,
    ``
  );
  console.log('✓ demote function added');
} else {
  console.log('⚠ demote function exists');
}

// Add demote button next to the Make Moderator button area
// Show "👤 Make Customer" button for active moderators
if (!adpLines.some(l => l.includes('Make Customer'))) {
  const idx = adpLines.findIndex(l => l.includes('"🛡️ Make Moderator"'));
  // Insert after the closing of the Make Moderator button block
  let end = idx + 1;
  while (end < adpLines.length && !adpLines[end].includes(')}')) end++;
  
  adpLines.splice(end + 1, 0,
    `                {u.status === "active" && u.role === "moderator" && (`,
    `                  <button className="btn btn-sm btn-outline" disabled={busy[u.id]} onClick={() => {`,
    `                    if (window.confirm("Demote " + u.name + " from moderator to customer? They will lose moderator privileges.")) demote(u.id);`,
    `                  }} style={{ borderColor:"rgba(251,191,36,0.3)", color:"var(--warning)" }}>`,
    `                    {busy[u.id] ? <span className="spinner"/> : "👤 Make Customer"}`,
    `                  </button>`,
    `                )}`
  );
  console.log('✓ Make Customer button added');
} else {
  console.log('⚠ Button exists');
}

fs.writeFileSync(adpFile, adpLines.join('\n'));
console.log('✓ AdminDashboardPage.js written');
console.log('\n✅ All done!');
