const fs = require('fs');
const file = 'backend/src/server.js';
let src = fs.readFileSync(file, 'utf8');

const oldRoute = `app.post("/api/admin/newsletter/send", requireSuperAdmin, async (req, res) => {
  const { subject, body, senderName, senderEmail } = req.body;
  if (!subject || !body) return res.status(400).json({ error: "subject and body required" });
  const [users, footerSubs] = await Promise.all([prisma.user.findMany({ where: { newsletter: true } }), prisma.footerSubscriber.findMany()]);
  const recipients = [...new Set([...users.map(u => u.email), ...footerSubs.map(s => s.email)])];
  const campaign = await prisma.newsletterCampaign.create({ data: { type: "newsletter", subject, body, senderName: senderName || process.env.ADMIN_USERNAME || "SplitSubs Team", senderEmail: senderEmail || process.env.ADMIN_EMAIL || "newsletter@splitsubs.com", recipientCount: recipients.length, recipients, status: "logged" } });
  res.json({ message: \`Newsletter logged. \${recipients.length} recipient(s) queued.\`, campaignId: campaign.id, recipientCount: recipients.length });
});`;

const newRoute = `app.post("/api/admin/newsletter/send", requireSuperAdmin, async (req, res) => {
  const { subject, body, senderName, senderEmail } = req.body;
  if (!subject || !body) return res.status(400).json({ error: "subject and body required" });

  const [users, footerSubs] = await Promise.all([
    prisma.user.findMany({ where: { newsletter: true }, select: { email: true, name: true } }),
    prisma.footerSubscriber.findMany({ select: { email: true } }),
  ]);

  // Deduplicate
  const seen = new Set();
  const audience = [];
  for (const u of users)     if (u.email && !seen.has(u.email.toLowerCase())) { seen.add(u.email.toLowerCase()); audience.push({ email: u.email, name: u.name || "there" }); }
  for (const s of footerSubs) if (s.email && !seen.has(s.email.toLowerCase())) { seen.add(s.email.toLowerCase()); audience.push({ email: s.email, name: "there" }); }

  const fromName  = senderName  || process.env.ADMIN_USERNAME     || "SplitSubs Team";
  const fromEmail = senderEmail || process.env.ADMIN_EMAIL        || "newsletter@splitsubs.com";
  const appUrl    = process.env.FRONTEND_URL || "https://splitsubs.com";

  const campaign = await prisma.newsletterCampaign.create({
    data: { type: "newsletter", subject, body, senderName: fromName, senderEmail: fromEmail, recipientCount: audience.length, recipients: audience.map(a => a.email), status: "sending" },
  });

  // Send immediately, respond first
  res.json({ message: \`Sending to \${audience.length} subscriber(s)…\`, campaignId: campaign.id, recipientCount: audience.length });

  // Send in background
  let sent = 0, failed = 0;
  for (const recipient of audience) {
    try {
      const personalised = body.replace(/\\{name\\}/g, recipient.name);
      const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f8">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:28px">⚡ Split<span style="color:#7c6aff">Subs</span></div>
  <div style="background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#fff">\${subject}</h1>
    <div style="font-size:15px;line-height:1.75;color:#aaaacc;white-space:pre-wrap">\${personalised}</div>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0"/>
    <a href="\${appUrl}" style="display:inline-block;background:#7c6aff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px">Visit SplitSubs →</a>
  </div>
  <div style="text-align:center;font-size:12px;color:#555577;margin-top:24px;line-height:1.6">
    SplitSubs · Legal group subscription sharing<br/>
    <a href="\${appUrl}/unsubscribe?email=\${encodeURIComponent(recipient.email)}" style="color:#7c6aff;text-decoration:none">Unsubscribe</a>
  </div>
</div></body></html>\`;
      await emailService.sendEmail({ to: recipient.email, subject, html });
      sent++;
    } catch { failed++; }
    // Rate limit: 2 per second
    await new Promise(r => setTimeout(r, 500));
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: { status: failed === audience.length ? "failed" : "sent", sent, failed: failed || undefined },
  });
  console.log(\`📨 Newsletter "\${subject}": \${sent} sent, \${failed} failed\`);
});`;

if (src.includes('Newsletter logged.')) {
  src = src.replace(oldRoute, newRoute);
  fs.writeFileSync(file, src);
  console.log('✓ Newsletter send endpoint fixed — now actually sends emails');
} else {
  console.log('⚠ Old route pattern not found — checking...');
  const idx = src.indexOf('/api/admin/newsletter/send');
  console.log('Route found at char:', idx);
  console.log('Context:', JSON.stringify(src.substring(idx, idx + 200)));
}
