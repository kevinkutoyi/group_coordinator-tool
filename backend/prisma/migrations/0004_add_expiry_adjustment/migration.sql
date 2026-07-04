
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustmentDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustedAt" TIMESTAMP(3);
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "expiryAdjustedNote" TEXT;
