/**
 * backfillEmailLogs.js — one-time import of email history from Resend into
 * the email_logs table, so emails sent BEFORE the Automation-page email log
 * feature existed also show up in the admin dashboard.
 *
 * Resend keeps its own record of every email your account has ever sent
 * (GET /emails, paginated) and can hand back the full HTML body for any of
 * them (GET /emails/{id}). This script walks that entire history, skips
 * anything already imported, and inserts the rest — full body included —
 * into email_logs with type "backfilled".
 *
 * Usage:
 *   cd /home/dodl/splitpass/backend    (or wherever this repo lives on the server)
 *   node scripts/backfillEmailLogs.js [--dry-run] [--since=YYYY-MM-DD]
 *
 * Notes:
 *   - Uses the existing RESEND_API_KEY from .env — no new credentials needed.
 *   - Rate-limited to ~3 requests/second to stay well under Resend's limits.
 *   - Safe to re-run: emails already present (matched by Resend's email id,
 *     stored as EmailLog.resendId) are skipped, not duplicated.
 *   - Resend's list endpoint returns newest-first; this script walks it
 *     forward, so a --since cutoff stops the walk as soon as it reaches
 *     emails older than that date rather than paging through everything.
 */
require("dotenv").config();
const https = require("https");
const { PrismaClient } = require("@prisma/client");

const prisma  = new PrismaClient();
const API_KEY = process.env.RESEND_API_KEY || "";

const flags = {};
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) { const [k, v] = a.replace(/^--/, "").split("="); flags[k] = v ?? true; }
}
const dryRun = !!flags["dry-run"];
const since  = flags.since ? new Date(flags.since) : null;

if (!API_KEY) {
  console.error("RESEND_API_KEY is not set in .env — nothing to backfill from.");
  process.exit(1);
}

function resendGet(path) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname: "api.resend.com", path, method: "GET",
      headers: { "Authorization": `Bearer ${API_KEY}` },
    }, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    }).on("error", reject).end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Best-effort last_event → our status vocabulary. Unrecognised events pass through as-is.
const STATUS_MAP = {
  delivered: "delivered", bounced: "bounced", complained: "complained",
  delivery_delayed: "delayed", sent: "sent", opened: "delivered", clicked: "delivered",
};

(async () => {
  console.log(`\n📥 Resend email-history backfill`);
  console.log(`   Dry-run: ${dryRun ? "YES — will not write to the DB" : "NO — will insert rows"}`);
  console.log(`   Since:   ${since ? since.toISOString().slice(0, 10) : "(no cutoff — full history)"}\n`);

  const existing = await prisma.emailLog.findMany({ where: { resendId: { not: null } }, select: { resendId: true } });
  const already  = new Set(existing.map(e => e.resendId));
  console.log(`   Already imported: ${already.size} email(s). These will be skipped.\n`);

  let cursor = null, page = 0, seen = 0, imported = 0, skipped = 0, failed = 0, stoppedEarly = false;
  const t0 = Date.now();

  while (true) {
    page++;
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("after", cursor);
    let listResp;
    try { listResp = await resendGet(`/emails?${qs.toString()}`); }
    catch (e) { console.error(`   ❌ Failed to list page ${page}: ${e.message}`); break; }

    const rows = listResp.data || [];
    if (rows.length === 0) break;

    for (const row of rows) {
      seen++;
      const createdAt = new Date(row.created_at);
      if (since && createdAt < since) { stoppedEarly = true; break; }

      if (already.has(row.id)) { skipped++; continue; }

      let full = null;
      try {
        await sleep(330); // ~3 req/sec
        full = await resendGet(`/emails/${row.id}`);
      } catch (e) {
        failed++;
        console.error(`   ❌ Could not fetch body for ${row.id} (${row.subject}): ${e.message}`);
        continue;
      }

      const status = STATUS_MAP[row.last_event] || row.last_event || "sent";
      const to = Array.isArray(full.to) ? full.to.join(", ") : (full.to || "");

      if (!dryRun) {
        try {
          await prisma.emailLog.create({
            data: {
              type: "backfilled", to, subject: full.subject || row.subject || "(no subject)",
              body: full.html || full.text || "<p>(no content returned by Resend)</p>",
              status, resendId: row.id, error: null, createdAt,
            },
          });
        } catch (e) {
          failed++;
          console.error(`   ❌ Failed to save ${row.id}: ${e.message}`);
          continue;
        }
      }
      imported++;
      already.add(row.id);

      if (imported % 20 === 0) {
        console.log(`   Progress: seen ${seen} · imported ${imported} · skipped ${skipped} · failed ${failed}`);
      }
    }

    if (stoppedEarly) { console.log(`   Reached the --since cutoff — stopping.`); break; }
    if (!listResp.has_more) break;
    cursor = rows[rows.length - 1].id;
    await sleep(330);
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✅ Done in ${secs}s. Seen ${seen} · imported ${imported} · skipped (already had) ${skipped} · failed ${failed}.`);
  if (dryRun) console.log("   (dry-run — nothing was written. Re-run without --dry-run to actually import.)\n");
  await prisma.$disconnect();
})().catch(async e => { console.error("Fatal:", e); await prisma.$disconnect(); process.exit(1); });
