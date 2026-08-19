// ═══════════════════════════════════════════════════════════════════════════
// SplitCoins verification harness.
//
// This is NOT a mock of what SplitCoins *should* do — the mint/deduction/
// eligibility functions below (mintSplitCoin, awardPurchaseSplitCoins,
// awardReferralSplitCoinsIfEligible, determinePurchaseContext,
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
// Three different purchase-reward tiers, keyed off whether this is the
// buyer's first-ever confirmed payment (across any group) and, if so,
// whether they were referred:
//   - Repeat purchase (not their first ever):        2 coins / KES 20 — 1 buyer + 0.5 owner + 0.5 platform (unchanged, original reward)
//   - First-ever purchase, WITH a referrer:           3 coins / KES 30 — 1.5 referrer + 1 platform + 0.5 buyer, and NOTHING else (no separate purchase coins at all — the referral reward IS the reward)
//   - First-ever purchase, NO referrer (organic signup): 1 coin / KES 10 — 0.25 buyer + 0.25 owner + 0.5 platform
const PURCHASE_COINS_KES       = 20; // repeat purchase
const FIRST_PURCHASE_COINS_KES = 10; // first-ever purchase, no referral
const REFERRAL_COINS_KES       = 30; // first-ever purchase, WITH a referral (replaces the purchase reward entirely)
const DEFAULT_KES_PER_USD = 130;

async function mintSplitCoin(reference, reason, sourceType, recipientId, amount, relatedUserId = null) {
  try {
    await prisma.splitCoinTransaction.create({
      data: { sourcePaymentId: reference, reason, sourceType, recipientId, amount, relatedUserId },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err; // P2002 = unique constraint hit, already minted — safe no-op
  }
}

// `context` is precomputed once by determinePurchaseContext() BEFORE the
// Payment row is created (see confirmOrder), and is the single source of
// truth both this function and the fee-split calculation (computeSplitCoinsSplit)
// read from — so they can never disagree about which reward tier applies.
async function awardPurchaseSplitCoins(payment, context) {
  const ref = payment.pesapalOrderId;

  if (context.isFirstPurchase && context.referrerId) {
    // Referred first purchase: awardReferralSplitCoinsIfEligible() below is
    // the entire reward for this transaction — no separate purchase coins.
    return;
  }

  if (context.isFirstPurchase) {
    // First-ever purchase, no referrer: a smaller reward, still split with
    // the group owner (same platform-owned fallback as the repeat-purchase
    // tier below — if the owner IS the platform, it just gets both shares).
    const ownerId = payment.moderatorId;
    await mintSplitCoin(ref, "first_purchase_buyer", "purchase", payment.userId, 0.25);
    if (!ownerId || ownerId === "superadmin") {
      await mintSplitCoin(ref, "first_purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 0.75);
    } else {
      await mintSplitCoin(ref, "first_purchase_owner", "purchase", ownerId, 0.25);
      await mintSplitCoin(ref, "first_purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 0.5);
    }
    return;
  }

  // Repeat purchase: the original 2-coin reward. If the owner IS the
  // platform itself (Group.organizerId === "superadmin"), the platform
  // gets the full 1.0 instead of splitting with a separate owner.
  const ownerId = payment.moderatorId;
  await mintSplitCoin(ref, "purchase_buyer", "purchase", payment.userId, 1);
  if (!ownerId || ownerId === "superadmin") {
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 1);
  } else {
    await mintSplitCoin(ref, "purchase_owner", "purchase", ownerId, 0.5);
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 0.5);
  }
}

// Fires only when context.referrerId is set (i.e. this is the referred
// user's first-ever confirmed payment): 1.5 SplitCoins to the referrer, 1 to
// the platform, and 0.5 to the referred buyer themselves — 3 coins / KES 30
// total, and the ONLY purchase-related reward on this transaction (see
// awardPurchaseSplitCoins above, which mints nothing when this fires).
async function awardReferralSplitCoinsIfEligible(payment, referrerId) {
  if (!referrerId) return;
  const ref = payment.pesapalOrderId;
  await mintSplitCoin(ref, "referral_referrer", "referral", referrerId, 1.5, payment.userId);
  await mintSplitCoin(ref, "referral_buyer", "referral", payment.userId, 0.5, payment.userId);
  await mintSplitCoin(ref, "referral_platform", "referral", SPLITCOIN_PLATFORM_WALLET, 1, payment.userId);
}

// Is the user about to receive their first-ever confirmed Payment, and if
// so, do they have a referrer? Checked BEFORE the new Payment row is
// created (see confirmOrder) so a raced duplicate webhook/verify call for
// the same reference sees the identical answer on both concurrent attempts
// — neither has created its row yet, so both count 0 prior payments and
// agree. That keeps the fee split and the eventual mint from ever drifting
// apart, and the DB unique constraint on Payment.pesapalOrderId (migration
// 0014) plus the ledger's own unique (sourcePaymentId, reason) constraint
// are what actually prevent double-crediting if both attempts proceed.
async function determinePurchaseContext(userId) {
  const [buyer, priorPayments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.payment.count({ where: { userId } }),
  ]);
  const isFirstPurchase = priorPayments === 0;
  const referrerId = (isFirstPurchase && buyer?.referredBy) ? buyer.referredBy : null;
  return { isFirstPurchase, referrerId };
}

// ── SplitCoins accounting: gross-vs-net revenue ─────────────────────────────
// SplitCoins are a REAL deduction, not a display estimate, and they come off
// the TOP of what the buyer paid (memberPays) — not carved out of the
// platform's fee after the fact. e.g. a buyer paying KES 1,000 on a repeat
// purchase (KES 20 of SplitCoins minted) only has KES 980 actually split
// between platformFee/moderatorOwed at the normal fee percentage; both sides
// shrink together, proportionally, rather than the platform absorbing the
// whole cost. This also means platform-owned groups need no special case
// here: moderatorOwed is still computed the same way even when there's no
// separate moderator to pay it out to (the payout queue already tracks that
// as "ownAccount" revenue rather than an external transfer).
// Both the Admin Dashboard and Moderator Dashboard read the resulting
// Payment.platformFee/moderatorOwed directly — there's only one real number,
// not two dashboards independently estimating a "net" figure.
function computeSplitCoinsSplit(order, context, kesRate) {
  const totalCoinsKes = context.isFirstPurchase && context.referrerId ? REFERRAL_COINS_KES
    : context.isFirstPurchase ? FIRST_PURCHASE_COINS_KES
    : PURCHASE_COINS_KES;
  const rate = kesRate || DEFAULT_KES_PER_USD;
  const totalDeductionUsd = +(totalCoinsKes / rate).toFixed(4);
  const netMemberPays = Math.max(0, +(order.memberPays - totalDeductionUsd).toFixed(2));
  // Preserve the exact fee ratio this order was originally quoted at
  // (rather than re-fetching the live platform fee percent, which may have
  // changed since initiate-time) and apply it to the reduced base.
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

// Simulates the relevant slice of confirmOrder(): decide the purchase
// context (first-ever purchase? referred?), split the ORIGINAL order
// (memberPays/platformFee/moderatorOwed, as PaystackOrder would have them,
// gross/pre-deduction) into the SplitCoins-adjusted amounts, create the
// Payment row (racing attempts fall back to the winner's row via the
// pesapalOrderId unique constraint), then mint — the same sequence
// confirmOrder() runs today.
async function simulateConfirmedPayment({ reference, userId, moderatorId, memberPays = 100, platformFee = 8, kesRate = 130 }) {
  const order = { memberPays, platformFee, moderatorOwed: memberPays - platformFee };
  const context = await determinePurchaseContext(userId);
  const { platformFee: adjustedPlatformFee, moderatorOwed: adjustedModeratorOwed } = computeSplitCoinsSplit(order, context, kesRate);

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
    await awardPurchaseSplitCoins(paymentRow, context);
    await awardReferralSplitCoinsIfEligible(paymentRow, context.referrerId);
  }
  return { created: justCreated, paymentRow, context };
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
  console.log("\n=== 1. Repeat purchase (not the buyer's first ever): unchanged KES 20 / 1+0.5+0.5 reward ===");
  resetDb();
  db.users.buyer1 = { id: "buyer1", referredBy: null };
  // Prime buyer1 with an existing prior payment so this is NOT their first purchase.
  db.payments.push({ id: "pay_prime1", pesapalOrderId: "REF-0", userId: "buyer1", moderatorId: "mod1",
    platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  // memberPays=100, platformFee=8 (8%) -> netMemberPays = 100 - 20/130 = 99.8462 -> round 99.85
  // platformFee = 99.85 * 0.08 = 7.988 -> 7.99 ; moderatorOwed = 99.85-7.99 = 91.86
  const { paymentRow: p1, context: c1 } = await simulateConfirmedPayment({ reference: "REF-1", userId: "buyer1", moderatorId: "mod1", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("context correctly identifies this as NOT a first purchase", c1.isFirstPurchase === false);
  check("gross fields preserved untouched (memberPays=100, platformFee=8, moderatorOwed=92)",
    p1.grossPlatformFee === 8 && p1.grossModeratorOwed === 92);
  check("net platformFee is 8% of the REDUCED memberPays, not 8% of the original 100", approx(p1.platformFee, 7.99));
  check("net moderatorOwed is 92% of the REDUCED memberPays, not the original 92", approx(p1.moderatorOwed, 91.86));
  check("platformFee + moderatorOwed == netMemberPays (nothing lost/gained in rounding beyond a cent)",
    approx(p1.platformFee + p1.moderatorOwed, 100 - 20/130, 0.02));
  check("BOTH platformFee and moderatorOwed shrank (deduction hit memberPays as a whole, not just the fee)",
    p1.platformFee < 8 && p1.moderatorOwed < 92);
  check("coins mint as before: buyer 1 / owner 0.5 / platform 0.5", balanceOf("buyer1") === 1 && balanceOf("mod1") === 0.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.5);

  console.log("\n=== 2. Platform-owned group (repeat purchase): same proportional split, no special-casing needed ===");
  resetDb();
  db.users.buyer2 = { id: "buyer2", referredBy: null };
  db.payments.push({ id: "pay_prime2", pesapalOrderId: "REF-0b", userId: "buyer2", moderatorId: "superadmin",
    platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  const { paymentRow: p2 } = await simulateConfirmedPayment({ reference: "REF-2", userId: "buyer2", moderatorId: "superadmin", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("platformFee/moderatorOwed split identically to the non-platform-owned case (99.85 * 8%/92%)",
    approx(p2.platformFee, 7.99) && approx(p2.moderatorOwed, 91.86));
  check("platform gets the full 1.0 purchase coin, no separate owner coin exists", balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);
  check("no purchase_owner ledger row was created", db.splitCoinTransactions.some(r => r.reason === "purchase_owner") === false);

  console.log("\n=== 3. Referred user's FIRST-EVER purchase: ONLY the KES30 referral reward, no separate purchase coins ===");
  resetDb();
  db.users.referred3 = { id: "referred3", referredBy: "referrerA" };
  // netMemberPays = 100 - 30/130 = 99.7692 -> 99.77 ; platformFee = 99.77*0.08=7.9816->7.98 ; moderatorOwed=91.79
  const { paymentRow: p3, context: c3 } = await simulateConfirmedPayment({ reference: "REF-3", userId: "referred3", moderatorId: "mod3", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("context correctly identifies this as a first purchase WITH a referrer", c3.isFirstPurchase === true && c3.referrerId === "referrerA");
  check("deduction is ONLY the KES30 referral total, not KES30+20", approx(p3.platformFee, 7.98));
  check("moderatorOwed reflects the SAME reduced base, proportionally", approx(p3.moderatorOwed, 91.79));
  check("referrer got 1.5, buyer got ONLY the 0.5 welcome bonus (no separate 1-coin purchase reward), platform got 1",
    balanceOf("referrerA") === 1.5 && balanceOf("referred3") === 0.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);
  check("no purchase_buyer/purchase_owner/purchase_platform rows exist for this referred first purchase",
    db.splitCoinTransactions.filter(r => r.sourcePaymentId === "REF-3" && r.sourceType === "purchase").length === 0);
  check("referral coins total exactly 3.0 (1.5 + 1 + 0.5) = KES30",
    db.splitCoinTransactions.filter(r => r.sourceType === "referral").reduce((s,r)=>s+r.amount,0) === 3);
  check("ledger has exactly 3 rows total for REF-3 (referral only)",
    db.splitCoinTransactions.filter(r => r.sourcePaymentId === "REF-3").length === 3);

  console.log("\n=== 4. Subsequent (2nd) purchase by the same referred user: reverts to the normal repeat-purchase reward ===");
  const { paymentRow: p4, context: c4 } = await simulateConfirmedPayment({ reference: "REF-4", userId: "referred3", moderatorId: "mod3", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("context now correctly identifies this as NOT a first purchase", c4.isFirstPurchase === false);
  check("2nd purchase only loses KES20 from memberPays (normal repeat rate), not another KES30", approx(p4.platformFee, 7.99));
  check("referrer balance unchanged by the 2nd purchase", balanceOf("referrerA") === 1.5);
  check("buyer gets the normal 1-coin repeat purchase reward on top of their earlier 0.5 welcome bonus", balanceOf("referred3") === 0.5 + 1);
  check("owner (mod3) got their 0.5 owner coin on the 2nd purchase", balanceOf("mod3") === 0.5);

  console.log("\n=== 5. First-ever purchase, NO referrer (organic signup): KES10 / 0.25 buyer + 0.25 owner + 0.5 platform ===");
  resetDb();
  db.users.organic5 = { id: "organic5", referredBy: null };
  // netMemberPays = 100 - 10/130 = 99.9231 -> 99.92 ; platformFee = 99.92*0.08=7.9936->7.99 ; moderatorOwed=91.93
  const { paymentRow: p5, context: c5 } = await simulateConfirmedPayment({ reference: "REF-5", userId: "organic5", moderatorId: "mod5", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("context correctly identifies this as a first purchase with NO referrer", c5.isFirstPurchase === true && c5.referrerId === null);
  check("deduction is only KES10 (smallest tier)", approx(p5.platformFee, 7.99));
  check("moderatorOwed reflects the KES10 (not KES20 or KES30) deduction", approx(p5.moderatorOwed, 91.93));
  check("buyer got exactly 0.25, owner (mod5) got exactly 0.25, platform got exactly 0.5",
    balanceOf("organic5") === 0.25 && balanceOf("mod5") === 0.25 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.5);
  check("reasons used are first_purchase_buyer/first_purchase_owner/first_purchase_platform",
    db.splitCoinTransactions.some(r => r.reason === "first_purchase_buyer") &&
    db.splitCoinTransactions.some(r => r.reason === "first_purchase_owner") &&
    db.splitCoinTransactions.some(r => r.reason === "first_purchase_platform") &&
    !db.splitCoinTransactions.some(r => r.reason === "purchase_owner"));
  check("ledger has exactly 3 rows total for REF-5", db.splitCoinTransactions.filter(r => r.sourcePaymentId === "REF-5").length === 3);

  console.log("\n=== 5a. Same organic buyer's 2nd purchase reverts to the normal repeat-purchase reward ===");
  const { context: c5a } = await simulateConfirmedPayment({ reference: "REF-5B", userId: "organic5", moderatorId: "mod5", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("context now correctly identifies this as NOT a first purchase", c5a.isFirstPurchase === false);
  check("buyer balance grew by the normal 1 coin (0.25 + 1 = 1.25)", balanceOf("organic5") === 1.25);
  check("owner (mod5) now gets their 0.5 owner coin on the 2nd purchase (on top of the 0.25 first-purchase owner coin = 0.75)", balanceOf("mod5") === 0.75);

  console.log("\n=== 5b. First-ever purchase, NO referrer, PLATFORM-owned group: platform gets both the owner and platform shares ===");
  resetDb();
  db.users.organic5b = { id: "organic5b", referredBy: null };
  const { paymentRow: p5b } = await simulateConfirmedPayment({ reference: "REF-5C", userId: "organic5b", moderatorId: "superadmin", memberPays: 100, platformFee: 8, kesRate: 130 });
  check("deduction still only KES10", approx(p5b.platformFee, 7.99));
  check("buyer got 0.25, platform got the full 0.75 (owner share folds into platform), no separate owner row",
    balanceOf("organic5b") === 0.25 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 0.75);
  check("no first_purchase_owner row exists for a platform-owned group",
    db.splitCoinTransactions.some(r => r.sourcePaymentId === "REF-5C" && r.reason === "first_purchase_owner") === false);

  console.log("\n=== 6. Failed / pending / cancelled / refunded payments never reach the split/mint path ===");
  resetDb();
  check("no Payment rows exist for an unconfirmed order", db.payments.length === 0);
  check("no ledger rows exist for an unconfirmed order", db.splitCoinTransactions.length === 0);

  console.log("\n=== 7. Duplicate payment/webhook notification for the SAME reference is a real no-op (unique constraint) ===");
  resetDb();
  db.users.buyer7 = { id: "buyer7", referredBy: null };
  db.payments.push({ id: "pay_prime7", pesapalOrderId: "REF-0c", userId: "buyer7", moderatorId: "mod1",
    platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  await simulateConfirmedPayment({ reference: "REF-7", userId: "buyer7", moderatorId: "mod1" });
  const beforeCount = db.payments.length;
  const second = await simulateConfirmedPayment({ reference: "REF-7", userId: "buyer7", moderatorId: "mod1" });
  check("second call did NOT create a new Payment row (P2002 caught)", second.created === false);
  check("payments table still has exactly 1 row for this reference", db.payments.filter(p=>p.pesapalOrderId==="REF-7").length === 1 && db.payments.length === beforeCount);
  check("buyer balance still exactly 1.0 (not 2.0)", balanceOf("buyer7") === 1);

  console.log("\n=== 8. RACED concurrent confirmations for the same reference (referred first purchase): exactly one Payment row survives ===");
  resetDb();
  db.users.buyer8 = { id: "buyer8", referredBy: "referrerB" };
  const [r1, r2] = await simulateRacedDuplicatePayment({ reference: "REF-8", userId: "buyer8", moderatorId: "mod1" });
  check("exactly one of the two concurrent attempts actually created the row", r1.created !== r2.created);
  check("payments table has exactly 1 row for REF-8 (DB unique constraint enforced)", db.payments.filter(p=>p.pesapalOrderId==="REF-8").length === 1);
  check("only ONE referral reward was minted (referrer == 1.5, not 3.0)", balanceOf("referrerB") === 1.5);
  check("only ONE welcome bonus was minted (buyer == 0.5, not 1.0)", balanceOf("buyer8") === 0.5);
  check("ledger has exactly 3 rows for REF-8 (referrer+buyer+platform referral only), not 6",
    db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-8").length === 3);

  console.log("\n=== 9. Fractional 0.5 coins and fractional deductions sum with full precision (repeat purchases) ===");
  resetDb();
  db.users.buyerA = { id: "buyerA", referredBy: null };
  db.users.buyerB = { id: "buyerB", referredBy: null };
  db.users.buyerC = { id: "buyerC", referredBy: null };
  db.payments.push({ id: "pay_primeA", pesapalOrderId: "REF-9-0A", userId: "buyerA", moderatorId: "modX", platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  db.payments.push({ id: "pay_primeB", pesapalOrderId: "REF-9-0B", userId: "buyerB", moderatorId: "modX", platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  db.payments.push({ id: "pay_primeC", pesapalOrderId: "REF-9-0C", userId: "buyerC", moderatorId: "modX", platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  await simulateConfirmedPayment({ reference: "REF-9A", userId: "buyerA", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-9B", userId: "buyerB", moderatorId: "modX" });
  await simulateConfirmedPayment({ reference: "REF-9C", userId: "buyerC", moderatorId: "modX" });
  check("owner accumulated 0.5+0.5+0.5 == 1.5 coins exactly", balanceOf("modX") === 1.5);
  check("kesValue == balance * 10 for the fractional owner balance", getKesSync("modX") === 15);

  console.log("\n=== 10. Multiple different referrals by the same referrer accumulate additively ===");
  resetDb();
  db.users.rr1 = { id: "rr1", referredBy: "bigReferrer" };
  db.users.rr2 = { id: "rr2", referredBy: "bigReferrer" };
  db.users.rr3 = { id: "rr3", referredBy: "bigReferrer" };
  await simulateConfirmedPayment({ reference: "REF-10A", userId: "rr1", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-10B", userId: "rr2", moderatorId: "modY" });
  await simulateConfirmedPayment({ reference: "REF-10C", userId: "rr3", moderatorId: "modY" });
  check("referrer earned 1.5 x 3 = 4.5 across 3 distinct referred users", balanceOf("bigReferrer") === 4.5);
  check("each referred buyer got their own 0.5 welcome bonus (no purchase coin on their first purchase)",
    balanceOf("rr1") === 0.5 && balanceOf("rr2") === 0.5 && balanceOf("rr3") === 0.5);
  check("3 distinct referral_referrer ledger rows exist", db.splitCoinTransactions.filter(r=>r.reason==="referral_referrer" && r.recipientId==="bigReferrer").length === 3);

  console.log("\n=== 11. Ledger integrity + payout-queue-equivalent invariants ===");
  resetDb();
  db.users.x1 = { id: "x1", referredBy: "refX" };
  db.users.x2 = { id: "x2", referredBy: "refX" };
  await simulateConfirmedPayment({ reference: "REF-11A", userId: "x1", moderatorId: "modZ" });
  await simulateConfirmedPayment({ reference: "REF-11B", userId: "x2", moderatorId: "superadmin" });
  await simulateConfirmedPayment({ reference: "REF-11A", userId: "x1", moderatorId: "modZ" }); // duplicate re-fire
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

  console.log("\n=== 12. Very small transaction: deduction can floor platformFee at 0 without going negative ===");
  resetDb();
  db.users.tiny = { id: "tiny", referredBy: "tinyRef" };
  // The KES30 referral-tier deduction converts to ~$0.2308 at a 130 KES/USD
  // rate. A memberPays smaller than that (e.g. $0.20, an unrealistically
  // cheap slot, but the math must still hold) means the WHOLE payment is
  // consumed by the deduction -- netMemberPays floors at 0, so both
  // platformFee and moderatorOwed correctly floor at 0 too rather than go
  // negative, while the coins still mint at full value regardless.
  const { paymentRow: pTiny } = await simulateConfirmedPayment({ reference: "REF-TINY", userId: "tiny", moderatorId: "modTiny", memberPays: 0.20, platformFee: 0.016, kesRate: 130 });
  check("platformFee floors at 0 instead of going negative", pTiny.platformFee === 0);
  check("moderatorOwed floors at 0 instead of going negative", pTiny.moderatorOwed === 0);
  check("coins still mint at full referral value regardless of how small the transaction was",
    balanceOf("tiny") === 0.5 && balanceOf("tinyRef") === 1.5 && balanceOf(SPLITCOIN_PLATFORM_WALLET) === 1);

  console.log("\n=== 13. Refund/reversal cannot corrupt history because the ledger is append-only ===");
  resetDb();
  db.users.buyer13 = { id: "buyer13", referredBy: null };
  db.payments.push({ id: "pay_prime13", pesapalOrderId: "REF-0d", userId: "buyer13", moderatorId: "mod13", platformFee: 8, moderatorOwed: 92, grossPlatformFee: 8, grossModeratorOwed: 92, memberPays: 100 });
  await simulateConfirmedPayment({ reference: "REF-13", userId: "buyer13", moderatorId: "mod13" });
  const ledgerBefore = JSON.parse(JSON.stringify(db.splitCoinTransactions));
  db.splitCoinTransactions.push({ id: "sc_correction_1", sourcePaymentId: "REF-13", reason: "purchase_buyer_reversal", sourceType: "correction", recipientId: "buyer13", amount: -1, relatedUserId: null, createdAt: new Date() });
  check("original mint rows are untouched byte-for-byte after a correction", JSON.stringify(ledgerBefore) === JSON.stringify(db.splitCoinTransactions.slice(0, ledgerBefore.length)));
  check("post-correction balance nets to 0 via SUM, all original rows still present", balanceOf("buyer13") === 0 && db.splitCoinTransactions.filter(r=>r.sourcePaymentId==="REF-13").length === 4);

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(" - " + f));
    process.exit(1);
  }
}

run();
