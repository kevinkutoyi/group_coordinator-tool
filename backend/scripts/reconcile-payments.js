require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const pesapal = require("../src/pesapal");
const emailService = require("../src/emailService");
const prisma = new PrismaClient();

async function confirmOrder(orderId) {
  const order = await prisma.pesapalOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status === "COMPLETED") return { skipped: true };
  if (!order.orderTrackingId) return { skipped: true, reason: "no trackingId" };
  const statusData = await pesapal.getTransactionStatus(order.orderTrackingId);
  const code = statusData.payment_status_description;
  await prisma.pesapalOrder.update({ where: { id: orderId }, data: { pesapalStatus: code } });
  if (code !== "Completed") return { skipped: true, status: code };
  const confirmedAt = new Date();
  const exp = new Date(); exp.setMonth(exp.getMonth() + (order.months || 1));
  await prisma.groupMember.update({ where: { id: order.memberId }, data: { paymentStatus: "confirmed", expiresAt: exp } });
  if (!await prisma.payment.findFirst({ where: { pesapalOrderId: orderId } })) {
    await prisma.payment.create({ data: {
      groupId: order.groupId, memberId: order.memberId, userId: order.userId,
      memberName: order.memberName, months: order.months, amount: order.memberPays,
      platformFee: order.platformFee, moderatorOwed: order.moderatorOwed,
      organizerGets: order.moderatorOwed, moderatorId: order.moderatorId,
      method: "pesapal", pesapalOrderId: orderId, currency: order.currency,
      confirmedAt, payoutStatus: "pending",
    }});
    await prisma.platformEarning.create({ data: { orderId, groupId: order.groupId, fee: order.platformFee, currency: order.currency, earnedAt: confirmedAt } });
    const [grp, mem] = await Promise.all([
      prisma.group.findUnique({ where: { id: order.groupId } }),
      prisma.groupMember.findUnique({ where: { id: order.memberId } }),
    ]);
    if (grp && mem) {
      const creds = await prisma.groupCredential.findUnique({ where: { groupId: grp.id } });
      if (creds) emailService.sendCredentialsUpdated({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName }).catch(()=>{});
      emailService.sendWelcome({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName, planName: grp.planName, billingCycle: grp.billingCycle, pricePerSlot: grp.pricePerSlot, memberPays: order.memberPays, currency: order.currency, expiresAt: mem.expiresAt, organizerName: grp.organizerName }).catch(()=>{});
    }
  }
  await prisma.pesapalOrder.update({ where: { id: orderId }, data: { status: "COMPLETED", confirmedAt } });
  return { confirmed: true };
}

(async () => {
  // Only check orders < 24h old to avoid hammering PesaPal with stale lookups
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await prisma.pesapalOrder.findMany({ where: { status: "PENDING", createdAt: { gt: cutoff } } });
  let confirmed = 0;
  for (const o of pending) {
    try {
      const r = await confirmOrder(o.id);
      if (r.confirmed) {
        confirmed++;
        console.log(`[${new Date().toISOString()}] ✓ Healed: ${o.memberName} <${o.memberEmail}>`);
      }
    } catch (err) {
      // swallow expected "Pending Payment" / "INVALID" responses silently
      if (!/Pending Payment|INVALID/.test(err.message || "")) {
        console.error(`[${new Date().toISOString()}] ✗ ${o.memberName}: ${err.message}`);
      }
    }
  }
  if (confirmed > 0) console.log(`[${new Date().toISOString()}] Reconciled ${confirmed} order(s).`);
  
  // ── Pass 2: Abandon orders > 72 hours old that PesaPal still reports as Invalid/Pending Payment
  const ABANDON_AFTER_HOURS = 72;
  const abandonCutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);
  const stale = await prisma.pesapalOrder.findMany({
    where: { status: "PENDING", createdAt: { lt: abandonCutoff } },
  });
  let abandoned = 0;
  for (const o of stale) {
    try {
      // Mark the order itself as ABANDONED
      await prisma.pesapalOrder.update({
        where: { id: o.id },
        data:  { status: "ABANDONED" },
      });
      // Flip the member's paymentStatus so they fall out of "Pending Payments" admin queue
      await prisma.groupMember.updateMany({
        where: { id: o.memberId, paymentStatus: "pending" },
        data:  { paymentStatus: "abandoned" },
      });
      abandoned++;
      console.log(`[${new Date().toISOString()}] ⏰ Abandoned: ${o.memberName} <${o.memberEmail}> (${Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 3600000)}h old)`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ✗ Abandon failed for ${o.memberName}: ${err.message}`);
    }
  }
  if (abandoned > 0) console.log(`[${new Date().toISOString()}] Abandoned ${abandoned} stale order(s).`);

  await prisma.$disconnect();
})();
