-- SplitCoins redemption at checkout: a buyer with a balance of 2 or more
-- coins can redeem their ENTIRE balance for a same-value KES discount on
-- that purchase (locked in at initiate-time, see /api/paystack/initiate).
-- The redeemed coins are then reassigned 50/50 to the group's moderator and
-- the platform (or entirely to the platform if the group is platform-owned)
-- via new "redeem_buyer" / "redeem_moderator" / "redeem_platform" ledger
-- rows -- redeem_buyer is the first ledger reason that mints a NEGATIVE
-- amount (a debit), which the balance SUM(amount) already handles correctly
-- without any schema change to splitcoin_transactions itself.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "redeemedSplitCoins" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "grossMemberPays" DOUBLE PRECISION;

ALTER TABLE "PaystackOrder" ADD COLUMN IF NOT EXISTS "redeemedSplitCoins" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaystackOrder" ADD COLUMN IF NOT EXISTS "grossMemberPays" DOUBLE PRECISION;

-- Backfill existing rows so gross == net for payments recorded before this
-- migration (they were never redemption-discounted in the first place).
UPDATE "payments" SET "grossMemberPays" = "amount" WHERE "grossMemberPays" IS NULL;
UPDATE "PaystackOrder" SET "grossMemberPays" = "memberPays" WHERE "grossMemberPays" IS NULL;
