const fs = require('fs');
const file = 'backend/src/server.js';
let src = fs.readFileSync(file, 'utf8');

// Find and update the verify endpoint to handle missing PaystackOrder
const oldVerify = `app.get("/api/paystack/verify", async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: "reference required" });
  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "COMPLETED")
    return res.json({ status: "COMPLETED", memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets });
  try {
    const updated = await confirmOrder(reference);
    res.json({ status: updated.status, memberPays: updated.memberPays, platformFee: updated.platformFee, organizerGets: updated.organizerGets });
  } catch (err) { res.status(502).json({ error: err.message }); }
});`;

const newVerify = `app.get("/api/paystack/verify", async (req, res) => {
  const { reference, memberId, groupId } = req.query;
  if (!reference) return res.status(400).json({ error: "reference required" });

  try {
    // Check if order exists
    let order = await prisma.paystackOrder.findUnique({ where: { id: reference } }).catch(() => null);

    // If no order record (e.g. table was missing when payment was made), verify directly with Paystack
    if (!order) {
      const txData = await paystack.verifyTransaction(reference);
      if (txData.status === "success" && memberId) {
        // Confirm the member directly
        const member = await prisma.groupMember.findUnique({ where: { id: memberId } });
        if (member && member.paymentStatus !== "confirmed") {
          const exp = new Date(); exp.setMonth(exp.getMonth() + (member.months || 1));
          await prisma.groupMember.update({ where: { id: memberId }, data: { paymentStatus: "confirmed", expiresAt: exp } });
          // Record payment
          const group = await prisma.group.findUnique({ where: { id: groupId || member.groupId } });
          if (group) {
            const feePercent = group.feePercent || 8;
            const platformFee = +(member.memberPays * feePercent / 100).toFixed(2);
            const moderatorOwed = +(member.memberPays - platformFee).toFixed(2);
            await prisma.payment.create({ data: {
              groupId: member.groupId, memberId, userId: member.userId,
              memberName: member.name, months: member.months || 1,
              amount: member.memberPays, platformFee, moderatorOwed,
              organizerGets: moderatorOwed, moderatorId: group.organizerId,
              method: "paystack", pesapalOrderId: reference, currency: "KES",
              confirmedAt: new Date(), payoutStatus: "pending",
            }}).catch(() => {});
          }
          console.log("✅ Direct verify confirmed member:", member.name);
        }
        return res.json({ status: "COMPLETED", memberPays: member?.memberPays || 0, platformFee: 0, organizerGets: 0 });
      }
      return res.json({ status: txData.status === "success" ? "COMPLETED" : "PENDING", memberPays: 0, platformFee: 0, organizerGets: 0 });
    }

    if (order.status === "COMPLETED")
      return res.json({ status: "COMPLETED", memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets });

    const updated = await confirmOrder(reference);
    res.json({ status: updated.status, memberPays: updated.memberPays, platformFee: updated.platformFee, organizerGets: updated.organizerGets });
  } catch (err) { res.status(502).json({ error: err.message }); }
});`;

if (src.includes('app.get("/api/paystack/verify"')) {
  src = src.replace(oldVerify, newVerify);
  fs.writeFileSync(file, src);
  console.log('✓ Verify endpoint updated with fallback');
} else {
  console.log('⚠ Verify endpoint not found');
}
