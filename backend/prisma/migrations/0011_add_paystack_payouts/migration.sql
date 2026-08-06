ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutMethod" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutName" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutPhone" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutBankCode" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutBankName" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "payoutAccountNumber" TEXT;
ALTER TABLE "moderator_settings" ADD COLUMN IF NOT EXISTS "paystackRecipientCode" TEXT;

ALTER TABLE "moderator_payouts" ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "moderator_payouts" ADD COLUMN IF NOT EXISTS "transferCode" TEXT;
ALTER TABLE "moderator_payouts" ADD COLUMN IF NOT EXISTS "transferRef" TEXT;
ALTER TABLE "moderator_payouts" ADD COLUMN IF NOT EXISTS "transferStatus" TEXT;
ALTER TABLE "moderator_payouts" ADD COLUMN IF NOT EXISTS "transferError" TEXT;
