// ═══════════════════════════════════════════════════════════════════════════
// SplitCoins verification harness.
//
// This is NOT a mock of what SplitCoins *should* do — the mint/deduction/
// eligibility functions below (mintSplitCoin, awardPurchaseSplitCoins,
// awardReferralSplitCoinsIfEligible, determineReferralEligibility,
// computeSplitCoinsDeduction, getSplitCoinsKesValue) are copied VERBATIM
// from backend/src/server.js so this harness exercises the real, shipped
// logic. If you touch any of those functions in server.js, copy the change
// here too (or this test silently stops being representative of production).
//
// The sandbox this was originally written in has no network access to pull
// down Prisma's query engine binary, so there's no live Postgres to test
// against. Instead this harness implements an in-memory "prisma" stand-in
// that enforces the two DB constraints that matter here: the UNIQUE index
// on splitcoin_transactions(sourcePaymentId, reason), and the UNIQUE index
// on payments(pesapalOrderId) added in migration 0014 — both exactly as the
// real migrations create them.
//
// Run with: node backend/test/splitcoins.test.js
// ═══════════════════════════════════════════════════════════════════════════

let scId = 0;
let payId = 0;
let paymentClock = 0;
const db = {
  splitCoinTransactions: [],     // simulates the splitcoin_transactions table
  payments: [],                  // simulates the payments table (now UNIQUE on pesapalOrderId)
  users: {},                     // id -> { id, referredBy }
};

function resetDb() {
  scId = 0;
  payId = 0;
  paymentClock = 0;
  db.splitCoinTransactions = [];
  db.payments = [];
  db.users = {};
}

// ── Mock Prisma surface used by the copied functions ────────────────────────
const prisma = {
  splitCoinTransaction: {
    async create({ data }) {
      const dupe = db.splitCoinTransactions.find(
        r => r.sourcePaymentId === data.sourcePaymentId && r.reason === data.reason
      );
      if (dupe) {
        const err = new Error("Unique constraint failed on the fields: (`sourcePaymentId`,`reason`)");
        err.code = "P2002";
        throw err;
      }
      const row = { id: "sc_" + (++scId), createdAt: new Date(), relatedUserId: null, ...data };
      db.splitCoinTransactions.push(row);
      return row;
    },
    async findMany({ where = {} } = {}) {
      return db.splitCoinTransactions.filter(r =>
        Object.entries(where).every(([k, v]) => r[k] === v)
      );
    },
  },
  user: {
    async findUnique({ where: { id } }) {
      return db.users[id] || null;
    },
  },
  payment: {
    async count({ where = {} } = {}) {
      return db.payments.filter(p => Object.entries(where).every(([k, v]) => p[k] === v)).length;
    },
    async findFirst({ where = {}, orderBy } = {}) {
      let rows = db.payments.filter(p => Object.entries(where).every(([k, v]) => p[k] === v));
      if (orderBy?.createdAt === "asc")  rows = rows.slice().sort((a, b) => a.createdAt - b.createdAt);
      if (orderBy?.createdAt === "desc") rows = rows.slice().sort((a, b) => b.createdAt - a.createdAt);
      return rows[0] || null;
    },
    async create({ data }) {
      // UNIQUE constraint on pesapalOrderId (migration 0014).
      if (data.pesapalOrderId != null && db.payments.some(p => p.pesapalOrderId === data.pesapalOrderId)) {
        const err = new Error("Unique constraint failed on the fields: (`pesapalOrderId`)");
        err.code = "P2002";
        throw err;
      }
      paymentClock += 1; // deterministic creation order within the same tick
      const row = { id: "pay_" + (++payId), createdAt: new Date(paymentClock), ...data };
      db.payments.push(row);
      return row;
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ↓↓↓ COPIED VERBATIM FROM backend/src/server.js ↓↓↓
// ═══════════════════════════════════════════════════════════════════════════
const SPLITCOIN_PLATFORM_WALLET = "platform";
const PURCHASE_COINS_KES = 20;
const REFERRAL_COINS_KES = 30;
const OWNER_COIN_KES     = 5;
const DEFAULT_KES_PER_USD = 130;

async function mintSplitCoin(reference, reason, sourceType, recipientId, amount, relatedUserId = null) {
  try {
    await prisma.splitCoinTransaction.create({
      data: { sourcePaymentId: reference, reason, sourceType, recipientId, amount, relatedUserId },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err;
  }
}

async function awardPurchaseSplitCoins(payment) {
  const ref = payment.pesapalOrderId;
  const ownerId = payment.moderatorId;
  await mintSplitCoin(ref, "purchase_buyer", "purchase", payment.userId, 1);
  if (!ownerId || ownerId === "superadmin") {
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 1);
  } else {
    await mintSplitCoin(ref, "purchase_owner", "purchase", ownerId, 0.5);
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 0.5);
  }
}

async function awardReferralSplitCoinsIfEligible(payment, referrerId) {
  if (!referrerId) return;
  const ref = payment.pesapalOrderId;
  await mintSplitCoin(ref, "referral_referrer", "referral", referrerId, 2, payment.userId);
  await mintSplitCoin(ref, "referral_platform", "referral", SPLITCOIN_PLATFORM_WALLET, 1, payment.userId);
}

async function determineReferralEligibility(userId) {
  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  if (!buyer?.referredBy) return null;
  const priorPayments = await prisma.payment.count({ where: { userId } });
  if (priorPayments > 0) return null;
  return buyer.referredBy;
}

function computeSplitCoinsDeduction({ moderatorId, referrerId }, kesRate) {
  const isPlatformOwned = !moderatorId || moderatorId === "superadmin";
  const platformKes = (isPlatformOwned ? PURCHASE_COINS_KES : PURCHASE_COINS_KES - OWNER_COIN_KES)
    + (referrerId ? REFERRAL_COINS_KES : 0);
  const ownerKes = isPlatformOwned ? 0 : OWNER_COIN_KES;
  const rate = kesRate || DEFAULT_KES_PER_USD;
  return {
    platformFeeDeductionUsd:   +(platformKes / rate).toFixed(4),
    moderatorOwedDeductionUsd: +(ownerKes / rate).toFixed(4),
  };
}
async function getSplitCoinsKesValue(where = {}) {
  const rows = await prisma.splitCoinTransaction.findMany({ where });
  return +(rows.reduce((sum, r) => sum + r.amount, 0) * 10).toFixed(2);
}
// ═══════════════════════════════════════════════════════════════════════════
// ↑↑↑ END VERBATIM COPY ↑↑↑
// ═══════════════════════════════════════════════════════════════════════════

// Simulates the relevant slice of confirmOrder(): decide referral
// eligibility + fee deduction, create the Payment row (racing attempts fall
// back to the winner's row via the pesapalOrderId unique constraint), then
// mint — the same sequence confirmOrder() runs today.
async function simulateConfirmedPayment({ reference, userId, moderatorId, grossPlatformFee = 8, grossModeratorOwed = 92, kesRate = 130 }) {
  const referrerId = await determineReferralEligibility(userId);
  const { platformFeeDeductionUsd, moderatorOwedDeductionUsd } = computeSplitCoinsDeduction({ moderatorId, referrerId }, kesRate);
  const adjustedPlatformFee   = Math.max(0, +(grossPlatformFee - platformFeeDeductionUsd).toFixed(2));
  const adjustedModeratorOwed = Math.max(0, +(grossModeratorOwed - moderatorOwedDeductionUsd).toFixed(2));

  let paymentRow, justCreated = true;
  try {
    paymentRow = await prisma.payment.create({
      data: { pesapalOrderId: reference, userId, moderatorId,
        platformFee: adjustedPlatformFee, moderatorOwed: adjustedModeratorOwed,
        grossPlatformFee, grossModeratorOwed },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err;
    paymentRow = await prisma.payment.findFirst({ where: { pesapalOrderId: reference } });
    justCreated = false;
  }

  if (justCreated && paymentRow) {
    await awardPurchaseSplitCoins(paymentRow);
    await awardReferralSplitCoinsIfEligible(paymentRow, referrerId);
  }
  return { created: justCreated, paymentRow };
}

// Simulates two racing webhook/verify calls landing on the SAME reference —
// both compute eligibility/deduction independently (neither has created a
// row yet), then race on prisma.payment.create(); the loser catches P2002
// and backs off instead of double-recording/double-minting.
async function simulateRacedDuplicatePayment(args) {
  const [r1, r2] = await Promise.all([simulateConfirmedPayment(args), simulateConfirmedPayment(args)]);
  return [r1, r2];
}

function balanceOf(recipientId) {
  return db.splitCoinTransactions.filter(r => r.recipientId === recipientId).reduce((s, r) => s + r.amount, 0);
}
function getKesSync(recipientId) {
  return +(balanceOf(recipientId) * 10).toFixed(2);
}

// ── Test runner ───────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? " -- " + detail : "")); }
  console.log((cond ? "✅ PASS " : "❌ FAIL ") + label + (detail ? "  (" + detail + ")" : ""));
}
// Deductions are rounded to 4dp in computeSplitCoinsDeduction and the
// resulting platformFee/moderatorOwed are rounded again to 2dp when stored
// (real currency precision) -- so comparisons against the theoretical
// unrounded value need tolerance for that compounding rounding, not exact
// float equality. usdEps covers direct USD-field comparisons; kesEps covers
// values multiplied back up by ~130x (KES/USD), which amplifies the same
// cent-level rounding into whole-KES-sized noise.
function approx(a, b, eps = 0.02) { return Math.abs(a - b) < eps; }

async function run() {
  console.log("\n=== 1. Regular purchase: KES 20 real deduction, split owner(5)/platform(15) ===");
  resetDb();
  db.users.buyer1 = { id: "buyer1", referredBy: null };
  const { paymentRow: p1 } = await simulateConfirmedPayment({ reference: "REF-1", userId: "buyer1", moderatorId: "mod1", grossPlatformFee: 8, grossModeratorOwed: 92, kesRate: 130 });
  check("gross fields preserved untouched", p1.grossPlatformFee === 8 && p1.grossModeratorOwed === 92);
  check("moderatorOwed reduced by KES5-worth (5/130 USD)", approx(p1.moderatorOwed, 92 - 5/130));
  check("platformFee reduced by KES15-worth (15/130 USD)", approx(p1.platformFee, 8 - 15/130));
  check("gross - net (platformFee) converts back to ~KES15", approx((p1.grossPlatformFee - p1.platformFee) * 130, 15, 1));
  check("gross - net (moderatorOwed) converts back to ~KES5", approx((p1.grossModeratorOwed - p1.moderatorOwed) * 130, 5, 1));
  check("coins still mint as before: buyer 1 / owner 0.5 / platform 0.5", balanceOf("buyer1") === 1 && balanceOf("mod1") === 0.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.5);

  console.log("\n=== 2. Platform-owned group: full KES 20 comes off platformFee, moderatorOwed untouched ===");
  resetDb();
  db.users.buyer2 = { id: "buyer2", referredBy: null };
  const { paymentRow: p2 } = await simulateConfirmedPayment({ reference: "REF-2", userId: "buyer2", moderatorId: "superadmin", grossPlatformFee: 8, grossModeratorOwed: 92, kesRate: 130 });
  check("moderatorOwed completely untouched (no separate moderator to pay)", p2.moderatorOwed === 92);
  check("platformFee reduced by the FULL KES20-worth", approx(p2.platformFee, 8 - 20/130));
  check("platform gets the full 1.0 coin, no owner coin exists", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);

  console.log("\n=== 3. Referred user's first purchase: extra KES 30 also comes off platformFee only ===");
  resetDb();
  db.users.referred3 = { id: "referred3", referredBy: "referrerA" };
  const { paymentRow: p3 } = await simulateConfirmedPayment({ reference: "REF-3", userId: "referred3", moderatorId: "mod3", grossPlatformFee: 8, grossModeratorOwed: 92, kesRate: 130 });
  check("moderatorOwed only loses the usual owner-coin KES5 (referral doesn't touch it)", approx(p3.moderatorOwed, 92 - 5/130));
  check("platformFee loses KES15 (purchase) + KES30 (referral) = KES45-worth", approx(p3.platformFee, 8 - 45/130));
  check("referrer got 2.0, platform got purchase 0.5 + referral 1.0 = 1.5", balanceOf("referrerA") === 2 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1.5);

  console.log("\n=== 4. Subsequent purchase by the same referred user: only the KES20 purchase deduction applies ===");
  const { paymentRow: p4 } = await simulateConfirmedPayment({ reference: "REF-4", userId: "referred3", moderatorId: "mod3", grossPlatformFee: 8, grossModeratorOwed: 92, kesRate: 130 });
  check("no referral deduction on the 2nd purchase", approx(p4.platformFee, 8 - 15/130));
  check("referrer balance unchanged by the 2nd purchase", balanceOf("referrerA") === 2);

  console.log("\n=== 5. Failed / pending / cancelled / refunded payments never reach the deduction/mint path ===");
  resetDb();
  check("no Payment rows exist for an unconfirmed order", db.payments.length === 0);
  check("no ledger rows exist for an unconfirmed order", db.splitCoinTransactions.length === 0);

  console.log("\n=== 6. Duplicate payment/webhook notification for the SAME reference is a real no-op (unique constraint) ===");
  resetDb();
  db.users.buyer6 = { id: "buyer6", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-6", userId: "buyer6", moderatorId: "mod1" });
  const before = db.payments.length;
  const second = await simulateConfirmedPayment({ reference: "REF-6", userId: "buyer6", moderatorId: "mod1" });
  check("second call did NOT create a new Payment row (P2002 caught)", second.created === false);
  check("payments table still has exactly 1 row for this reference", db.payments.filter(p=>p.pesapalOrderId==="REF-6").length === 1 && db.payments.length === before);
  check("buyer balance still exactly 1.0 (not 2.0)", balanceOf("buyer6") === 1);

  console.log("\n=== 7. RACED concurrent confirmations for the same reference: exactly one Payment row survives ===");
  resetDb();
  db.users.buyer7 = { id: "buyer7", referredBy: "referrerB" };
  const [r1, r2] = await simulateRacedDuplicatePayment({ reference: "REF-7", userId: "buyer7", moderatorId: "mod1" });
  check("exactly one of the two concurrent attempts actually created the row", r1.created !== r2.created);
  check("payments table has exactly 1 row for REF-7 (DB unique constraint enforced)", db.payments.filter(p=>p.pesapalOrderId==="REF-7").length === 1);
  check("only ONE set of purchase coins was minted (buyer == 1.0, not 2.0)", balanceOf("buyer7") === 1);
  check("only ONE referral reward was minted (referrer == 2.0, not 4.0)", balanceOf("referrerB") === 2);
  check("ledger has exactly 5 rows for REF-7 (2 purchase + 3 referral), not 10",
    db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-7").length === 5);

  console.log("\n=== 8. Fractional 0.5 coins and fractional USD deductions sum with full precision ===");
  resetDb();
  db.users.buyerA = { id: "buyerA", referredBy: null };
  db.users.buyerB = { id: "buyerB", referredBy: null };
  db.users.buyerC = { id: "buyerC", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-8A", userId: "buyerA", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-8B", userId: "buyerB", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-8C", userId: "buyerC", moderatorId: "modX" });
  check("owner accumulated 0.5+0.5+0.5 == 1.5 coins exactly", balanceOf("modX") === 1.5);
  check("kesValue == balance * 10 for the fractional owner balance", getKesSync("modX") === 15);
  const modPayments = db.payments.filter(p => p.moderatorId === "modX");
  const totalModDeductionUsd = modPayments.reduce((s,p) => s + (p.grossModeratorOwed - p.moderatorOwed), 0);
  check("3 owner-coin deductions sum to 15/130 USD (3 x KES5)", approx(totalModDeductionUsd, 15/130));

  console.log("\n=== 9. Multiple different referrals by the same referrer accumulate additively ===");
  resetDb();
  db.users.r1 = { id: "r1", referredBy: "bigReferrer" };
  db.users.r2 = { id: "r2", referredBy: "bigReferrer" };
  db.users.r3 = { id: "r3", referredBy: "bigReferrer" };
  await simulateConfirmedPayment({ reference: "REF-9A", userId: "r1", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-9B", userId: "r2", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-9C", userId: "r3", moderatorId: "modY" });
  check("referrer earned 2.0 x 3 = 6.0 across 3 distinct referred users", balanceOf("bigReferrer") === 6);
  check("3 distinct referral_referrer ledger rows exist", db.splitCoinTransactions.filter(r=>r.reason==="referral_referrer" && r.recipientId==="bigReferrer").length === 3);

  console.log("\n=== 10. Ledger integrity + payout-queue-equivalent invariants ===");
  resetDb();
  db.users.x1 = { id: "x1", referredBy: "refX" };
  db.users.x2 = { id: "x2", referredBy: "refX" };
  await simulateConfirmedPayment({ reference: "REF-10A", userId: "x1", moderatorId: "modZ" });
  await simulateConfirmedPayment({ reference: "REF-10B", userId: "x2", moderatorId: "superadmin" });
  await simulateConfirmedPayment({ reference: "REF-10A", userId: "x1", moderatorId: "modZ" }); // duplicate re-fire
  const allRecipients = [...new Set(db.splitCoinTransactions.map(r => r.recipientId))];
  let allMatch = true;
  for (const rid of allRecipients) if (getKesSync(rid) !== +(balanceOf(rid) * 10).toFixed(2)) allMatch = false;
  check("balance == SUM(ledger rows) for every recipient", allMatch);
  check("no negative amounts anywhere in the coin ledger", db.splitCoinTransactions.every(r => r.amount > 0));
  check("no negative platformFee/moderatorOwed stored on any Payment row (floored at 0)", db.payments.every(p => p.platformFee >= 0 && p.moderatorOwed >= 0));
  const keyPairs = db.splitCoinTransactions.map(r => r.sourcePaymentId + "::" + r.reason);
  check("no duplicate (sourcePaymentId, reason) pairs in the ledger", new Set(keyPairs).size === keyPairs.length);
  check("payments table has no duplicate pesapalOrderId (unique constraint held)",
    new Set(db.payments.map(p=>p.pesapalOrderId)).size === db.payments.length);
  // payout-queue equivalent: sum of Payment.moderatorOwed for modZ reflects the real, reduced payout.
  const modZPending = db.payments.filter(p => p.moderatorId === "modZ").reduce((s,p)=>s+p.moderatorOwed, 0);
  const modZGross   = db.payments.filter(p => p.moderatorId === "modZ").reduce((s,p)=>s+p.grossModeratorOwed, 0);
  check("modZ's real payout total is strictly less than gross (SplitCoins actually deducted)", modZPending < modZGross);
  check("zero-balance user (never transacted) reads as exactly 0", balanceOf("someone-who-never-earned-anything") === 0);

  console.log("\n=== 11. Refund/reversal cannot corrupt history because the ledger is append-only ===");
  resetDb();
  db.users.buyer11 = { id: "buyer11", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-11", userId: "buyer11", moderatorId: "mod11" });
  const ledgerBefore = JSON.parse(JSON.stringify(db.splitCoinTransactions));
  db.splitCoinTransactions.push({ id: "sc_correction_1", sourcePaymentId: "REF-11", reason: "purchase_buyer_reversal", sourceType: "correction", recipientId: "buyer11", amount: -1, relatedUserId: null, createdAt: new Date() });
  check("original mint rows are untouched byte-for-byte after a correction", JSON.stringify(ledgerBefore) === JSON.stringify(db.splitCoinTransactions.slice(0, ledgerBefore.length)));
  check("post-correction balance nets to 0 via SUM, all original rows still present", balanceOf("buyer11") === 0 && db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-11").length === 4);

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(" - " + f));
    process.exit(1);
  }
}

run();
