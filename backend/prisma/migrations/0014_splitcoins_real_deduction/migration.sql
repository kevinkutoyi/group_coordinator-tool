-- SplitCoins now really come out of platformFee/moderatorOwed instead of
-- being a display-only estimate. Keep the pre-deduction (gross) amounts
-- alongside for audit/dashboard transparency.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "grossPlatformFee" DOUBLE PRECISION;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "grossModeratorOwed" DOUBLE PRECISION;

-- Backfill existing rows so gross == net for payments recorded before this
-- migration (they were never SplitCoins-adjusted in the first place).
UPDATE "payments" SET "grossPlatformFee" = "platformFee" WHERE "grossPlatformFee" IS NULL;
UPDATE "payments" SET "grossModeratorOwed" = "moderatorOwed" WHERE "grossModeratorOwed" IS NULL;

-- Close the race where a duplicate webhook/verify call for the same Paystack
-- reference could create two Payment rows for the same real-world purchase
-- (previously only guarded by an application-level SELECT-then-INSERT check,
-- which a genuine race could slip past). This is now load-bearing: real
-- payout amounts are summed from this table, so a duplicate row would have
-- meant double-counting real money owed to a moderator, not just SplitCoins.
--
-- NOTE: if production already has duplicate pesapalOrderId rows from a past
-- race, this CREATE UNIQUE INDEX will fail loudly instead of silently
-- merging/deleting financial records. That's intentional -- if it fails, run
--   SELECT "pesapalOrderId", COUNT(*) FROM "payments"
--   WHERE "pesapalOrderId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
-- and resolve each duplicate pair by hand (checking payoutStatus/paidAt on
-- both rows) before re-running this migration.
CREATE UNIQUE INDEX IF NOT EXISTS "payments_pesapalOrderId_key" ON "payments"("pesapalOrderId");
