-- Add expiryNotifications tracking array to group_members
ALTER TABLE "group_members"
    ADD COLUMN IF NOT EXISTS "expiryNotifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
