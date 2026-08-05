// One-off / periodic backfill for the confirmOrder() crash bug (fixed in server.js on 2026-08-04).
//
// Bug: confirmOrder() referenced an undefined `orderId` variable (leftover from the
// Pesapal migration) instead of `reference`. It flipped groupMember.paymentStatus to
// "confirmed" FIRST, then crashed before: marking the PaystackOrder COMPLETED, creating
// the Payment/PlatformEarning records, sending the welcome/credentials emails, and
// running the group-full check. So some members show as confirmed with no Payment record
// behind them, and some PaystackOrder rows are stuck PENDING even though Paystack shows
// the charge succeeded.
//
// This script re-checks every PENDING PaystackOrder against the real Paystack API (source
// of truth) and re-runs the (now-fixed) confirmation logic. It's idempotent and safe to
// re-run: it only writes when Paystack itself reports "success", and skips creating
// duplicate Payment/PlatformEarning rows or duplicate emails.
//
// Usage:
//   node backend/scripts/reconcile-paystack-payments.js            # apply fixes
//   node backend/scripts/reconcile-paystack-payments.js --dry-run  # report only, no writes

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const paystack = require("../src/paystack");
const emailService = require("../src/emailService");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function confirmOrder(reference) {
  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
  if (!order || order.status === "COMPLETED") return { skipped: true };

  const txData = await paystack.verifyTransaction(reference);
  const code = txData.status;

  if (!DRY_RUN) {
    await prisma.paystackOrder.update({ where: { id: reference }, data: { paystackStatus: code } });
  }

  if (code !== "success") {
    if (["failed", "abandoned"].includes(code) && !DRY_RUN) {
      await prisma.paystackOrder.update({ where: { id: reference }, data: { status: "FAILED" } });
    }
    return { skipped: true, status: code };
  }

  // Paystack confirms this charge actually succeeded — was the member already flipped
  // to "confirmed" by a previous crashed run? (i.e. hit by the bug already)
  const memberBefore = await prisma.groupMember.findUnique({ where: { id: order.memberId } });
  const healed = memberBefore && memberBefore.paymentStatus === "confirmed";

  if (DRY_RUN) return { wouldConfirm: true, healed };

  const confirmedAt = new Date();
  // Same additive-renewal rule as confirmOrder() in server.js: extend from
  // the existing expiry if still active, otherwise start counting from now.
  const base = memberBefore?.expiresAt && new Date(memberBefore.expiresAt) > confirmedAt
    ? new Date(memberBefore.expiresAt)
    : confirmedAt;
  const exp = new Date(base);
  exp.setDate(exp.getDate() + (order.months || 1) * 31);

  await prisma.groupMember.update({ where: { id: order.memberId }, data: { paymentStatus: "confirmed", expiresAt: exp } });

  const alreadyRecorded = await prisma.payment.findFirst({ where: { pesapalOrderId: reference } });
  if (!alreadyRecorded) {
    await prisma.payment.create({
      data: {
        groupId: order.groupId, memberId: order.memberId, userId: order.userId,
        memberName: order.memberName, months: order.months, amount: order.memberPays,
        platformFee: order.platformFee, moderatorOwed: order.moderatorOwed,
        organizerGets: order.moderatorOwed, moderatorId: order.moderatorId,
        method: "paystack", pesapalOrderId: reference, currency: order.currency,
        confirmedAt, payoutStatus: "pending",
      },
    });
    await prisma.platformEarning.create({
      data: { orderId: reference, groupId: order.groupId, fee: order.platformFee, currency: order.currency, earnedAt: confirmedAt },
    });

    const [grp, mem] = await Promise.all([
      prisma.group.findUnique({ where: { id: order.groupId } }),
      prisma.groupMember.findUnique({ where: { id: order.memberId } }),
    ]);
    if (grp && mem) {
      const creds = await prisma.groupCredential.findUnique({ where: { groupId: grp.id } });
      if (creds) emailService.sendCredentialsUpdated({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName }).catch(() => {});
      emailService.sendWelcome({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName, planName: grp.planName, billingCycle: grp.billingCycle, pricePerSlot: grp.pricePerSlot, memberPays: order.memberPays, currency: order.currency, expiresAt: mem.expiresAt, organizerName: grp.organizerName }).catch(() => {});
    }
  }

  const confirmedCount = await prisma.groupMember.count({ where: { groupId: order.groupId, paymentStatus: "confirmed", role: { not: "organizer" } } });
  const grp2 = await prisma.group.findUnique({ where: { id: order.groupId } });
  if (grp2 && confirmedCount >= grp2.maxSlots) {
    await prisma.group.update({ where: { id: order.groupId }, data: { status: "full" } });
  }

  await prisma.paystackOrder.update({ where: { id: reference }, data: { status: "COMPLETED", confirmedAt } });

  return { confirmed: true, healed };
}

(async () => {
  const pending = await prisma.paystackOrder.findMany({ where: { status: "PENDING" } });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Checking ${pending.length} pending Paystack order(s) against the Paystack API...\n`);

  let confirmed = 0, healed = 0, stillPending = 0, failedOrAbandoned = 0, errors = 0;

  for (const o of pending) {
    try {
      const r = await confirmOrder(o.id);
      if (r.confirmed || r.wouldConfirm) {
        confirmed++;
        if (r.healed) healed++;
        const tag = r.healed ? " (was already flipped to confirmed by the crash bug — Payment/email backfilled now)" : "";
        console.log(`${DRY_RUN ? "would confirm" : "✓ confirmed"}: ${o.memberName} <${o.memberEmail}> ref=${o.reference}${tag}`);
      } else if (r.status === "failed" || r.status === "abandoned") {
        failedOrAbandoned++;
      } else if (!r.skipped || r.status) {
        stillPending++;
      }
    } catch (err) {
      errors++;
      console.error(`✗ ${o.memberName} <${o.memberEmail}> ref=${o.reference}: ${err.message}`);
    }
    await sleep(150); // be polite to the Paystack API
  }

  console.log(`\n${DRY_RUN ? "Would confirm" : "Confirmed"} ${confirmed} order(s) (${healed} were healed from the crash bug). ${failedOrAbandoned} failed/abandoned. ${stillPending} still genuinely pending. ${errors} error(s).`);
  await prisma.$disconnect();
})();
