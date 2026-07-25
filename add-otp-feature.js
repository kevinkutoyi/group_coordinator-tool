const fs = require('fs');

// ── 1. Prisma schema — add inboundEmail and otpCode to Group ──────────────
const schemaFile = 'backend/prisma/schema.prisma';
let schema = fs.readFileSync(schemaFile, 'utf8');

if (!schema.includes('inboundEmail')) {
  schema = schema.replace(
    '  renewDate      DateTime?',
    `  inboundEmail   String?                 // e.g. netflix@inbound.splitsubs.com\n  latestOtp      String?                 // latest OTP received via email\n  otpReceivedAt  DateTime?               // when OTP was received\n  otpSubject     String?                 // email subject for context\n  renewDate      DateTime?`
  );
  fs.writeFileSync(schemaFile, schema);
  console.log('✓ Schema updated with OTP fields');
} else { console.log('⚠ Schema already updated'); }

// ── 2. Migration SQL ──────────────────────────────────────────────────────
const migDir = 'backend/prisma/migrations/0006_add_otp_fields';
if (!fs.existsSync(migDir)) {
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(migDir + '/migration.sql',
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "inboundEmail" TEXT;\n` +
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "latestOtp" TEXT;\n` +
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "otpReceivedAt" TIMESTAMP(3);\n` +
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "otpSubject" TEXT;\n`
  );
  console.log('✓ Migration SQL created');
} else { console.log('⚠ Migration exists'); }

// ── 3. server.js ──────────────────────────────────────────────────────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

// A: Add inbound email webhook endpoint
if (!serverLines.some(l => l.includes('/api/inbound/email'))) {
  const idx = serverLines.findIndex(l => l.includes('app.post("/api/paystack/webhook"'));
  const route = [
    `// ═══════════════════════════════════════════════════════════════════════════`,
    `//  RESEND INBOUND EMAIL — OTP CAPTURE`,
    `// ═══════════════════════════════════════════════════════════════════════════`,
    ``,
    `app.post("/api/inbound/email", express.json(), async (req, res) => {`,
    `  res.sendStatus(200); // always respond quickly`,
    `  try {`,
    `    const event = req.body;`,
    `    if (event.type !== "email.received") return;`,
    ``,
    `    const emailId = event.data?.email_id;`,
    `    const toAddresses = event.data?.to || [];`,
    `    const subject = event.data?.subject || "";`,
    ``,
    `    console.log("[INBOUND] Email received for:", toAddresses, "Subject:", subject);`,
    ``,
    `    // Fetch full email content from Resend API`,
    `    const https = require("https");`,
    `    const emailContent = await new Promise((resolve, reject) => {`,
    `      const options = {`,
    `        hostname: "api.resend.com",`,
    `        path: "/emails/" + emailId,`,
    `        method: "GET",`,
    `        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY },`,
    `      };`,
    `      const req2 = https.request(options, res2 => {`,
    `        let data = "";`,
    `        res2.on("data", c => data += c);`,
    `        res2.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });`,
    `      });`,
    `      req2.on("error", reject);`,
    `      req2.end();`,
    `    });`,
    ``,
    `    const body = emailContent.text || emailContent.html || "";`,
    `    console.log("[INBOUND] Email body preview:", body.substring(0, 200));`,
    ``,
    `    // Extract OTP — look for 4-8 digit codes`,
    `    const otpMatch = body.match(/\\b(\\d{4,8})\\b/);`,
    `    const otp = otpMatch ? otpMatch[1] : null;`,
    ``,
    `    if (!otp) {`,
    `      console.log("[INBOUND] No OTP found in email body");`,
    `      return;`,
    `    }`,
    ``,
    `    console.log("[INBOUND] OTP extracted:", otp);`,
    ``,
    `    // Find group by inbound email address`,
    `    for (const toAddr of toAddresses) {`,
    `      const group = await prisma.group.findFirst({`,
    `        where: { inboundEmail: { equals: toAddr, mode: "insensitive" } },`,
    `      });`,
    ``,
    `      if (group) {`,
    `        await prisma.group.update({`,
    `          where: { id: group.id },`,
    `          data: {`,
    `            latestOtp:     otp,`,
    `            otpReceivedAt: new Date(),`,
    `            otpSubject:    subject,`,
    `          },`,
    `        });`,
    `        console.log("[INBOUND] OTP", otp, "saved to group:", group.serviceName, group.planName);`,
    `      } else {`,
    `        console.log("[INBOUND] No group found for email:", toAddr);`,
    `      }`,
    `    }`,
    `  } catch (err) {`,
    `    console.error("[INBOUND] Error:", err.message);`,
    `  }`,
    `});`,
    ``,
    `// Get current OTP for a group (members only)`,
    `app.get("/api/groups/:id/otp", requireAuth, async (req, res) => {`,
    `  const group = await prisma.group.findUnique({ where: { id: req.params.id } });`,
    `  if (!group) return res.status(404).json({ error: "Group not found" });`,
    ``,
    `  // Check if user is a confirmed member or organizer`,
    `  const isOrganizer = group.organizerId === req.user.id;`,
    `  const isSuperAdmin = req.user.role === "superadmin";`,
    `  const membership = await prisma.groupMember.findFirst({`,
    `    where: { groupId: group.id, userId: req.user.id, paymentStatus: "confirmed" },`,
    `  });`,
    ``,
    `  if (!isOrganizer && !isSuperAdmin && !membership)`,
    `    return res.status(403).json({ error: "Access denied" });`,
    ``,
    `  // OTP expires after 10 minutes`,
    `  const otpAge = group.otpReceivedAt`,
    `    ? (Date.now() - new Date(group.otpReceivedAt).getTime()) / 1000 / 60`,
    `    : null;`,
    `  const otpValid = otpAge !== null && otpAge < 10;`,
    ``,
    `  res.json({`,
    `    otp:          otpValid ? group.latestOtp : null,`,
    `    subject:      otpValid ? group.otpSubject : null,`,
    `    receivedAt:   group.otpReceivedAt,`,
    `    expiresIn:    otpValid ? Math.round(10 - otpAge) : 0,`,
    `    inboundEmail: group.inboundEmail,`,
    `  });`,
    `});`,
    ``,
    `// Set inbound email for a group (organizer/admin only)`,
    `app.patch("/api/groups/:id/inbound-email", requireRole("moderator", "superadmin"), async (req, res) => {`,
    `  const { inboundEmail } = req.body;`,
    `  const group = await prisma.group.findUnique({ where: { id: req.params.id } });`,
    `  if (!group) return res.status(404).json({ error: "Group not found" });`,
    `  const updated = await prisma.group.update({`,
    `    where: { id: req.params.id },`,
    `    data: { inboundEmail: inboundEmail || null },`,
    `  });`,
    `  console.log("[GROUP] Inbound email set:", inboundEmail, "for", group.serviceName);`,
    `  res.json({ ok: true, group: updated });`,
    `});`,
    ``,
  ];
  serverLines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, serverLines.join('\n'));
  console.log('✓ Inbound email endpoints added to server.js');
} else { console.log('⚠ Inbound endpoints already exist'); }

// ── 4. api.js ─────────────────────────────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('getGroupOtp')) {
  api = api.replace(
    '  setGroupRenewDate:      (gid, date)  => req(`/groups/${gid}/renew-date`, { method: "PATCH", body: { renewDate: date } }),',
    `  setGroupRenewDate:      (gid, date)  => req(\`/groups/\${gid}/renew-date\`, { method: "PATCH", body: { renewDate: date } }),\n  getGroupOtp:            (gid)        => req(\`/groups/\${gid}/otp\`),\n  setGroupInboundEmail:   (gid, email) => req(\`/groups/\${gid}/inbound-email\`, { method: "PATCH", body: { inboundEmail: email } }),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ OTP API methods added');
} else { console.log('⚠ Already exists'); }

// ── 5. GroupDetailPage.js — add OTP display in credential vault ───────────
const gdpFile = 'frontend/src/pages/GroupDetailPage.js';
let gdp = fs.readFileSync(gdpFile, 'utf8').split('\n');

// Add OTP state
if (!gdp.some(l => l.includes('otpData'))) {
  const idx = gdp.findIndex(l => l.includes('const [renewDate, setRenewDate]'));
  gdp.splice(idx + 3, 0,
    `  const [otpData, setOtpData]           = useState(null);`,
    `  const [otpLoading, setOtpLoading]     = useState(false);`,
    `  const [inboundEmailInput, setInboundEmailInput] = useState(group?.inboundEmail || "");`,
    `  const [inboundEmailBusy, setInboundEmailBusy]   = useState(false);`
  );
  console.log('✓ OTP state added');
} else { console.log('⚠ OTP state exists'); }

// Add fetchOtp function
if (!gdp.some(l => l.includes('fetchOtp'))) {
  const idx = gdp.findIndex(l => l.includes('async function saveRenewDate'));
  gdp.splice(idx, 0,
    `  async function fetchOtp() {`,
    `    setOtpLoading(true);`,
    `    try {`,
    `      const data = await api.getGroupOtp(id);`,
    `      setOtpData(data);`,
    `    } catch (err) { console.error(err); }`,
    `    finally { setOtpLoading(false); }`,
    `  }`,
    ``,
    `  async function saveInboundEmail() {`,
    `    setInboundEmailBusy(true);`,
    `    try {`,
    `      await api.setGroupInboundEmail(id, inboundEmailInput);`,
    `      setMsg({ type: "ok", text: "Inbound email saved." });`,
    `      reload();`,
    `    } catch (err) { setMsg({ type: "err", text: err.message }); }`,
    `    finally { setInboundEmailBusy(false); }`,
    `  }`,
    ``
  );
  console.log('✓ fetchOtp function added');
} else { console.log('⚠ fetchOtp exists'); }

// Add OTP display in credential vault section
// Find the credential vault section
if (!gdp.some(l => l.includes('OTP / Verification Code'))) {
  const vaultIdx = gdp.findIndex(l => l.includes('cv-vault-title') && l.includes('Unlocked'));
  if (vaultIdx !== -1) {
    gdp.splice(vaultIdx + 1, 0,
      `            {/* OTP Section */}`,
      `            {group.inboundEmail && (`,
      `              <div style={{ margin:"12px 0 16px", padding:"12px 16px", background:"rgba(124,106,255,0.08)", borderRadius:10, border:"1px solid rgba(124,106,255,0.2)" }}>`,
      `                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>`,
      `                  <div style={{ fontWeight:600, fontSize:"0.82rem", color:"var(--accent)" }}>🔑 OTP / Verification Code</div>`,
      `                  <button className="btn btn-sm btn-outline" style={{ fontSize:"0.72rem" }} onClick={fetchOtp} disabled={otpLoading}>`,
      `                    {otpLoading ? <span className="spinner"/> : "↻ Refresh"}`,
      `                  </button>`,
      `                </div>`,
      `                {otpData?.otp ? (`,
      `                  <div>`,
      `                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>`,
      `                      <span style={{ fontSize:"2rem", fontWeight:800, letterSpacing:6, color:"var(--text)", fontFamily:"monospace" }}>{otpData.otp}</span>`,
      `                      <button className="btn btn-sm btn-outline" onClick={() => navigator.clipboard.writeText(otpData.otp)}>⊕ Copy</button>`,
      `                    </div>`,
      `                    <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:4 }}>`,
      `                      {otpData.subject && <span style={{ marginRight:8 }}>From: {otpData.subject}</span>}`,
      `                      <span style={{ color: otpData.expiresIn <= 2 ? "var(--error)" : "var(--warning)", fontWeight:600 }}>`,
      `                        ⏱ Expires in {otpData.expiresIn} min`,
      `                      </span>`,
      `                    </div>`,
      `                  </div>`,
      `                ) : (`,
      `                  <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>`,
      `                    No active OTP. When {group.serviceName} sends a verification code to <strong style={{ color:"var(--text)" }}>{group.inboundEmail}</strong>, it will appear here automatically.`,
      `                    <button className="btn btn-sm btn-outline" style={{ marginLeft:8, fontSize:"0.72rem" }} onClick={fetchOtp}>Check now</button>`,
      `                  </div>`,
      `                )}`,
      `              </div>`,
      `            )}`,
    );
    console.log('✓ OTP display added to credential vault');
  } else {
    console.log('⚠ Vault title not found');
  }
}

// Add inbound email setting in admin section
if (!gdp.some(l => l.includes('Inbound Email'))) {
  const renewIdx = gdp.findIndex(l => l.includes('Subscription Renew Date') && l.includes('canManage'));
  if (renewIdx !== -1) {
    gdp.splice(renewIdx, 0,
      `              {canManage && (`,
      `                <div style={{ marginTop:8, padding:"12px 14px", background:"rgba(124,106,255,0.06)", borderRadius:10, border:"1px solid rgba(124,106,255,0.15)" }}>`,
      `                  <div style={{ fontSize:"0.78rem", fontWeight:600, marginBottom:8, color:"var(--accent)" }}>📬 Inbound Email <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(for OTP capture)</span></div>`,
      `                  <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginBottom:8 }}>Set the email address used for this {group.serviceName} account. When a verification code is sent to this address, members will see it in the vault automatically.</div>`,
      `                  {group.inboundEmail && <div style={{ fontSize:"0.72rem", color:"var(--accent)", marginBottom:8, fontWeight:600 }}>Current: {group.inboundEmail}</div>}`,
      `                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>`,
      `                    <input type="email" value={inboundEmailInput}`,
      `                      onChange={e => setInboundEmailInput(e.target.value)}`,
      `                      placeholder={"e.g. netflix-group1@inbound.splitsubs.com"}`,
      `                      style={{ flex:1, padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem", minWidth:200 }}`,
      `                    />`,
      `                    <button className="btn btn-sm btn-primary" disabled={inboundEmailBusy} onClick={saveInboundEmail}>`,
      `                      {inboundEmailBusy ? <><span className="spinner"/> Saving…</> : "💾 Save"}`,
      `                    </button>`,
      `                  </div>`,
      `                </div>`,
      `              )}`
    );
    console.log('✓ Inbound email setting added');
  }
}

fs.writeFileSync(gdpFile, gdp.join('\n'));
console.log('✓ GroupDetailPage.js written');
console.log('\n✅ All done!');