CREATE TABLE "PaystackOrder" (
    "id"             TEXT NOT NULL,
    "reference"      TEXT NOT NULL,
    "groupId"        TEXT NOT NULL,
    "memberId"       TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "memberName"     TEXT NOT NULL,
    "memberEmail"    TEXT NOT NULL,
    "months"         INTEGER NOT NULL,
    "baseAmount"     DOUBLE PRECISION NOT NULL,
    "platformFee"    DOUBLE PRECISION NOT NULL,
    "moderatorOwed"  DOUBLE PRECISION NOT NULL,
    "organizerGets"  DOUBLE PRECISION NOT NULL,
    "moderatorId"    TEXT NOT NULL,
    "memberPays"     DOUBLE PRECISION NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'USD',
    "paystackStatus" TEXT,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "confirmedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaystackOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaystackOrder_reference_key" ON "PaystackOrder"("reference");
