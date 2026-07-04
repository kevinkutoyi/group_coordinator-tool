const fs = require('fs');

// ── 1. Prisma schema — add expiryAdjustmentDays and expiryAdjustedAt ──────
const schemaFile = 'backend/prisma/schema.prisma';
let schema = fs.readFileSync(schemaFile, 'utf8');

if (!schema.includes('expiryAdjustmentDays')) {
  schema = schema.replace(
    '  expiryNotifications String[] @default([])',
    `  expiryNotifications   String[]  @default([])
  expiryAdjustmentDays  Int       @default(0)   // total days added(+) or removed(-) by admin
  expiryAdjustedAt      DateTime?               // when admin last adjusted
  expiryAdjustedNote    String?                 // optional note from admin`
  );
  fs.writeFileSync(schemaFile, schema);
  console.log('✓ Schema updated');
} else {
  console.log('⚠ Schema already updated');
}

// ── 2. Migration SQL ──────────────────────────────────────────────────────
const migDir = 'backend/prisma/migrations/0004_add_expiry_adjustment';
if (!fs.existsSync(migDir)) {
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(migDir + '/migration.sql', `
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustmentDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustedAt" TIMESTAMP(3);
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustedNote" TEXT;
`);
  console.log('✓ Migration SQL created');
} else {
  console.log('⚠ Migration already exists');
}

// ── 3. server.js — add/update adjust-expiry endpoint ─────────────────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!serverLines.some(l => l.includes('/api/admin/members/:id/adjust-expiry'))) {
  const idx = serverLines.findIndex(l => l.includes('app.delete("/api/admin/members/:id"'));
  const route = [
    `app.patch("/api/admin/members/:id/adjust-expiry", requireSuperAdmin, async (req, res) => {`,
    `  const { days, note = "" } = req.body;`,
    `  if (!days || days === 0) return res.status(400).json({ error: "days required (non-zero)" });`,
    `  const member = await prisma.groupMember.findUnique({ where: { id: req.params.id } });`,
    `  if (!member) return res.status(404).json({ error: "Member not found" });`,
    `  // Calculate new expiry from current expiry (or now if expired)`,
    `  const base = member.expiresAt && new Date(member.expiresAt) > new Date()`,
    `    ? new Date(member.expiresAt)`,
    `    : new Date();`,
    `  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);`,
    `  const updated = await prisma.groupMember.update({`,
    `    where: { id: req.params.id },`,
    `    data: {`,
    `      expiresAt:            newExpiry,`,
    `      expiryAdjustmentDays: (member.expiryAdjustmentDays || 0) + days,`,
    `      expiryAdjustedAt:     new Date(),`,
    `      expiryAdjustedNote:   note || null,`,
    `    },`,
    `  });`,
    `  console.log("[ADMIN] Expiry adjusted for", member.name, "by", days, "days. New expiry:", newExpiry, "Total adjustment:", updated.expiryAdjustmentDays, "days");`,
    `  res.json({ ok: true, member: updated, newExpiry, totalAdjustmentDays: updated.expiryAdjustmentDays });`,
    `});`,
    ``,
  ];
  serverLines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, serverLines.join('\n'));
  console.log('✓ adjust-expiry endpoint added');
} else {
  console.log('⚠ adjust-expiry already exists');
}

// ── 4. api.js ─────────────────────────────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('adjustMemberExpiry')) {
  api = api.replace(
    '  deleteGroupMember:      (mid)  => req(`/admin/members/${mid}`, { method: "DELETE" }),',
    `  deleteGroupMember:      (mid)       => req(\`/admin/members/\${mid}\`, { method: "DELETE" }),\n  adjustMemberExpiry:     (mid, days, note) => req(\`/admin/members/\${mid}/adjust-expiry\`, { method: "PATCH", body: { days, note } }),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ api.js updated');
} else {
  console.log('⚠ api.js already updated');
}

// ── 5. GroupDetailPage.js — add adjustExpiry function + UI ────────────────
const gdpFile = 'frontend/src/pages/GroupDetailPage.js';
let gdp = fs.readFileSync(gdpFile, 'utf8').split('\n');

// Add adjustExpiry function
if (!gdp.some(l => l.includes('async function adjustExpiry'))) {
  const idx = gdp.findIndex(l => l.includes('async function handleDeleteCreds'));
  const fn = [
    `  async function adjustExpiry(memberId, days) {`,
    `    try {`,
    `      const r = await api.adjustMemberExpiry(memberId, days);`,
    `      setMsg({ type: "ok", text: (days > 0 ? "+" : "") + days + " days applied. New expiry: " + new Date(r.newExpiry).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) + ". Total adjustment: " + (r.totalAdjustmentDays > 0 ? "+" : "") + r.totalAdjustmentDays + "d" });`,
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

// Add admin badge + buttons after expiry date display
if (!gdp.some(l => l.includes('adjust-expiry-btns'))) {
  const idx = gdp.findIndex(l => l.includes('Expires {new Date(m.expiresAt)'));
  if (idx !== -1) {
    gdp.splice(idx + 1, 0,
      `                {canManage && (`,
      `                  <div style={{ marginTop: 6 }}>`,
      `                    {/* Admin adjustment badge */}`,
      `                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>`,
      `                      <span style={{`,
      `                        fontSize:"0.68rem", fontWeight:700, padding:"2px 8px", borderRadius:99,`,
      `                        background: m.expiryAdjustmentDays > 0 ? "rgba(74,222,128,0.12)" : m.expiryAdjustmentDays < 0 ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)",`,
      `                        color: m.expiryAdjustmentDays > 0 ? "var(--success)" : m.expiryAdjustmentDays < 0 ? "var(--error)" : "var(--muted)",`,
      `                        border: "1px solid " + (m.expiryAdjustmentDays > 0 ? "rgba(74,222,128,0.25)" : m.expiryAdjustmentDays < 0 ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.1)"),`,
      `                      }}>`,
      `                        🛡️ Admin adjusted: {m.expiryAdjustmentDays > 0 ? "+" : ""}{m.expiryAdjustmentDays || 0}d`,
      `                      </span>`,
      `                      {m.expiryAdjustedAt && (`,
      `                        <span style={{ fontSize:"0.65rem", color:"var(--muted)" }}>`,
      `                          Last: {new Date(m.expiryAdjustedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`,
      `                        </span>`,
      `                      )}`,
      `                    </div>`,
      `                    {/* Adjust buttons */}`,
      `                    <div className="adjust-expiry-btns" style={{ display:"flex", gap:4, flexWrap:"wrap" }}>`,
      `                      {[-30,-7,-1,1,7,30].map(d => (`,
      `                        <button key={d} className="btn btn-sm btn-outline"`,
      `                          style={{ padding:"2px 8px", fontSize:"0.7rem",`,
      `                            color: d < 0 ? "var(--error)" : "var(--success)",`,
      `                            borderColor: d < 0 ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)" }}`,
      `                          onClick={() => adjustExpiry(m.id, d)}`,
      `                          title={(d > 0 ? "Add " : "Remove ") + Math.abs(d) + " days"}>`,
      `                          {d > 0 ? "+" : ""}{d}d`,
      `                        </button>`,
      `                      ))}`,
      `                    </div>`,
      `                  </div>`,
      `                )}`
    );
    console.log('✓ Admin badge + adjust buttons added');
  } else {
    console.log('⚠ Expiry line not found');
  }
}

fs.writeFileSync(gdpFile, gdp.join('\n'));
console.log('✓ GroupDetailPage.js written');
console.log('\n✅ All done!');