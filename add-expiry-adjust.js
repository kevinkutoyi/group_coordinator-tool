const fs = require('fs');

// ── 1. server.js — add adjust expiry endpoint ─────────────────────────────
const serverFile = 'backend/src/server.js';
let server = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!server.some(l => l.includes('/api/admin/members/:id/adjust-expiry'))) {
  const idx = server.findIndex(l => l.includes('app.delete("/api/admin/members/:id"'));
  const route = [
    `app.patch("/api/admin/members/:id/adjust-expiry", requireSuperAdmin, async (req, res) => {`,
    `  const { days } = req.body; // positive = add days, negative = reduce days`,
    `  if (days === undefined || days === 0) return res.status(400).json({ error: "days required (positive or negative)" });`,
    `  const member = await prisma.groupMember.findUnique({ where: { id: req.params.id } });`,
    `  if (!member) return res.status(404).json({ error: "Member not found" });`,
    `  const base = member.expiresAt && new Date(member.expiresAt) > new Date() ? new Date(member.expiresAt) : new Date();`,
    `  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);`,
    `  const updated = await prisma.groupMember.update({`,
    `    where: { id: req.params.id },`,
    `    data: { expiresAt: newExpiry },`,
    `  });`,
    `  console.log("[ADMIN] Adjusted expiry for", member.name, "by", days, "days -> new expiry:", newExpiry);`,
    `  res.json({ ok: true, member: updated, newExpiry });`,
    `});`,
    ``,
  ];
  server.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, server.join('\n'));
  console.log('✓ adjust-expiry endpoint added');
} else {
  console.log('⚠ adjust-expiry already exists');
}

// ── 2. api.js — add adjustMemberExpiry ────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('adjustMemberExpiry')) {
  api = api.replace(
    '  deleteGroupMember:      (mid)  => req(`/admin/members/${mid}`, { method: "DELETE" }),',
    `  deleteGroupMember:      (mid)  => req(\`/admin/members/\${mid}\`, { method: "DELETE" }),\n  adjustMemberExpiry:     (mid, days) => req(\`/admin/members/\${mid}/adjust-expiry\`, { method: "PATCH", body: { days } }),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ adjustMemberExpiry added to api.js');
} else {
  console.log('⚠ adjustMemberExpiry already exists');
}

// ── 3. GroupDetailPage.js — add expiry adjust UI to admin member rows ──────
const gdpFile = 'frontend/src/pages/GroupDetailPage.js';
let gdp = fs.readFileSync(gdpFile, 'utf8').split('\n');

// Add adjustExpiry function after handleDeleteCreds
if (!gdp.some(l => l.includes('adjustExpiry'))) {
  const idx = gdp.findIndex(l => l.includes('async function handleDeleteCreds'));
  const fn = [
    `  async function adjustExpiry(memberId, days) {`,
    `    try {`,
    `      await api.adjustMemberExpiry(memberId, days);`,
    `      setMsg({ type: "ok", text: (days > 0 ? "+" : "") + days + " days applied." });`,
    `      reload();`,
    `    } catch (err) { setMsg({ type: "err", text: err.message }); }`,
    `  }`,
    ``,
  ];
  gdp.splice(idx, 0, ...fn);
  console.log('✓ adjustExpiry function added');
} else {
  console.log('⚠ adjustExpiry already exists');
}

// Add +/- buttons to admin member rows
// Find the member expiry display line and add buttons after it
if (!gdp.some(l => l.includes('adjust-expiry-btns'))) {
  const idx = gdp.findIndex(l => l.includes('Expires {new Date(m.expiresAt)'));
  if (idx !== -1) {
    gdp.splice(idx + 1, 0,
      `                {canManage && (`,
      `                  <div className="adjust-expiry-btns" style={{ display:"flex", gap:4, marginTop:4 }}>`,
      `                    <button className="btn btn-sm btn-outline" style={{ padding:"2px 8px", fontSize:"0.7rem", color:"var(--error)", borderColor:"var(--error)" }}`,
      `                      onClick={() => adjustExpiry(m.id, -7)} title="Remove 7 days">-7d</button>`,
      `                    <button className="btn btn-sm btn-outline" style={{ padding:"2px 8px", fontSize:"0.7rem", color:"var(--error)", borderColor:"var(--error)" }}`,
      `                      onClick={() => adjustExpiry(m.id, -1)} title="Remove 1 day">-1d</button>`,
      `                    <button className="btn btn-sm btn-outline" style={{ padding:"2px 8px", fontSize:"0.7rem", color:"var(--success)", borderColor:"var(--success)" }}`,
      `                      onClick={() => adjustExpiry(m.id, 1)} title="Add 1 day">+1d</button>`,
      `                    <button className="btn btn-sm btn-outline" style={{ padding:"2px 8px", fontSize:"0.7rem", color:"var(--success)", borderColor:"var(--success)" }}`,
      `                      onClick={() => adjustExpiry(m.id, 7)} title="Add 7 days">+7d</button>`,
      `                    <button className="btn btn-sm btn-outline" style={{ padding:"2px 8px", fontSize:"0.7rem", color:"var(--success)", borderColor:"var(--success)" }}`,
      `                      onClick={() => adjustExpiry(m.id, 30)} title="Add 30 days">+30d</button>`,
      `                  </div>`,
      `                )}`
    );
    console.log('✓ Expiry adjust buttons added to member rows');
  } else {
    console.log('⚠ Expiry date line not found');
  }
}

fs.writeFileSync(gdpFile, gdp.join('\n'));
console.log('✓ GroupDetailPage.js written');
console.log('\n✅ All done!');
