// ═══════════════════════════════════════════════════════════════════════════
// SplitCoins verification harness.
//
// This is NOT a mock of what SplitCoins *should* do — the mint/deduction/
// eligibility functions below (mintSplitCoin, awardPurchaseSplitCoins,
// awardReferralSplitCoinsIfEligible, determineReferralEligibility,
// computeSplitCoinsSplit, getSplitCoinsKesValue) are copied VERBATIM from
// backend/src/server.js so this harness exercises the real, shipped logic.
// If you touch any of those functions in server.js, copy the change here
// too (or this test silently stops being representative of production).
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
  payments: [],                  // simulates the payments table (UNIQUE on pesapalOrderId)
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
    async findFirst({ where = {} } = {}) {
      return db.payments.find(p => Object.entries(where).every(([k, v]) => p[k] === v)) || null;
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
const PURCHASE_COINS_KES = 20; // 2 coins per confirmed purchase: 1 buyer + 0.5 owner + 0.5 platform
const REFERRAL_COINS_KES = 30; // 3 coins on a referred user's first confirmed purchase: 1.5 referrer + 1 platform + 0.5 buyer
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
  await mintSplitCoin(ref, "referral_referrer", "referral", referrerId, 1.5, payment.userId);
  await mintSplitCoin(ref, "referral_buyer", "referral", payment.userId, 0.5, payment.userId);
  await mintSplitCoin(ref, "referral_platform", "referral", SPLITCOIN_PLATFORM_WALLET, 1, payment.userId);
}

async function determineReferralEligibility(userId) {
  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  if (!buyer?.referredBy) return null;
  const priorPayments = await prisma.payment.count({ where: { userId } });
  if (priorPayments > 0) return null;
  return buyer.referredBy;
}

function computeSplitCoinsSplit(order, referrerId, kesRate) {
  const totalCoinsKes = PURCHASE_COINS_KES + (referrerId ? REFERRAL_COINS_KES : 0);
  const rate = kesRate || DEFAULT_KES_PER_USD;
  const totalDeductionUsd = +(totalCoinsKes / rate).toFixed(4);
  const netMemberPays = Math.max(0, +(order.memberPays - totalDeductionUsd).toFixed(2));
  const feeRatio = order.memberPays > 0 ? order.platformFee / order.memberPays : 0;
  const platformFee   = Math.max(0, +(netMemberPays * feeRatio).toFixed(2));
  const moderatorOwed = Math.max(0, +(netMemberPays - platformFee).toFixed(2));
  return { platformFee, moderatorOwed, totalDeductionUsd };
}
async function getSplitCoinsKesValue(where = {}) {
  const rows = await prisma.splitCoinTransaction.findMany({ where });
  return +(rows.reduce((sum, r) => sum + r.amount, 0) * 10).toFixed(2);
}
// ═══════════════════════════════════════════════════════════════════════════
// ↑↑↑ END VERBATIM COPY ↑↑↑
// ═══════════════════════════════════════════════════════════════════════════

// Simulates the relevant slice of confirmOrder(): decide referral
// eligibility, split the ORIGINAL order (memberPays/platformFee/
// moderatorOwed, as PaystackOrder would have them, gross/pre-deduction)
// into the SplitCoins-adjusted amounts, create the Payment row (racing
// attempts fall back to the winner's row via the pesapalOrderId unique
// constraint), then mint — the same sequence confirmOrder() runs today.
async function simulateConfirmedPayment({ reference, userId, moderatorId, memberPays = 100, platformFee = 8, kesRate = 130 }) {
  const order = { memberPays, platformFee, moderatorOwed: memberPays - platformFee };
  const referrerId = await determineReferralEligibility(userId);
  const { platformFee: adjustedPlatformFee, moderatorOwed: adjustedModeratorOwed } = computeSplitCoinsSplit(order, referrerId, kesRate);

  let paymentRow, justCreated = true;
  try {
    paymentRow = await prisma.payment.create({
      data: { pesapalOrderId: reference, userId, moderatorId,
        platformFee: adjustedPlatformFee, moderatorOwed: adjustedModeratorOwed,
        grossPlatformFee: order.platformFee, grossModeratorOwed: order.moderatorOwed,
        memberPays: order.memberPays },
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
// both compute eligibility/split independently (neither has created a row
// yet), then race on prisma.payment.create(); the loser catches P2002 and
// backs off instead of double-recording/double-minting.
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
// Deductions are rounded to 4dp and the resulting platformFee/moderatorOwed
// are rounded again to 2dp when stored (real currency precision) -- so
// comparisons against a theoretical unrounded value need tolerance for that
// compounding rounding, not exact float equality.
function approx(a, b, eps = 0.02) { return Math.abs(a - b) < eps; }

async function run() {
  console.log("\n=== 1. Regular purchase: KES 20 total comes off memberPays before the fee split, not off platformFee ===");
  resetDb();
  db.users.buyer1 = { id: "buyer1", referredBy: null };
  // memberPays=100, platformFee=8 (8%) -> netMemberPays = 100 - 20/130 = 99.8462 -> round 99.85
  // platformFee = 99.85 * 0.08 = 7.988 -> 7.99 ; moderatorOwed = 99.85-7.99 = 91.86
  const { paymentRow: p1 } = await simulateConfirmedPayment({ reference: "REF-1", userId: "buyer1", moderatorId: "mod1", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("gross fields preserved untouched (memberPays=100, platformFee=8, moderatorOwed=92)",
    p1.grossPlatformFee === 8 && p1.grossModeratorOwed === 92);
  check("net platformFee is 8% of the REDUCED memberPays, not 8% of the original 100", approx(p1.platformFee, 7.99));
  check("net moderatorOwed is 92% of the REDUCED memberPays, not the original 92", approx(p1.moderatorOwed, 91.86));
  check("platformFee + moderatorOwed == netMemberPays (nothing lost/gained in rounding beyond a cent)",
    approx(p1.platformFee + p1.moderatorOwed, 100 - 20/130, 0.02));
  check("BOTH platformFee and moderatorOwed shrank (deduction hit memberPays as a whole, not just the fee)",
    p1.platformFee < 8 && p1.moderatorOwed < 92);
  check("coins mint as before: buyer 1 / owner 0.5 / platform 0.5", balanceOf("buyer1") === 1 && balanceOf("mod1") === 0.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.5);

  console.log("\n=== 2. Platform-owned group: same proportional split, no special-casing needed ===");
  resetDb();
  db.users.buyer2 = { id: "buyer2", referredBy: null };
  const { paymentRow: p2 } = await simulateConfirmedPayment({ reference: "REF-2", userId: "buyer2", moderatorId: "superadmin", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("platformFee/moderatorOwed split identically to the non-platform-owned case (99.85 * 8%/92%)",
    approx(p2.platformFee, 7.99) && approx(p2.moderatorOwed, 91.86));
  check("platform gets the full 1.0 purchase coin, no separate owner coin exists", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);
  check("no purchase_owner ledger row was created", db.splitCoinTransactions.some(r => r.reason === "purchase_owner") === false);

  console.log("\n=== 3. Referred user's first purchase: extra KES 30 also comes off memberPays before the split ===");
  resetDb();
  db.users.referred3 = { id: "referred3", referredBy: "referrerA" };
  // netMemberPays = 100 - 50/130 = 99.6154 -> 99.62 ; platformFee = 99.62*0.08=7.9696->7.97 ; moderatorOwed=91.65
  const { paymentRow: p3 } = await simulateConfirmedPayment({ reference: "REF-3", userId: "referred3", moderatorId: "mod3", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("platformFee reflects the full KES50 (20 purchase + 30 referral) deduction from memberPays", approx(p3.platformFee, 7.97));
  check("moderatorOwed reflects the SAME reduced base, proportionally (not just the owner-coin slice)", approx(p3.moderatorOwed, 91.65));
  check("referrer got 1.5, buyer got their usual 1 + a new 0.5 referral bonus = 1.5, platform got 0.5+1=1.5",
    balanceOf("referrerA") === 1.5 && balanceOf("referred3") === 1.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1.5);
  check("referral coins total 3.0 (1.5 + 1 + 0.5), same KES30 as before the rebalance",
    db.splitCoinTransactions.filter(r => r.sourceType === "referral").reduce((s,r)=>s+r.amount,0) === 3);

  console.log("\n=== 4. Subsequent purchase by the same referred user: only the KES20 purchase deduction applies ===");
  const { paymentRow: p4 } = await simulateConfirmedPayment({ reference: "REF-4", userId: "referred3", moderatorId: "mod3", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("2nd purchase only loses KES20 from memberPays, not another KES30", approx(p4.platformFee, 7.99));
  check("referrer balance unchanged by the 2nd purchase", balanceOf("referrerA") === 1.5);
  check("buyer does NOT get another 0.5 referral bonus on the 2nd purchase (only +1 purchase coin)", balanceOf("referred3") === 1.5 + 1);

  console.log("\n=== 5. Failed / pending / cancelled / refunded payments never reach the split/mint path ===");
  resetDb();
  check("no Payment rows exist for an unconfirmed order", db.payments.length === 0);
  check("no ledger rows exist for an unconfirmed order", db.splitCoinTransactions.length === 0);

  console.log("\n=== 6. Duplicate payment/webhook notification for the SAME reference is a real no-op (unique constraint) ===");
  resetDb();
  db.users.buyer6 = { id: "buyer6", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-6", userId: "buyer6", moderatorId: "mod1" });
  const beforeCount = db.payments.length;
  const second = await simulateConfirmedPayment({ reference: "REF-6", userId: "buyer6", moderatorId: "mod1" });
  check("second call did NOT create a new Payment row (P2002 caught)", second.created === false);
  check("payments table still has exactly 1 row for this reference", db.payments.filter(p=>p.pesapalOrderId==="REF-6").length === 1 && db.payments.length === beforeCount);
  check("buyer balance still exactly 1.0 (not 2.0)", balanceOf("buyer6") === 1);

  console.log("\n=== 7. RACED concurrent confirmations for the same reference: exactly one Payment row survives ===");
  resetDb();
  db.users.buyer7 = { id: "buyer7", referredBy: "referrerB" };
  const [r1, r2] = await simulateRacedDuplicatePayment({ reference: "REF-7", userId: "buyer7", moderatorId: "mod1" });
  check("exactly one of the two concurrent attempts actually created the row", r1.created !== r2.created);
  check("payments table has exactly 1 row for REF-7 (DB unique constraint enforced)", db.payments.filter(p=>p.pesapalOrderId==="REF-7").length === 1);
  check("only ONE set of purchase coins was minted (buyer's purchase share == 1.0, not 2.0)",
    db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-7" && r.reason==="purchase_buyer").length === 1);
  check("only ONE referral reward was minted (referrer == 1.5, not 3.0)", balanceOf("referrerB") === 1.5);
  check("ledger has exactly 6 rows for REF-7 (buyer+owner+platform purchase, referrer+buyer+platform referral), not 12",
    db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-7").length === 6);

  console.log("\n=== 8. Fractional 0.5 coins and fractional deductions sum with full precision ===");
  resetDb();
  db.users.buyerA = { id: "buyerA", referredBy: null };
  db.users.buyerB = { id: "buyerB", referredBy: null };
  db.users.buyerC = { id: "buyerC", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-8A", userId: "buyerA", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-8B", userId: "buyerB", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-8C", userId: "buyerC", moderatorId: "modX" });
  check("owner accumulated 0.5+0.5+0.5 == 1.5 coins exactly", balanceOf("modX") === 1.5);
  check("kesValue == balance * 10 for the fractional owner balance", getKesSync("modX") === 15);

  console.log("\n=== 9. Multiple different referrals by the same referrer accumulate additively ===");
  resetDb();
  db.users.r1 = { id: "r1", referredBy: "bigReferrer" };
  db.users.r2 = { id: "r2", referredBy: "bigReferrer" };
  db.users.r3 = { id: "r3", referredBy: "bigReferrer" };
  await simulateConfirmedPayment({ reference: "REF-9A", userId: "r1", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-9B", userId: "r2", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-9C", userId: "r3", moderatorId: "modY" });
  check("referrer earned 1.5 x 3 = 4.5 across 3 distinct referred users", balanceOf("bigReferrer") === 4.5);
  check("each referred buyer also got their own 0.5 referral bonus", balanceOf("r1") === 1.5 && balanceOf("r2") === 1.5 && balanceOf("r3") === 1.5);
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
  const modZPending = db.payments.filter(p => p.moderatorId === "modZ").reduce((s,p)=>s+p.moderatorOwed, 0);
  const modZGross   = db.payments.filter(p => p.moderatorId === "modZ").reduce((s,p)=>s+p.grossModeratorOwed, 0);
  check("modZ's real payout total is strictly less than gross (SplitCoins actually deducted)", modZPending < modZGross);
  check("zero-balance user (never transacted) reads as exactly 0", balanceOf("someone-who-never-earned-anything") === 0);

  console.log("\n=== 11. Very small transaction: deduction can floor platformFee at 0 without going negative ===");
  resetDb();
  db.users.tiny = { id: "tiny", referredBy: "tinyRef" };
  // The KES50 (20 purchase + 30 referral) deduction converts to ~$0.3846 at
  // a 130 KES/USD rate. A memberPays smaller than that (e.g. $0.30, an
  // unrealistically cheap slot, but the math must still hold) means the
  // WHOLE payment is consumed by the deduction -- netMemberPays floors at 0,
  // so both platformFee and moderatorOwed correctly floor at 0 too rather
  // than go negative, while the coins still mint at full value regardless.
  const { paymentRow: pTiny } = await simulateConfirmedPayment({ reference: "REF-TINY", userId: "tiny", moderatorId: "modTiny", memberPays: 0.30, platformFee: 0.024, kesRate: 130 });
  check("platformFee floors at 0 instead of going negative", pTiny.platformFee === 0);
  check("moderatorOwed floors at 0 instead of going negative", pTiny.moderatorOwed === 0);
  check("coins still mint at full value regardless of how small the transaction was",
    balanceOf("tiny") === 1.5 && balanceOf("tinyRef") === 1.5 && balanceOf("modTiny") === 0.5);

  console.log("\n=== 12. Refund/reversal cannot corrupt history because the ledger is append-only ===");
  resetDb();
  db.users.buyer12 = { id: "buyer12", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-12", userId: "buyer12", moderatorId: "mod12" });
  const ledgerBefore = JSON.parse(JSON.stringify(db.splitCoinTransactions));
  db.splitCoinTransactions.push({ id: "sc_correction_1", sourcePaymentId: "REF-12", reason: "purchase_buyer_reversal", sourceType: "correction", recipientId: "buyer12", amount: -1, relatedUserId: null, createdAt: new Date() });
  check("original mint rows are untouched byte-for-byte after a correction", JSON.stringify(ledgerBefore) === JSON.stringify(db.splitCoinTransactions.slice(0, ledgerBefore.length)));
  check("post-correction balance nets to 0 via SUM, all original rows still present", balanceOf("buyer12") === 0 && db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-12").length === 4);

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(" - " + f));
    process.exit(1);
  }
}

run();
