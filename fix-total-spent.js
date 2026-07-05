const fs = require('fs');
const serverFile = 'backend/src/server.js';
let src = fs.readFileSync(serverFile, 'utf8');

// Replace the payments query and totalSpent calculation in getUserProfile
const oldPayments = `  // Get payment history
  const payments = await prisma.payment.findMany({
    where: { userId: req.params.id },
    orderBy: { confirmedAt: "desc" },
    take: 20,
  });`;

const newPayments = `  // Get Paystack payment history only
  const paystackPayments = await prisma.paystackOrder.findMany({
    where: { userId: req.params.id, status: "COMPLETED" },
    orderBy: { confirmedAt: "desc" },
    take: 20,
  });`;

src = src.replace(oldPayments, newPayments);

// Replace payments references in the response
src = src.replace(
  `    payments: payments.map(p => ({`,
  `    payments: paystackPayments.map(p => ({`
);

src = src.replace(
  `      id:          p.id,
      amount:      p.memberPays || p.amount,
      currency:    p.currency,
      confirmedAt: p.confirmedAt,
      months:      p.months,
    })),
    totalSpent: payments.reduce((a, p) => a + (p.memberPays || p.amount || 0), 0),`,
  `      id:          p.id,
      amount:      p.memberPays,
      currency:    p.currency,
      confirmedAt: p.confirmedAt,
      months:      p.months,
    })),
    totalSpent: paystackPayments.reduce((a, p) => a + (p.memberPays || 0), 0),`
);

fs.writeFileSync(serverFile, src);
console.log('✓ Total spent now uses Paystack payments only');
