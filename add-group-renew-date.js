const fs = require('fs');

// ── 1. Prisma schema — add renewDate to Group ─────────────────────────────
const schemaFile = 'backend/prisma/schema.prisma';
let schema = fs.readFileSync(schemaFile, 'utf8');

if (!schema.includes('renewDate')) {
  schema = schema.replace(
    '  reviewedAt     DateTime?',
    `  renewDate      DateTime?               // when organizer needs to renew the actual subscription\n  renewReminderSent Boolean  @default(false) // track if 3-day reminder was sent\n  reviewedAt     DateTime?`
  );
  fs.writeFileSync(schemaFile, schema);
  console.log('✓ renewDate added to schema');
} else { console.log('⚠ renewDate already in schema'); }

// ── 2. Migration SQL ──────────────────────────────────────────────────────
const migDir = 'backend/prisma/migrations/0005_add_group_renew_date';
if (!fs.existsSync(migDir)) {
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(migDir + '/migration.sql',
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "renewDate" TIMESTAMP(3);\n` +
    `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "renewReminderSent" BOOLEAN NOT NULL DEFAULT false;\n`
  );
  console.log('✓ Migration SQL created');
} else { console.log('⚠ Migration exists'); }

// ── 3. server.js ──────────────────────────────────────────────────────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

// A: Add renewDate to group create endpoint
if (!serverLines.some(l => l.includes('renewDate') && l.includes('req.body'))) {
  const createIdx = serverLines.findIndex(l => l.includes('app.post("/api/groups"') && l.includes('requireRole'));
  const bodyIdx = serverLines.findIndex((l, i) => i > createIdx && l.includes('const {') && l.includes('billingCycle'));
  if (bodyIdx !== -1) {
    serverLines[bodyIdx] = serverLines[bodyIdx].replace(
      'const {',
      'const { renewDate,'
    );
    console.log('✓ renewDate added to create group destructure');
  }

  // Add to prisma.group.create data
  const createDataIdx = serverLines.findIndex((l, i) => i > createIdx && l.includes('billingCycle,') && i < createIdx + 60);
  if (createDataIdx !== -1) {
    serverLines.splice(createDataIdx + 1, 0, `      renewDate:     renewDate ? new Date(renewDate) : null,`);
    console.log('✓ renewDate added to group create data');
  }
}

// B: Add renewDate to group update endpoint
const updateIdx = serverLines.findIndex(l => l.includes('app.patch("/api/groups/:id"'));
if (updateIdx !== -1 && !serverLines.slice(updateIdx, updateIdx + 30).some(l => l.includes('renewDate'))) {
  const updateBodyIdx = serverLines.findIndex((l, i) => i > updateIdx && l.includes('description') && l.includes('req.body'));
  if (updateBodyIdx !== -1) {
    serverLines[updateBodyIdx] = serverLines[updateBodyIdx].replace(
      '} = req.body;',
      'renewDate } = req.body;'
    );
    const updateDataIdx = serverLines.findIndex((l, i) => i > updateIdx && l.includes('description,') && i < updateIdx + 40);
    if (updateDataIdx !== -1) {
      serverLines.splice(updateDataIdx + 1, 0, `      ...(renewDate !== undefined && { renewDate: renewDate ? new Date(renewDate) : null }),`);
      console.log('✓ renewDate added to group update');
    }
  }
}

// C: Add renewDate to scheduler
const schedulerIdx = serverLines.findIndex(l => l.includes('runExpiryScheduler') || l.includes('Expiry scheduler'));
if (schedulerIdx !== -1 && !serverLines.some(l => l.includes('renewDate') && l.includes('lte'))) {
  // Add renew date reminder to the scheduler
  const schedEnd = serverLines.findIndex((l, i) => i > schedulerIdx && l.includes('console.log("✅ Expiry scheduler complete")'));
  if (schedEnd !== -1) {
    const reminderCode = [
      ``,
      `  // ── Group renew date reminders (3 days before) ──────────────────────`,
      `  try {`,
      `    const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3);`,
      `    const groupsDue = await prisma.group.findMany({`,
      `      where: {`,
      `        renewDate: { gte: new Date(), lte: in3Days },`,
      `        renewReminderSent: false,`,
      `      },`,
      `    });`,
      `    for (const g of groupsDue) {`,
      `      const daysLeft = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));`,
      `      await emailService.sendEmail({`,
      `        to: process.env.ADMIN_EMAIL || "admin@splitsubs.com",`,
      `        subject: "⚠️ Group renew reminder: " + g.serviceName + " " + g.planName + " in " + daysLeft + " day(s)",`,
      `        html: "<div style='font-family:Arial,sans-serif;padding:24px;background:#0a0a0f;color:#f0f0f8'>" +`,
      `          "<h2>⚠️ Group Renewal Reminder</h2>" +`,
      `          "<p>The following group subscription needs to be renewed in <strong>" + daysLeft + " day(s)</strong>:</p>" +`,
      `          "<table style='width:100%;border-collapse:collapse;margin-top:16px'>" +`,
      `          "<tr><td style='padding:8px;color:#aaa'>Group</td><td style='padding:8px'>" + g.serviceName + " " + g.planName + "</td></tr>" +`,
      `          "<tr><td style='padding:8px;color:#aaa'>Renew Date</td><td style='padding:8px;color:#f87171'>" + new Date(g.renewDate).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) + "</td></tr>" +`,
      `          "<tr><td style='padding:8px;color:#aaa'>Organizer</td><td style='padding:8px'>" + g.organizerName + " (" + g.organizerEmail + ")</td></tr>" +`,
      `          "<tr><td style='padding:8px;color:#aaa'>Members</td><td style='padding:8px'>" + g.maxSlots + " slots</td></tr>" +`,
      `          "</table>" +`,
      `          "<p style='margin-top:24px'><a href='https://splitsubs.com/admin' style='background:#7c6aff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none'>View Admin Dashboard</a></p>" +`,
      `          "</div>",`,
      `      });`,
      `      await prisma.group.update({ where: { id: g.id }, data: { renewReminderSent: true } });`,
      `      console.log("⚠️ Group renew reminder sent for:", g.serviceName, g.planName);`,
      `    }`,
      `  } catch (err) { console.error("Group renew reminder error:", err.message); }`,
    ];
    serverLines.splice(schedEnd, 0, ...reminderCode);
    console.log('✓ Group renew reminder added to scheduler');
  }
}

fs.writeFileSync(serverFile, serverLines.join('\n'));
console.log('✓ server.js updated');

// ── 4. api.js — renewDate is included in createGroup/updateGroup already ──
console.log('✓ api.js — no changes needed (renewDate passes through body)');

// ── 5. CreateGroupPage.js — add renewDate date picker ────────────────────
const createFile = 'frontend/src/pages/CreateGroupPage.js';
let create = fs.readFileSync(createFile, 'utf8').split('\n');

// Add renewDate to initial form state
if (!create.some(l => l.includes('renewDate'))) {
  const formIdx = create.findIndex(l => l.includes('billingCycle:') && l.includes('"monthly"'));
  create.splice(formIdx + 1, 0, `    renewDate:    "",`);
  console.log('✓ renewDate added to form state');

  // Add renewDate to createGroup call
  const submitIdx = create.findIndex(l => l.includes('billingCycle: form.billingCycle'));
  create.splice(submitIdx + 1, 0, `        renewDate:    form.renewDate || null,`);
  console.log('✓ renewDate added to createGroup call');

  // Add date picker UI after billing cycle section
  const billingIdx = create.findIndex(l => l.includes('BILLING_CYCLES') && l.includes('map'));
  // Find closing of billing cycle section
  let billingEnd = billingIdx;
  let depth = 0;
  for (let i = billingIdx; i < create.length; i++) {
    if (create[i].includes('<div')) depth++;
    if (create[i].includes('</div>')) depth--;
    if (depth === 0 && i > billingIdx) { billingEnd = i; break; }
  }

  create.splice(billingEnd + 1, 0,
    `              <div className="form-group" style={{ marginTop: 16 }}>`,
    `                <label>📅 Subscription Renew Date <span style={{ fontSize:"0.75rem", color:"var(--muted)", fontWeight:400 }}>(when you need to renew the actual plan)</span></label>`,
    `                <input type="date" value={form.renewDate}`,
    `                  min={new Date().toISOString().split('T')[0]}`,
    `                  onChange={set("renewDate")}`,
    `                  style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.9rem" }}`,
    `                />`,
    `                <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:4 }}>Admin will be notified 3 days before this date.</div>`,
    `              </div>`
  );
  console.log('✓ renewDate date picker added to CreateGroupPage');
}

fs.writeFileSync(createFile, create.join('\n'));

// ── 6. AdminDashboardPage.js — add renew date alerts in Groups tab ────────
const adpFile = 'frontend/src/pages/AdminDashboardPage.js';
let adp = fs.readFileSync(adpFile, 'utf8').split('\n');

if (!adp.some(l => l.includes('renewDate') && l.includes('group'))) {
  // Find the groups tab rendering
  const groupsTabIdx = adp.findIndex(l => l.includes('tab === "groups"'));
  if (groupsTabIdx !== -1) {
    // Find where groups are mapped
    const groupMapIdx = adp.findIndex((l, i) => i > groupsTabIdx && l.includes('.map(g =>'));
    if (groupMapIdx !== -1) {
      // Add renew date badge inside each group card
      const groupCardEnd = adp.findIndex((l, i) => i > groupMapIdx && l.includes('g.organizerEmail'));
      if (groupCardEnd !== -1) {
        adp.splice(groupCardEnd + 1, 0,
          `                  {g.renewDate && (() => {`,
          `                    const daysLeft = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));`,
          `                    const color = daysLeft <= 0 ? "var(--error)" : daysLeft <= 3 ? "var(--error)" : daysLeft <= 7 ? "var(--warning)" : "var(--muted)";`,
          `                    return <div style={{ marginTop:6, fontSize:"0.72rem", fontWeight:600, color }}>`,
          `                      📅 Renew by: {new Date(g.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`,
          `                      {daysLeft <= 0 ? " ⛔ OVERDUE" : daysLeft <= 3 ? " ⚠️ " + daysLeft + "d left" : daysLeft <= 7 ? " · " + daysLeft + "d left" : ""}`,
          `                    </div>;`,
          `                  })()}`
        );
        console.log('✓ Renew date badge added to Groups tab');
      }
    }
  }
}

fs.writeFileSync(adpFile, adp.join('\n'));
console.log('✓ AdminDashboardPage.js updated');
console.log('\n✅ All done!');
