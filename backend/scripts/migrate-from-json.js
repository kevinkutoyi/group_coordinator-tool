/**
 * One-time migration script: imports data/db.json → PostgreSQL via Prisma.
 * Run ONCE after setting up the database:  node backend/scripts/migrate-from-json.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");
const fs   = require("fs");
const path = require("path");

const prisma   = new PrismaClient();
const DB_FILE  = path.join(__dirname, "../data/db.json");

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.log("No db.json found — nothing to migrate.");
    return;
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  let counts = {};

  // Users
  for (const u of (db.users || [])) {
    await prisma.user.upsert({
      where:  { id: u.id },
      update: {},
      create: { id: u.id, name: u.name, email: u.email, phone: u.phone || "", passwordHash: u.passwordHash, role: u.role || "customer", status: u.status || "active", newsletter: u.newsletter !== false, rejectionNote: u.rejectionNote || null, approvedAt: u.approvedAt ? new Date(u.approvedAt) : null, approvedBy: u.approvedBy || null, createdAt: new Date(u.createdAt || Date.now()) },
    });
  }
  counts.users = (db.users || []).length;

  // Groups
  for (const g of (db.groups || [])) {
    await prisma.group.upsert({
      where:  { id: g.id },
      update: {},
      create: { id: g.id, serviceId: g.serviceId, serviceName: g.serviceName, serviceIcon: g.serviceIcon, planName: g.planName, totalPrice: g.totalPrice, maxSlots: g.maxSlots, pricePerSlot: g.pricePerSlot, platformFee: g.platformFee || 0, memberPays: g.memberPays || g.pricePerSlot, feePercent: g.feePercent || 8, organizerId: g.organizerId, organizerName: g.organizerName, organizerEmail: g.organizerEmail, description: g.description || "", billingCycle: g.billingCycle || "monthly", status: g.status || "open", reviewStatus: g.reviewStatus || "approved", reviewNote: g.reviewNote || "", reviewedAt: g.reviewedAt ? new Date(g.reviewedAt) : null, reviewedBy: g.reviewedBy || null, createdAt: new Date(g.createdAt || Date.now()) },
    });
  }
  counts.groups = (db.groups || []).length;

  // Group Members
  for (const m of (db.groupMembers || [])) {
    await prisma.groupMember.upsert({
      where:  { id: m.id },
      update: {},
      create: { id: m.id, groupId: m.groupId, userId: m.userId, name: m.name, email: m.email, role: m.role || "member", months: m.months || 1, durationLabel: m.durationLabel || "1 Month", discount: m.discount || 0, baseAmount: m.baseAmount || m.memberPays || 0, platformFee: m.platformFee || 0, memberPays: m.memberPays || 0, organizerGets: m.organizerGets || 0, moderatorOwed: m.moderatorOwed || m.organizerGets || 0, paymentStatus: m.paymentStatus || "pending", joinedAt: new Date(m.joinedAt || Date.now()), expiresAt: m.expiresAt ? new Date(m.expiresAt) : null, expiryNotifications: Array.isArray(m.expiryNotifications) ? m.expiryNotifications : [] },
    }).catch(() => {});
  }
  counts.groupMembers = (db.groupMembers || []).length;

  // Payments
  for (const p of (db.payments || [])) {
    await prisma.payment.upsert({
      where:  { id: p.id },
      update: {},
      create: { id: p.id, groupId: p.groupId, memberId: p.memberId, userId: p.userId, memberName: p.memberName, months: p.months || 1, amount: p.amount || 0, platformFee: p.platformFee || 0, moderatorOwed: p.moderatorOwed || p.organizerGets || 0, organizerGets: p.organizerGets || 0, moderatorId: p.moderatorId || null, method: p.method || "pesapal", pesapalOrderId: p.pesapalOrderId || null, payoutStatus: p.payoutStatus || "pending", paidAt: p.paidAt ? new Date(p.paidAt) : null, paidBy: p.paidBy || null, currency: p.currency || "KES", confirmedAt: p.confirmedAt ? new Date(p.confirmedAt) : null },
    }).catch(() => {});
  }
  counts.payments = (db.payments || []).length;

  // Moderator Settings
  for (const s of (db.moderatorSettings || [])) {
    await prisma.moderatorSettings.upsert({
      where:  { userId: s.userId },
      update: {},
      create: { userId: s.userId, pesapalEmail: s.pesapalEmail || s.payoutEmail || "", displayName: s.displayName || "", feePercent: s.feePercent || 8 },
    }).catch(() => {});
  }
  counts.moderatorSettings = (db.moderatorSettings || []).length;

  // Moderator Payouts
  for (const p of (db.moderatorPayouts || [])) {
    await prisma.moderatorPayout.upsert({
      where:  { id: p.id },
      update: {},
      create: { id: p.id, moderatorId: p.moderatorId, moderatorName: p.moderatorName, moderatorEmail: p.moderatorEmail, pesapalEmail: p.pesapalEmail || "", amountPaid: p.amountPaid, currency: p.currency || "KES", paymentIds: p.paymentIds || [], paymentCount: p.paymentCount || 0, notes: p.notes || "", paidAt: new Date(p.paidAt), paidBy: p.paidBy || "superadmin", weekEnding: new Date(p.weekEnding || p.paidAt) },
    }).catch(() => {});
  }
  counts.moderatorPayouts = (db.moderatorPayouts || []).length;

  // Group Credentials
  for (const c of (db.groupCredentials || [])) {
    await prisma.groupCredential.upsert({
      where:  { groupId: c.groupId },
      update: {},
      create: { groupId: c.groupId, slots: c.slots, generalNote: c.generalNote || "", updatedBy: c.updatedBy || null },
    }).catch(() => {});
  }
  counts.groupCredentials = (db.groupCredentials || []).length;

  // Newsletter Campaigns
  for (const c of (db.newsletterSent || [])) {
    await prisma.newsletterCampaign.upsert({
      where:  { id: c.id },
      update: {},
      create: { id: c.id, type: c.type || "newsletter", subject: c.subject, body: c.body || "", senderName: c.senderName || "", senderEmail: c.senderEmail || "", recipientCount: c.recipientCount || 0, recipients: c.recipients || [], sentAt: new Date(c.sentAt || Date.now()), status: c.status || "logged" },
    }).catch(() => {});
  }

  // Footer Subscribers
  for (const s of (db.footerSubscribers || [])) {
    await prisma.footerSubscriber.upsert({
      where:  { email: s.email },
      update: {},
      create: { id: s.id, email: s.email, subscribedAt: new Date(s.subscribedAt || Date.now()) },
    }).catch(() => {});
  }
  counts.footerSubscribers = (db.footerSubscribers || []).length;

  // Platform Settings
  if (db.platformSettings?.feePercent) {
    await prisma.platformSettings.upsert({ where: { id: 1 }, update: { feePercent: db.platformSettings.feePercent }, create: { id: 1, feePercent: db.platformSettings.feePercent } });
  }

  console.log("\n✅ Migration complete:");
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${k}: ${v} records`));
  console.log("\nYou can now delete data/db.json — all data is in PostgreSQL.\n");
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
