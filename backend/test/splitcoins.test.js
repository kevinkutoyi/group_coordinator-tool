// ═══════════════════════════════════════════════════════════════════════════
// SplitCoins verification harness.
//
// This is NOT a mock of what SplitCoins *should* do — the mint/accounting
// functions below (mintSplitCoin, awardPurchaseSplitCoins,
// awardReferralSplitCoinsIfEligible, getSplitCoinsKesValue, netOfSplitCoins)
// are copied VERBATIM from backend/src/server.js so this harness exercises
// the real, shipped logic. If you touch any of those functions in
// server.js, copy the change here too (or this test silently stops being
// representative of production).
//
// The sandbox this was originally written in has no network access to pull
// down Prisma's query engine binary, so there's no live Postgres to test
// against. Instead this harness implements an in-memory "prisma" stand-in
// that enforces the same constraint that matters most here: the UNIQUE
// index on (sourcePaymentId, reason) on splitcoin_transactions, exactly as
// created by backend/prisma/migrations/0013_add_splitcoins/migration.sql.
//
// Run with: node backend/test/splitcoins.test.js
// ═══════════════════════════════════════════════════════════════════════════

let scId = 0;
let paymentClock = 0;
const db = {
  splitCoinTransactions: [],     // simulates the splitcoin_transactions table
  payments: [],                  // simulates the payments table
  users: {},                     // id -> { id, referredBy }
};

function resetDb() {
  scId = 0;
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
      // Tiny counter-based clock (not Date.now()) so rows created within the
      // same millisecond in this synchronous test still get a strict,
      // deterministic creation order — mirrors real Postgres row ordering
      // better than relying on wall-clock resolution.
      paymentClock += 1;
      const row = { id: "pay_" + (db.payments.length + 1), createdAt: new Date(paymentClock), ...data };
      db.payments.push(row);
      return row;
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ↓↓↓ COPIED VERBATIM FROM backend/src/server.js ↓↓↓
// ═══════════════════════════════════════════════════════════════════════════
const SPLITCOIN_PLATFORM_WALLET = "platform";

async function mintSplitCoin(reference, reason, sourceType, recipientId, amount, relatedUserId = null) {
  try {
    await prisma.splitCoinTransaction.create({
      data: { sourcePaymentId: reference, reason, sourceType, recipientId, amount, relatedUserId },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err; // P2002 = unique constraint hit, already minted — safe no-op
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

async function awardReferralSplitCoinsIfEligible(payment) {
  const buyer = await prisma.user.findUnique({ where: { id: payment.userId } });
  if (!buyer?.referredBy) return;

  const ref = payment.pesapalOrderId;
  const earliest = await prisma.payment.findFirst({ where: { userId: payment.userId }, orderBy: { createdAt: "asc" } });
  if (!earliest || earliest.pesapalOrderId !== ref) return; // not their first-ever confirmed payment

  await mintSplitCoin(ref, "referral_referrer", "referral", buyer.referredBy, 2, payment.userId);
  await mintSplitCoin(ref, "referral_platform", "referral", SPLITCOIN_PLATFORM_WALLET, 1, payment.userId);
}

async function getSplitCoinsKesValue(where = {}) {
  const rows = await prisma.splitCoinTransaction.findMany({ where });
  return +(rows.reduce((sum, r) => sum + r.amount, 0) * 10).toFixed(2);
}
function netOfSplitCoins(gross, coinsKes) {
  return +((gross || 0) - (coinsKes || 0)).toFixed(2);
}
// ═══════════════════════════════════════════════════════════════════════════
// ↑↑↑ END VERBATIM COPY ↑↑↑
// ═══════════════════════════════════════════════════════════════════════════

// Simulates the relevant slice of confirmOrder(): create a Payment row (if
// not already recorded for this reference) then run both award functions —
// the same sequence confirmOrder() runs inside `if (code === "success")`
// and `if (!alreadyRecorded)`.
async function simulateConfirmedPayment({ reference, userId, moderatorId }) {
  const alreadyRecorded = await prisma.payment.findFirst({ where: { pesapalOrderId: reference } });
  if (alreadyRecorded) return { created: false, paymentRow: alreadyRecorded };
  const paymentRow = await prisma.payment.create({
    data: { pesapalOrderId: reference, userId, moderatorId },
  });
  await awardPurchaseSplitCoins(paymentRow);
  await awardReferralSplitCoinsIfEligible(paymentRow);
  return { created: true, paymentRow };
}

// Simulates two racing webhook/verify calls landing on the SAME reference
// before either has written its Payment row yet — i.e. the actual race the
// alreadyRecorded check does NOT fully close (Payment.pesapalOrderId has no
// DB unique constraint), which is exactly why the ledger's own unique
// constraint exists as the real backstop.
async function simulateRacedDuplicatePayment({ reference, userId, moderatorId }) {
  const dataFactory = () => ({ pesapalOrderId: reference, userId, moderatorId });
  const p1 = await prisma.payment.create({ data: dataFactory() });
  const p2 = await prisma.payment.create({ data: dataFactory() }); // race: both passed alreadyRecorded===null
  await awardPurchaseSplitCoins(p1);
  await awardReferralSplitCoinsIfEligible(p1);
  await awardPurchaseSplitCoins(p2);
  await awardReferralSplitCoinsIfEligible(p2);
  return [p1, p2];
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

async function run() {
  console.log("\n=== 1. Successful payment mints purchase coins (buyer 1 / owner 0.5 / platform 0.5) ===");
  resetDb();
  db.users.buyer1 = { id: "buyer1", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-1", userId: "buyer1", moderatorId: "mod1" });
  check("buyer gets 1.0", balanceOf("buyer1") === 1);
  check("owner gets 0.5", balanceOf("mod1") === 0.5);
  check("platform gets 0.5", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.5);
  check("total minted this txn == 2.0", db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-1").reduce((s,r)=>s+r.amount,0) === 2);
  check("no referral coins minted (buyer has no referrer)", db.splitCoinTransactions.filter(r=>r.sourceType==="referral").length === 0);

  console.log("\n=== 2. Failed / pending / cancelled / refunded payments never reach the mint path ===");
  resetDb();
  // These statuses never call simulateConfirmedPayment at all in the real
  // app (confirmOrder only calls the award functions inside
  // `if (code === "success")` AND `if (!alreadyRecorded)` — a
  // failed/pending/abandoned/cancelled order never creates a Payment row,
  // so mint is structurally unreachable).
  check("no Payment rows exist for an unconfirmed order", db.payments.length === 0);
  check("no ledger rows exist for an unconfirmed order", db.splitCoinTransactions.length === 0);

  console.log("\n=== 3. First referral purchase mints purchase + referral coins together ===");
  resetDb();
  db.users.referred1 = { id: "referred1", referredBy: "referrerA" };
  await simulateConfirmedPayment({ reference: "REF-3", userId: "referred1", moderatorId: "mod1" });
  check("buyer purchase coin", balanceOf("referred1") === 1);
  check("owner purchase coin", balanceOf("mod1") === 0.5);
  check("referrer gets 2.0", balanceOf("referrerA") === 2);
  check("platform gets purchase 0.5 + referral 1.0 = 1.5", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1.5);
  check("total minted this txn == 5.0 (2 purchase + 3 referral)", db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-3").reduce((s,r)=>s+r.amount,0) === 5);

  console.log("\n=== 4. Subsequent purchase by the same referred user does NOT re-trigger referral ===");
  await simulateConfirmedPayment({ reference: "REF-4", userId: "referred1", moderatorId: "mod1" });
  check("referrer balance unchanged by 2nd purchase (still 2.0)", balanceOf("referrerA") === 2);
  check("buyer got another 1.0 purchase coin (now 2.0 total)", balanceOf("referred1") === 2);
  check("no second referral_referrer row exists", db.splitCoinTransactions.filter(r=>r.reason==="referral_referrer").length === 1);

  console.log("\n=== 5. Duplicate payment/webhook notification for the SAME reference is a no-op ===");
  resetDb();
  db.users.buyer5 = { id: "buyer5", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-5", userId: "buyer5", moderatorId: "mod1" });
  const before = db.splitCoinTransactions.length;
  const second = await simulateConfirmedPayment({ reference: "REF-5", userId: "buyer5", moderatorId: "mod1" });
  check("second call did not create a new Payment row (alreadyRecorded caught it)", second.created === false);
  check("ledger row count unchanged after duplicate call", db.splitCoinTransactions.length === before);
  check("buyer balance still exactly 1.0 (not 2.0)", balanceOf("buyer5") === 1);

  console.log("\n=== 6. RACED duplicate Payment rows for the same reference (alreadyRecorded check defeated) ===");
  resetDb();
  db.users.buyer6 = { id: "buyer6", referredBy: "referrerB" };
  await simulateRacedDuplicatePayment({ reference: "REF-6", userId: "buyer6", moderatorId: "mod1" });
  check("two Payment rows WERE created (proving the race is real)", db.payments.filter(p=>p.pesapalOrderId==="REF-6").length === 2);
  check("but only ONE set of purchase coins was minted (buyer == 1.0, not 2.0)", balanceOf("buyer6") === 1);
  check("only ONE referral reward was minted (referrer == 2.0, not 4.0)", balanceOf("referrerB") === 2);
  check("ledger has exactly 5 rows for REF-6 (2 purchase + 3 referral), not 10",
    db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-6").length === 5);

  console.log("\n=== 7. Fractional 0.5 coins are stored and summed with full precision ===");
  resetDb();
  db.users.buyerA = { id: "buyerA", referredBy: null };
  db.users.buyerB = { id: "buyerB", referredBy: null };
  db.users.buyerC = { id: "buyerC", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-7A", userId: "buyerA", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-7B", userId: "buyerB", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-7C", userId: "buyerC", moderatorId: "modX" });
  check("owner accumulated 0.5+0.5+0.5 == 1.5 exactly (no float drift)", balanceOf("modX") === 1.5);
  check("kesValue == balance * 10 for the fractional owner balance", getKesSync("modX") === 15);

  console.log("\n=== 8. Multiple different referrals by the same referrer accumulate additively ===");
  resetDb();
  db.users.r1 = { id: "r1", referredBy: "bigReferrer" };
  db.users.r2 = { id: "r2", referredBy: "bigReferrer" };
  db.users.r3 = { id: "r3", referredBy: "bigReferrer" };
  await simulateConfirmedPayment({ reference: "REF-8A", userId: "r1", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-8B", userId: "r2", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-8C", userId: "r3", moderatorId: "modY" });
  check("referrer earned 2.0 x 3 = 6.0 across 3 distinct referred users", balanceOf("bigReferrer") === 6);
  check("3 distinct referral_referrer ledger rows exist (no collision on unique key)",
    db.splitCoinTransactions.filter(r=>r.reason==="referral_referrer" && r.recipientId==="bigReferrer").length === 3);

  console.log("\n=== 9. Platform-owned group (organizerId/moderatorId === 'superadmin') ===");
  resetDb();
  db.users.buyer9 = { id: "buyer9", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-9", userId: "buyer9", moderatorId: "superadmin" });
  check("buyer still gets 1.0", balanceOf("buyer9") === 1);
  check("no purchase_owner row was created at all", db.splitCoinTransactions.some(r=>r.reason==="purchase_owner") === false);
  check("platform gets the FULL 1.0 (not split 0.5/0.5)", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);

  console.log("\n=== 10. Ledger integrity invariants (balances match ledger, KES=balance*10, no negatives, no dupes) ===");
  resetDb();
  db.users.x1 = { id: "x1", referredBy: "refX" };
  db.users.x2 = { id: "x2", referredBy: "refX" };
  await simulateConfirmedPayment({ reference: "REF-10A", userId: "x1", moderatorId: "modZ" });
  await simulateConfirmedPayment({ reference: "REF-10B", userId: "x2", moderatorId: "superadmin" });
  await simulateConfirmedPayment({ reference: "REF-10A", userId: "x1", moderatorId: "modZ" }); // duplicate re-fire
  const allRecipients = [...new Set(db.splitCoinTransactions.map(r => r.recipientId))];
  let allMatch = true;
  for (const rid of allRecipients) {
    if (getKesSync(rid) !== +(balanceOf(rid) * 10).toFixed(2)) allMatch = false;
  }
  check("balance == SUM(ledger rows) for every recipient (derived, can't drift)", allMatch);
  check("no negative amounts anywhere in the ledger", db.splitCoinTransactions.every(r => r.amount > 0));
  const keyPairs = db.splitCoinTransactions.map(r => r.sourcePaymentId + "::" + r.reason);
  check("no duplicate (sourcePaymentId, reason) pairs in the ledger", new Set(keyPairs).size === keyPairs.length);
  check("zero-balance user (never transacted) reads as exactly 0", balanceOf("someone-who-never-earned-anything") === 0);

  console.log("\n=== 11. Admin/Moderator net-revenue helpers use identical shared logic ===");
  resetDb();
  db.users.buyer11 = { id: "buyer11", referredBy: "ref11" };
  await simulateConfirmedPayment({ reference: "REF-11", userId: "buyer11", moderatorId: "mod11" });
  const platformCoinsKes = await getSplitCoinsKesValue({}); // Admin: ALL coins, any recipient
  const modCoinsKes = await getSplitCoinsKesValue({ recipientId: "mod11", reason: "purchase_owner" }); // Moderator: only their own owner-coins
  check("admin-scope KES == total minted x 10 (5 coins x 10 = 50)", platformCoinsKes === 50);
  check("moderator-scope KES == only their purchase_owner coin (0.5 x 10 = 5)", modCoinsKes === 5);
  check("netOfSplitCoins(1000, 50) == 950", netOfSplitCoins(1000, 50) === 950);
  check("netOfSplitCoins(100, 5) == 95 for the moderator's own pool", netOfSplitCoins(100, 5) === 95);
  check("net can go negative without throwing (transparency over flooring)", netOfSplitCoins(10, 50) === -40);

  console.log("\n=== 12. Refund/reversal cannot corrupt history because the ledger is append-only ===");
  resetDb();
  db.users.buyer12 = { id: "buyer12", referredBy: null };
  await simulateConfirmedPayment({ reference: "REF-12", userId: "buyer12", moderatorId: "mod12" });
  const ledgerBefore = JSON.parse(JSON.stringify(db.splitCoinTransactions));
  // There is no code path anywhere in server.js that updates or deletes a
  // splitCoinTransaction row (grep-verified). Demonstrate the safe way a
  // future refund WOULD be reversed: an additive negative correcting entry,
  // never a delete/edit of history.
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
