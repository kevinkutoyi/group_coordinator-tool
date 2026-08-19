-- Add referral capture field to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referredBy" TEXT;

-- SplitCoins ledger (append-only; balance = SUM(amount) per recipientId)
CREATE TABLE IF NOT EXISTS "splitcoin_transactions" (
  "id"              TEXT NOT NULL,
  "recipientId"     TEXT NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "reason"          TEXT NOT NULL,
  "sourceType"      TEXT NOT NULL,
  "sourcePaymentId" TEXT NOT NULL,
  "relatedUserId"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "splitcoin_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "splitcoin_transactions_sourcePaymentId_reason_key" ON "splitcoin_transactions"("sourcePaymentId", "reason");
CREATE INDEX IF NOT EXISTS "splitcoin_transactions_recipientId_idx" ON "splitcoin_transactions"("recipientId");
CREATE INDEX IF NOT EXISTS "splitcoin_transactions_sourcePaymentId_idx" ON "splitcoin_transactions"("sourcePaymentId");
