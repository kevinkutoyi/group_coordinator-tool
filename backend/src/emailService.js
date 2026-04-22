/**
 * emailService.js — Resend integration + HTML email templates
 *
 * Set EMAIL_ENABLED=true + RESEND_API_KEY in .env to activate real delivery.
 * While EMAIL_ENABLED=false every send is logged to console only (stub mode).
 */

const https = require("https");

const FROM    = `${process.env.EMAIL_FROM_NAME || "SplitPass"} <${process.env.EMAIL_FROM_ADDRESS || "noreply@splitpass.com"}>`;
const ENABLED = process.env.EMAIL_ENABLED === "true";
const API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.FRONTEND_URL   || "http://localhost:3000";

// ── Resend API call ────────────────────────────────────────────────────────
function resendSend(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: "api.resend.com", path: "/emails", method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ id: "parse-error" }); } });
    });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

// ── Master send ────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo }) {
  const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) };
  if (!ENABLED) {
    console.log(`\n📧 [EMAIL STUB]\n  To: ${payload.to}\n  Subject: ${subject}\n  (Set EMAIL_ENABLED=true + RESEND_API_KEY to deliver)\n`);
    return { id: "stub", stubbed: true };
  }
  try {
    const result = await resendSend(payload);
    console.log(`✅ Email sent → ${payload.to} | ${result.id}`);
    return result;
  } catch (err) {
    console.error(`❌ Email failed → ${payload.to} | ${err.message}`);
    throw err;
  }
}

// ── HTML wrapper ───────────────────────────────────────────────────────────
function wrap(content, preheader = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f8}
  .wrap{max-width:560px;margin:0 auto;padding:32px 16px}
  .logo{font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.03em;margin-bottom:28px}
  .logo span{color:#7c6aff}
  .card{background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px}
  h1{font-size:22px;font-weight:700;margin:0 0 12px;color:#fff}
  p{font-size:15px;line-height:1.65;color:#aaaacc;margin:0 0 16px}
  .hi{color:#fff;font-weight:600}
  .btn{display:inline-block;background:#7c6aff;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:8px 0}
  .pill{display:inline-block;background:rgba(124,106,255,0.15);color:#9d8eff;border:1px solid rgba(124,106,255,0.25);border-radius:99px;padding:3px 12px;font-size:13px;font-weight:600}
  .table{width:100%;border-collapse:collapse;margin:16px 0}
  .table td{padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#aaaacc}
  .table td:last-child{text-align:right;color:#fff;font-weight:500}
  .table tr:last-child td{border-bottom:none}
  .green{color:#4ade80} .warn{color:#fbbf24} .red{color:#f87171}
  hr{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0}
  .footer{text-align:center;font-size:12px;color:#555577;margin-top:28px;line-height:1.6}
  .footer a{color:#7c6aff;text-decoration:none}
  .cred-box{background:#0f0f1a;border:1px solid rgba(124,106,255,0.3);border-radius:12px;padding:20px;margin:16px 0}
  .cred-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
  .cred-row:last-child{border-bottom:none}
  .cred-label{font-size:12px;color:#777799;text-transform:uppercase;letter-spacing:0.05em}
  .cred-val{font-family:monospace;font-size:15px;color:#c4bcff;font-weight:600}
  .badge-warn{display:inline-block;background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);border-radius:99px;padding:4px 14px;font-size:13px;font-weight:700;margin-bottom:16px}
  .badge-red{display:inline-block;background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3);border-radius:99px;padding:4px 14px;font-size:13px;font-weight:700;margin-bottom:16px}
</style></head><body>
${preheader ? `<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>` : ""}
<div class="wrap">
  <div class="logo">⚡ Split<span>Pass</span></div>
  <div class="card">${content}</div>
  <div class="footer"><p>SplitPass · Legal group subscription sharing<br/>
  <a href="${APP_URL}">splitpass.com</a> · You receive this because you joined a SplitPass group.</p></div>
</div></body></html>`;
}

// ── Templates ──────────────────────────────────────────────────────────────

async function sendWelcome({ to, memberName, groupName, serviceName, planName,
  billingCycle, pricePerSlot, memberPays, currency, expiresAt, organizerName }) {
  const expStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })
    : "N/A";
  const html = wrap(`
<h1>🎉 You're in! Slot confirmed</h1>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>Your payment is confirmed and your slot in <span class="hi">${groupName}</span> is now active.</p>
<table class="table">
  <tr><td>Service</td><td>${serviceName} — ${planName}</td></tr>
  <tr><td>Billing cycle</td><td><span class="pill">${billingCycle||"Monthly"}</span></td></tr>
  <tr><td>Your share</td><td>${currency} ${pricePerSlot}/period</td></tr>
  <tr><td>Total charged</td><td class="green">${currency} ${memberPays}</td></tr>
  <tr><td>Expires</td><td>${expStr}</td></tr>
  <tr><td>Coordinator</td><td>${organizerName}</td></tr>
</table>
<p>Head to your group page on SplitPass to access your <strong>🔑 Credential Vault</strong> — the secure place where your login details are stored.</p>
<a href="${APP_URL}" class="btn">View My Credentials →</a>
<hr/>
<p style="font-size:13px;color:#666688">You'll receive reminders 3 days and 2 days before your subscription expires.</p>
`, `Your ${serviceName} slot is confirmed — expires ${expStr}`);
  return sendEmail({ to, subject: `✅ Slot confirmed — ${serviceName} ${planName}`, html });
}

async function sendCredentialsUpdated({ to, memberName, groupName, serviceName }) {
  const html = wrap(`
<h1>🔑 Your access credentials were updated</h1>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>The coordinator of your <span class="hi">${groupName}</span> group has updated the access credentials.</p>
<p>Log in to SplitPass and visit your group page to view the latest credentials in the <strong>🔑 Credential Vault</strong>.</p>
<a href="${APP_URL}" class="btn">View Credentials →</a>
<hr/>
<p style="font-size:13px;color:#666688">Never share these credentials outside your group. If you suspect misuse, contact your coordinator.</p>
`, `Credentials updated — ${serviceName}`);
  return sendEmail({ to, subject: `🔑 Credentials updated — ${serviceName}`, html });
}

async function sendExpiryWarning({ to, memberName, groupName, serviceName,
  expiresAt, renewUrl, daysLeft, currency, memberPays }) {
  const expStr = new Date(expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
  const urgency = daysLeft <= 2 ? "badge-red" : "badge-warn";
  const icon    = daysLeft <= 2 ? "🔴" : "⚠️";
  const html = wrap(`
<h1>${icon} ${daysLeft} day${daysLeft!==1?"s":""} until your subscription expires</h1>
<div class="${urgency}">${icon} Expires in ${daysLeft} day${daysLeft!==1?"s":""} — action needed</div>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>Your slot in <span class="hi">${groupName}</span> will expire on <span class="warn">${expStr}</span>.</p>
<p>Renew before this date to keep your access uninterrupted.</p>
<table class="table">
  <tr><td>Group</td><td>${groupName}</td></tr>
  <tr><td>Expires on</td><td class="warn">${expStr}</td></tr>
  <tr><td>Renewal amount</td><td>${currency} ${memberPays}</td></tr>
</table>
<a href="${renewUrl||APP_URL}" class="btn">Renew My Slot →</a>
<hr/>
<p style="font-size:13px;color:#666688">If you do not renew, your slot will be released after the expiry date.</p>
`, `${icon} ${serviceName} expires in ${daysLeft} day${daysLeft!==1?"s":""}`);
  return sendEmail({ to, subject: `${icon} Renew now — ${serviceName} expires in ${daysLeft} day${daysLeft!==1?"s":""}`, html });
}

async function sendExpiryToday({ to, memberName, groupName, serviceName, renewUrl, currency, memberPays }) {
  const html = wrap(`
<h1>🔴 Your subscription expired today</h1>
<div class="badge-red">🔴 Expired today</div>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>Your slot in <span class="hi">${groupName}</span> expired today. Your access may no longer be active.</p>
<p>Renew now to reclaim your slot if space is still available.</p>
<table class="table">
  <tr><td>Group</td><td>${groupName}</td></tr>
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>Renewal amount</td><td>${currency} ${memberPays}</td></tr>
</table>
<a href="${renewUrl||APP_URL}" class="btn">Renew Now →</a>
`, `Your ${serviceName} slot expired today`);
  return sendEmail({ to, subject: `🔴 Expired — ${serviceName} slot needs renewal`, html });
}

async function sendGroupMessage({ to, memberName, groupName, serviceName,
  senderName, senderEmail, subject, messageBody }) {
  const html = wrap(`
<h1>📣 Message from your coordinator</h1>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>Message from <span class="hi">${senderName}</span>, coordinator of <span class="hi">${groupName}</span> (${serviceName}):</p>
<hr/>
<div style="background:#1a1a2e;border-left:3px solid #7c6aff;border-radius:0 10px 10px 0;padding:18px 20px;margin:8px 0 20px">
  <p style="color:#e0e0f0;white-space:pre-wrap;margin:0">${messageBody}</p>
</div>
<hr/>
<p style="font-size:13px;color:#666688">Reply at <a href="mailto:${senderEmail}" style="color:#7c6aff">${senderEmail}</a></p>
<a href="${APP_URL}" class="btn">View My Groups →</a>
`, subject);
  return sendEmail({ to, subject: `📣 [${groupName}] ${subject}`, html, replyTo: senderEmail });
}

async function sendRenewalConfirm({ to, memberName, groupName, serviceName,
  billingCycle, memberPays, currency, expiresAt }) {
  const expStr = new Date(expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
  const html = wrap(`
<h1>✅ Renewal confirmed!</h1>
<p>Hi <span class="hi">${memberName}</span>,</p>
<p>Your slot in <span class="hi">${groupName}</span> has been renewed.</p>
<table class="table">
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>Billing cycle</td><td><span class="pill">${billingCycle||"Monthly"}</span></td></tr>
  <tr><td>Amount charged</td><td class="green">${currency} ${memberPays}</td></tr>
  <tr><td>Next expiry</td><td>${expStr}</td></tr>
</table>
<a href="${APP_URL}" class="btn">View My Groups →</a>
`, `${serviceName} renewed — next expiry ${expStr}`);
  return sendEmail({ to, subject: `✅ Renewed — ${serviceName} active until ${expStr}`, html });
}

// ── Expiry scheduler: 3-day, 2-day, today ─────────────────────────────────
async function runExpiryScheduler(loadDB, saveDB) {
  const db  = loadDB();
  const now = new Date();

  for (const member of db.groupMembers) {
    if (!member.expiresAt || member.paymentStatus !== "confirmed") continue;
    const expiry   = new Date(member.expiresAt);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const group    = db.groups.find(g => g.id === member.groupId);
    if (!group) continue;

    const todayKey = now.toISOString().slice(0, 10);
    if (!member.expiryNotifications) member.expiryNotifications = [];

    const args = {
      to: member.email, memberName: member.name,
      groupName:   `${group.serviceName} ${group.planName}`,
      serviceName:  group.serviceName,
      expiresAt:    member.expiresAt,
      renewUrl:     APP_URL,
      currency:    "KES",
      memberPays:   group.memberPays,
    };

    try {
      // 3-day warning
      if (daysLeft === 3 && !member.expiryNotifications.includes(`3d-${todayKey}`)) {
        await sendExpiryWarning({ ...args, daysLeft: 3 });
        member.expiryNotifications.push(`3d-${todayKey}`);
        console.log(`⏰ 3-day warning sent → ${member.email}`);
      }
      // 2-day warning
      if (daysLeft === 2 && !member.expiryNotifications.includes(`2d-${todayKey}`)) {
        await sendExpiryWarning({ ...args, daysLeft: 2 });
        member.expiryNotifications.push(`2d-${todayKey}`);
        console.log(`⏰ 2-day warning sent → ${member.email}`);
      }
      // Expiry today
      if (daysLeft <= 0 && !member.expiryNotifications.includes(`0d-${todayKey}`)) {
        await sendExpiryToday({
          to: member.email, memberName: member.name,
          groupName: `${group.serviceName} ${group.planName}`,
          serviceName: group.serviceName,
          renewUrl: APP_URL, currency: "KES", memberPays: group.memberPays,
        });
        member.expiryNotifications.push(`0d-${todayKey}`);
        member.paymentStatus = "expired";
        console.log(`🔴 Expiry-today notice sent → ${member.email}`);
      }
    } catch (err) {
      console.error(`Expiry email error for ${member.id}:`, err.message);
    }
  }

  saveDB(db);
  console.log("✅ Expiry scheduler complete");
}

// ── Template: Group approved ─────────────────────────────────────────────
async function sendGroupApproved({ to, organizerName, groupName, serviceName }) {
  const html = wrap(`
<h1>✅ Your group is live!</h1>
<p>Hi <span class="hi">${organizerName}</span>,</p>
<p>Great news — your group <span class="hi">${groupName}</span> has been reviewed and approved by the SplitPass admin. It is now <strong style="color:#4ade80">publicly listed</strong> and members can start joining.</p>
<table class="table">
  <tr><td>Group</td><td>${groupName}</td></tr>
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>Status</td><td style="color:#4ade80;font-weight:700">✅ Live</td></tr>
</table>
<p>Head to your Moderator Dashboard to manage your group, set credentials, and track earnings.</p>
<a href="${APP_URL}" class="btn">Open Dashboard →</a>
`, `Your ${serviceName} group is now live on SplitPass`);
  return sendEmail({ to, subject: `✅ Group approved — "${groupName}" is now live!`, html });
}

// ── Template: Group rejected ──────────────────────────────────────────────
async function sendGroupRejected({ to, organizerName, groupName, serviceName, reason }) {
  const html = wrap(`
<h1>❌ Group not approved</h1>
<p>Hi <span class="hi">${organizerName}</span>,</p>
<p>Unfortunately your group listing <span class="hi">${groupName}</span> was not approved at this time.</p>
<table class="table">
  <tr><td>Group</td><td>${groupName}</td></tr>
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>Decision</td><td style="color:#f87171;font-weight:700">❌ Rejected</td></tr>
  <tr><td>Reason</td><td>${reason || "Not specified"}</td></tr>
</table>
<p>You can revise your group listing based on the feedback above and resubmit for review. Log in to your Moderator Dashboard to edit and resubmit.</p>
<a href="${APP_URL}" class="btn">Edit &amp; Resubmit →</a>
<hr/>
<p style="font-size:13px;color:#666688">If you believe this decision was made in error, reply to this email or contact support.</p>
`, `Your ${serviceName} group listing was not approved`);
  return sendEmail({ to, subject: `❌ Group not approved — "${groupName}"`, html });
}

module.exports = {
  sendEmail, sendWelcome, sendCredentialsUpdated, sendGroupApproved, sendGroupRejected,
  sendExpiryWarning, sendExpiryToday,
  sendGroupMessage, sendRenewalConfirm, runExpiryScheduler,
};
