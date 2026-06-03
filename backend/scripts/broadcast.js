/**
 * broadcast.js — send an HTML email to a chosen audience.
 *
 * Usage:
 *   cd /home/dodl/splitpass/backend
 *   node scripts/broadcast.js \
 *     --subject="Big news from SplitSubs" \
 *     --html-file=/tmp/announcement.html \
 *     --audience=customers \
 *     [--dry-run] [--limit=N]
 *
 * Audiences:
 *   all          — every active user
 *   customers    — active users with role=customer
 *   moderators   — active users with role=moderator
 *   newsletter   — active users with newsletter=true
 *   subscribers  — only footer newsletter subscribers
 *   newsletter+subscribers — union of the two opt-in pools
 */
require("dotenv").config();
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const svc = require("../src/emailService");
const prisma = new PrismaClient();

const flags = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) { const [k, v] = a.replace(/^--/, "").split("="); flags[k] = v ?? true; }
  else positional.push(a);
}
const subject  = flags.subject  || positional[0];
const htmlFile = flags["html-file"] || positional[1];
const audience = flags.audience || "customers";
const dryRun   = !!flags["dry-run"];
const limit    = flags.limit ? parseInt(flags.limit, 10) : 0;

if (!subject || !htmlFile) {
  console.error('\nUsage: node scripts/broadcast.js --subject="..." --html-file=/tmp/body.html --audience=customers|all|moderators|newsletter|subscribers|newsletter+subscribers [--dry-run] [--limit=N]\n');
  process.exit(1);
}
if (!fs.existsSync(htmlFile)) { console.error("HTML file not found:", htmlFile); process.exit(1); }
const bodyHtml = fs.readFileSync(htmlFile, "utf-8");

const APP_URL = process.env.FRONTEND_URL || "https://splitsubs.com";
function wrap(content, recipientEmail) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f8}
  .wrap{max-width:560px;margin:0 auto;padding:32px 16px}
  .logo{font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.03em;margin-bottom:28px}
  .logo span{color:#7c6aff}
  .card{background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px}
  h1,h2,h3{color:#fff;margin:0 0 12px} p{color:#aaaacc;line-height:1.65;font-size:15px;margin:0 0 14px}
  a{color:#7c6aff}
  .btn{display:inline-block;background:#7c6aff;color:#fff!important;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:8px 0}
  hr{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0}
  .footer{text-align:center;font-size:12px;color:#555577;margin-top:28px;line-height:1.6}
  .footer a{color:#7c6aff}
</style></head><body>
<div class="wrap">
  <div class="logo">⚡ Split<span>Subs</span></div>
  <div class="card">${content}</div>
  <div class="footer">
    <p>SplitSubs · Legal group subscription sharing · <a href="${APP_URL}">splitsubs.com</a></p>
    <p>You received this because you have an account at SplitSubs.<br/>
    <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(recipientEmail)}">Unsubscribe</a></p>
  </div>
</div></body></html>`;
}

async function getRecipients() {
  const out = new Map();
  const add = list => list.forEach(r => { if (r.email) out.set(r.email.toLowerCase(), r); });

  if (audience === "subscribers" || audience === "newsletter+subscribers") {
    add((await prisma.footerSubscriber.findMany()).map(s => ({ email: s.email, name: "" })));
  }
  if (audience !== "subscribers") {
    const where = { status: "active" };
    if      (audience === "customers")  where.role = "customer";
    else if (audience === "moderators") where.role = "moderator";
    else if (audience === "newsletter" || audience === "newsletter+subscribers") where.newsletter = true;
    // "all" = no role/newsletter filter, status=active only
    add((await prisma.user.findMany({ where, select: { email: true, name: true } })));
  }
  return [...out.values()];
}

(async () => {
  const recipients = await getRecipients();
  const final = limit ? recipients.slice(0, limit) : recipients;

  console.log(`\n📊 Broadcast plan`);
  console.log(`   Subject:    ${subject}`);
  console.log(`   Audience:   ${audience}`);
  console.log(`   Recipients: ${final.length}${limit ? ` (limited from ${recipients.length})` : ""}`);
  console.log(`   Dry-run:    ${dryRun ? "YES" : "NO — will SEND"}`);
  console.log(`   Sample:     ${final.slice(0, 5).map(r => r.email).join(", ") || "(none)"}\n`);

  if (dryRun) { console.log("Dry-run complete. Re-run without --dry-run to actually send.\n"); await prisma.$disconnect(); return; }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = Date.now();
  let ok = 0, fail = 0;
  for (let i = 0; i < final.length; i++) {
    const r = final[i];
    try {
      await svc.sendEmail({ to: r.email, subject, html: wrap(bodyHtml, r.email) });
      ok++;
    } catch (e) {
      fail++;
      console.error(`   ❌ ${r.email}: ${e.message}`);
    }
    if ((i + 1) % 10 === 0 || i === final.length - 1) {
      const pct = Math.round(((i + 1) / final.length) * 100);
      console.log(`   Progress: ${i + 1}/${final.length} (${pct}%) · OK ${ok} · Fail ${fail}`);
    }
    await sleep(500); // 2 sends/sec — well under Resend's 10/sec free tier
  }
  console.log(`\n✅ Done. ${ok} sent, ${fail} failed. ${Math.round((Date.now() - t0) / 1000)}s elapsed.\n`);
  await prisma.$disconnect();
})().catch(async e => { console.error("Fatal:", e); await prisma.$disconnect(); process.exit(1); });
