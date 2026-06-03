const fs = require('fs');

// ── 1. api.js — add deleteGroupMember ────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let apiLines = fs.readFileSync(apiFile, 'utf8').split('\n');

if (!apiLines.some(l => l.includes('deleteGroupMember'))) {
  const idx = apiLines.findIndex(l => l.includes('remindExpiredMember'));
  apiLines.splice(idx + 1, 0,
    '  deleteGroupMember:      (mid)  => req(`/admin/members/${mid}`, { method: "DELETE" }),'
  );
  fs.writeFileSync(apiFile, apiLines.join('\n'));
  console.log('✓ deleteGroupMember added to api.js');
} else {
  console.log('⚠ deleteGroupMember already exists');
}

// ── 2. server.js — add DELETE /api/admin/members/:id endpoint ────────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!serverLines.some(l => l.includes('/api/admin/members/:id'))) {
  const idx = serverLines.findIndex(l => l.includes('ADMIN - EXPIRED SUBSCRIPTIONS'));
  const route = [
    'app.delete("/api/admin/members/:id", requireSuperAdmin, async (req, res) => {',
    '  const member = await prisma.groupMember.findUnique({ where: { id: req.params.id } });',
    '  if (!member) return res.status(404).json({ error: "Member not found" });',
    '  await prisma.groupMember.delete({ where: { id: req.params.id } });',
    '  console.log("[ADMIN] Deleted expired member:", member.name, member.email);',
    '  res.json({ ok: true, message: member.name + " removed from group." });',
    '});',
    '',
  ];
  serverLines.splice(idx - 1, 0, ...route);
  fs.writeFileSync(serverFile, serverLines.join('\n'));
  console.log('✓ DELETE /api/admin/members/:id added to server.js');
} else {
  console.log('⚠ Delete member endpoint already exists');
}
