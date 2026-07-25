CREATE TABLE IF NOT EXISTS "group_profiles" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_profiles_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "profileSelectedAt" TIMESTAMP(3);
