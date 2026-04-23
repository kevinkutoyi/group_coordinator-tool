-- SplitPass initial PostgreSQL migration
-- Generated from prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "status" TEXT NOT NULL DEFAULT 'active',
    "newsletter" BOOLEAN NOT NULL DEFAULT true,
    "rejectionNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "groups" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceIcon" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "maxSlots" INTEGER NOT NULL,
    "pricePerSlot" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "memberPays" DOUBLE PRECISION NOT NULL,
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "organizerId" TEXT NOT NULL,
    "organizerName" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "months" INTEGER NOT NULL DEFAULT 1,
    "durationLabel" TEXT NOT NULL DEFAULT '1 Month',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "memberPays" DOUBLE PRECISION NOT NULL,
    "organizerGets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moderatorOwed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_members_groupId_userId_key" ON "group_members"("groupId", "userId");

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "moderatorOwed" DOUBLE PRECISION NOT NULL,
    "organizerGets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moderatorId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'pesapal',
    "pesapalOrderId" TEXT,
    "payoutStatus" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pesapal_orders" (
    "id" TEXT NOT NULL,
    "orderTrackingId" TEXT,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "memberEmail" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moderatorOwed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "organizerGets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moderatorId" TEXT,
    "memberPays" DOUBLE PRECISION NOT NULL,
    "chargedAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pesapalStatus" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pesapal_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "platform_earnings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_earnings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "moderator_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pesapalEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderator_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderator_settings_userId_key" ON "moderator_settings"("userId");

CREATE TABLE IF NOT EXISTS "moderator_payouts" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "moderatorName" TEXT NOT NULL,
    "moderatorEmail" TEXT NOT NULL,
    "pesapalEmail" TEXT NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paymentIds" TEXT[],
    "paymentCount" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidBy" TEXT NOT NULL DEFAULT 'superadmin',
    "weekEnding" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderator_payouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "group_credentials" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "generalNote" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "group_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_credentials_groupId_key" ON "group_credentials"("groupId");

CREATE TABLE IF NOT EXISTS "group_emails" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "recipients" TEXT[],
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "group_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'newsletter',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderName" TEXT NOT NULL DEFAULT '',
    "senderEmail" TEXT NOT NULL DEFAULT '',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "recipients" TEXT[],
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'logged',
    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "footer_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "footer_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "footer_subscribers_email_key" ON "footer_subscribers"("email");

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "groups" ADD CONSTRAINT "groups_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pesapal_orders" ADD CONSTRAINT "pesapal_orders_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_earnings" ADD CONSTRAINT "platform_earnings_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderator_settings" ADD CONSTRAINT "moderator_settings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moderator_payouts" ADD CONSTRAINT "moderator_payouts_moderatorId_fkey"
    FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_credentials" ADD CONSTRAINT "group_credentials_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_emails" ADD CONSTRAINT "group_emails_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default platform settings row
INSERT INTO "platform_settings" ("id", "feePercent") VALUES (1, 8)
    ON CONFLICT ("id") DO NOTHING;
