const fs = require('fs');
const serverFile = 'backend/src/server.js';
let lines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!lines.some(l => l.includes('/api/admin/users/email'))) {
  const idx = lines.findIndex(l => l.includes('app.delete("/api/admin/members/:id"'));
  const route = [
    `app.post("/api/admin/users/email", requireSuperAdmin, async (req, res) => {`,
    `  const { userId, subject, body: msgBody } = req.body;`,
    `  if (!userId || !subject || !msgBody) return res.status(400).json({ error: "userId, subject and body required" });`,
    `  const user = await prisma.user.findUnique({ where: { id: userId } });`,
    `  if (!user) return res.status(404).json({ error: "User not found" });`,
    `  try {`,
    `    const html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;background:#0a0a0f;color:#f0f0f8'>" +`,
    `      "<div style='font-size:22px;font-weight:800;color:#fff;margin-bottom:28px'>⚡ Split<span style='color:#7c6aff'>Subs</span></div>" +`,
    `      "<div style='background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px'>" +`,
    `      "<h1 style='font-size:22px;font-weight:700;margin:0 0 12px;color:#fff'>" + subject + "</h1>" +`,
    `      "<p style='font-size:15px;color:#aaaacc'>Hi <strong style='color:#fff'>" + user.name + "</strong>,</p>" +`,
    `      "<div style='font-size:15px;line-height:1.65;color:#aaaacc;white-space:pre-wrap'>" + msgBody + "</div>" +`,
    `      "<hr style='border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0'/>" +`,
    `      "<p style='font-size:13px;color:#666688'>— SplitSubs Admin Team</p>" +`,
    `      "</div></div>";`,
    `    await emailService.sendEmail({ to: user.email, subject, html });`,
    `    console.log("[ADMIN] Email sent to user:", user.email);`,
    `    res.json({ ok: true, message: "Email sent to " + user.name + "." });`,
    `  } catch (err) {`,
    `    console.error("User email failed:", err.message);`,
    `    res.status(500).json({ error: "Could not send email" });`,
    `  }`,
    `});`,
    ``,
  ];
  lines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, lines.join('\n'));
  console.log('✓ /api/admin/users/email endpoint added');
} else {
  console.log('⚠ Already exists');
}
