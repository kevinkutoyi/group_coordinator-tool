CREATE TABLE IF NOT EXISTS "email_logs" (
  "id"        TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "to"        TEXT NOT NULL,
  "subject"   TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'sent',
  "resendId"  TEXT,
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_logs_createdAt_idx" ON "email_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "email_logs_resendId_idx" ON "email_logs"("resendId");
