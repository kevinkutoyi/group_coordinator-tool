CREATE TABLE IF NOT EXISTS "group_reviews" (
  "id"        TEXT NOT NULL,
  "groupId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "rating"    INTEGER NOT NULL,
  "comment"   TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_reviews_groupId_userId_key" ON "group_reviews"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "group_reviews_groupId_idx" ON "group_reviews"("groupId");

DO $$ BEGIN
  ALTER TABLE "group_reviews" ADD CONSTRAINT "group_reviews_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "group_reviews" ADD CONSTRAINT "group_reviews_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
