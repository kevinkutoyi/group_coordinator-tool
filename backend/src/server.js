require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const rateLimit  = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const pesapal    = require("./pesapal");
const { validateEmail } = require("./emailValidator");
const emailService = require("./emailService");

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3001;
const DEFAULT_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "8");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_in_production";

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: "Too many attempts, please wait 15 minutes." } });

// ── Helpers ───────────────────────────────────────────────────────────────
async function getPlatformFeePercent() {
  try {
    const s = await prisma.platformSettings.findUnique({ where: { id: 1 } });
    return s?.feePercent ?? DEFAULT_FEE_PERCENT;
  } catch { return DEFAULT_FEE_PERCENT; }
}

async function calcFee(amount, months = 1) {
  const feePercent    = await getPlatformFeePercent();
  const memberPays    = +(amount * months).toFixed(2);
  const platformFee   = +(memberPays * feePercent / 100).toFixed(2);
  const moderatorOwed = +(memberPays - platformFee).toFixed(2);
  return { base: memberPays, memberPays, platformFee, moderatorOwed,
           feePercent, organizerGets: moderatorOwed };
}

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || "8h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function safeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ── Auth Middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: e.name === "TokenExpiredError" ? "Token expired" : "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role))
        return res.status(403).json({ error: "Insufficient permissions" });
      next();
    });
  };
}

const requireSuperAdmin = requireRole("superadmin");

// ── Services Catalogue ────────────────────────────────────────────────────
const SERVICES = [
  { id: "spotify",  name: "Spotify",         icon: "🎵",
    plans: [{ name: "Premium Duo", price: 16.99, maxSlots: 2 },
            { name: "Premium Family", price: 17.99, maxSlots: 6 }] },
  { id: "netflix",  name: "Netflix",          icon: "🎬",
    plans: [{ name: "Standard", price: 15.49, maxSlots: 2 },
            { name: "Premium",  price: 22.99, maxSlots: 4 }] },
  { id: "chatgpt",  name: "ChatGPT Plus",     icon: "🤖",
    plans: [{ name: "Family Plan", price: 30.00, maxSlots: 5 }] },
  { id: "claude",   name: "Claude AI",        icon: "✨",
    plans: [{ name: "Claude Max 5x", price: 100.00, maxSlots: 5 }] },
  { id: "youtube",  name: "YouTube Premium",  icon: "▶️",
    plans: [{ name: "Family Plan", price: 22.99, maxSlots: 6 }] },
  { id: "apple",    name: "Apple One",        icon: "🍎",
    plans: [{ name: "Family", price: 25.95, maxSlots: 6 }] },
  { id: "disney",   name: "Disney+",          icon: "🏰",
    plans: [{ name: "Standard", price: 7.99, maxSlots: 4 },
            { name: "Premium",  price: 13.99, maxSlots: 4 }] },
  { id: "hbo",      name: "Max (HBO)",        icon: "👑",
    plans: [{ name: "Ultimate", price: 20.99, maxSlots: 4 }] },
];

const SUBSCRIPTION_DURATIONS = [
  { months: 1,  label: "1 Month",   discount: 0 },
  { months: 3,  label: "3 Months",  discount: 5 },
  { months: 6,  label: "6 Months",  discount: 10 },
  { months: 12, label: "12 Months", discount: 15 },
];

const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };

// ═══════════════════════════════════════════════════════════════════════════
//  USER AUTH
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role = "customer", phone = "", newsletter = true } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email and password are required" });
    if (!["customer", "moderator"].includes(role))
      return res.status(400).json({ error: "role must be customer or moderator" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const emailCheck = await validateEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(), email: email.toLowerCase().trim(), phone: phone.trim(),
        passwordHash, role, status: role === "moderator" ? "pending" : "active",
        newsletter: newsletter !== false,
      },
    });

    if (role === "moderator") {
      return res.status(201).json({
        message: "Moderator account created. Awaiting super-admin approval before you can create groups.",
        user: safeUser(user),
      });
    }
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status === "pending")
      return res.status(403).json({ error: "Your moderator account is pending approval by the administrator." });
    if (user.status === "suspended")
      return res.status(403).json({ error: "Your account has been suspended. Contact support." });

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: safeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(safeUser(user));
});

app.post("/api/auth/refresh", requireAuth, (req, res) => {
  res.json({ token: signToken({ id: req.user.id, role: req.user.role, name: req.user.name }) });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/admin/login", authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (username !== (process.env.ADMIN_USERNAME || "superadmin") ||
      password !== (process.env.ADMIN_PASSWORD || "admin"))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h");
  res.json({ token, role: "superadmin" });
});

app.get("/api/admin/refresh", requireSuperAdmin, (req, res) => {
  res.json({ token: signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h") });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
  const { role, status } = req.query;
  const where = {};
  if (role)   where.role   = role;
  if (status) where.status = status;
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(users.map(safeUser));
});

app.get("/api/admin/moderators/pending", requireSuperAdmin, async (req, res) => {
  const users = await prisma.user.findMany({ where: { role: "moderator", status: "pending" }, orderBy: { createdAt: "desc" } });
  res.json(users.map(safeUser));
});

app.patch("/api/admin/users/:id/approve", requireSuperAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "moderator") return res.status(400).json({ error: "Only moderators need approval" });
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { status: "active", approvedAt: new Date(), approvedBy: "superadmin" } });
  res.json(safeUser(updated));
});

app.patch("/api/admin/users/:id/reject", requireSuperAdmin, async (req, res) => {
  const { reason = "" } = req.body;
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { status: "suspended", rejectionNote: reason } });
  res.json(safeUser(updated));
});

app.patch("/api/admin/users/:id/suspend", requireSuperAdmin, async (req, res) => {
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { status: "suspended" } });
  res.json(safeUser(updated));
});

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICES & DURATIONS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/services",  (req, res) => res.json(SERVICES));
app.get("/api/durations", (req, res) => res.json(SUBSCRIPTION_DURATIONS));

// ═══════════════════════════════════════════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/groups", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest", viewerId = null;
  try { const d = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET); viewerRole = d.role; viewerId = d.id; } catch {}

  const where = viewerRole === "superadmin" ? {}
    : viewerRole === "moderator" && viewerId ? { OR: [{ reviewStatus: "approved" }, { organizerId: viewerId }] }
    : { reviewStatus: "approved" };

  const groups = await prisma.group.findMany({ where, include: { members: true, payments: true }, orderBy: { createdAt: "desc" } });
  res.json(groups.map(g => ({
    ...g,
    memberCount: g.members.filter(m => m.role !== "organizer").length,
    members: g.members.map(({ email, ...m }) => m),
  })));
});

app.get("/api/groups/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest", viewerId = null;
  try { const d = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET); viewerRole = d.role; viewerId = d.id; } catch {}

  const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { members: true, payments: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isApproved   = group.reviewStatus === "approved";
  const isSuperAdmin = viewerRole === "superadmin";
  const isOwner      = viewerRole === "moderator" && viewerId === group.organizerId;
  if (!isApproved && !isSuperAdmin && !isOwner)
    return res.status(404).json({ error: "Group not found" });

  res.json(group);
});

app.post("/api/groups", requireRole("moderator", "superadmin"), async (req, res) => {
  const { serviceId, planName, totalPrice, maxSlots, description, billingCycle = "monthly" } = req.body;
  if (!serviceId || !planName || !totalPrice || !maxSlots)
    return res.status(400).json({ error: "serviceId, planName, totalPrice, maxSlots required" });

  const isSuperAdmin = req.user.role === "superadmin";
  let creatorName, creatorEmail;

  if (isSuperAdmin) {
    creatorName  = process.env.ADMIN_USERNAME || "Super Admin";
    creatorEmail = process.env.ADMIN_EMAIL    || "admin@splitpass.com";
  } else {
    const creator = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!creator) return res.status(404).json({ error: "User not found" });
    if (creator.status !== "active") return res.status(403).json({ error: "Your account is not yet approved to create groups" });
    creatorName  = creator.name;
    creatorEmail = creator.email;
  }

  const service = SERVICES.find(s => s.id === serviceId);
  if (!service) return res.status(404).json({ error: "Service not found" });

  const pricePerSlot = +(totalPrice / maxSlots).toFixed(2);
  const fees = await calcFee(pricePerSlot, 1);

  const group = await prisma.group.create({
    data: {
      serviceId, serviceName: service.name, serviceIcon: service.icon, planName,
      totalPrice: +totalPrice, maxSlots: +maxSlots, pricePerSlot,
      platformFee: fees.platformFee, memberPays: fees.memberPays, feePercent: fees.feePercent,
      organizerId: req.user.id, organizerName: creatorName, organizerEmail: creatorEmail,
      description: description || "", billingCycle,
      status:       isSuperAdmin ? "open"     : "pending_review",
      reviewStatus: isSuperAdmin ? "approved" : "pending",
    },
  });
  res.status(201).json(group);
});

app.patch("/api/groups/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin")
    return res.status(403).json({ error: "Forbidden" });
  res.json(await prisma.group.update({ where: { id: req.params.id }, data: { status } }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/groups/:id/join", requireRole("customer", "superadmin"), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open") return res.status(400).json({ error: "Group is not accepting new members" });

  const fixedMonths   = CYCLE_MONTHS[group.billingCycle] || 1;
  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === fixedMonths) || SUBSCRIPTION_DURATIONS[0];
  const payingMembers = group.members.filter(m => m.role !== "organizer");

  if (payingMembers.length >= group.maxSlots) return res.status(400).json({ error: "Group is full" });
  if (group.members.find(m => m.userId === req.user.id)) return res.status(400).json({ error: "You are already a member of this group" });
  if (group.organizerId === req.user.id) return res.status(400).json({ error: "You are the organizer of this group and do not pay for a slot" });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const fees   = await calcFee(group.pricePerSlot, fixedMonths);
  const member = await prisma.groupMember.create({
    data: {
      groupId: group.id, userId: req.user.id, name: user.name, email: user.email,
      role: "member", months: fixedMonths, durationLabel: validDuration.label,
      discount: validDuration.discount, baseAmount: fees.base,
      platformFee: fees.platformFee, memberPays: fees.memberPays,
      organizerGets: fees.organizerGets, moderatorOwed: fees.moderatorOwed,
    },
  });

  if (payingMembers.length + 1 >= group.maxSlots)
    await prisma.group.update({ where: { id: group.id }, data: { status: "full" } });

  res.status(201).json(member);
});

// ═══════════════════════════════════════════════════════════════════════════
//  PESAPAL PAYMENT
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/pesapal/initiate", requireRole("customer", "superadmin"), async (req, res) => {
  const { groupId, memberId, currency = "KES" } = req.body;
  if (!groupId || !memberId) return res.status(400).json({ error: "groupId and memberId required" });

  const [group, member] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.groupMember.findFirst({ where: { id: memberId, userId: req.user.id } }),
  ]);
  if (!group)  return res.status(404).json({ error: "Group not found" });
  if (!member) return res.status(404).json({ error: "Membership not found" });
  if (member.paymentStatus === "confirmed") return res.status(400).json({ error: "Already paid" });

  // Both amounts derived from same canonical KES value for currency parity
  const KES_PER_USD      = parseFloat(process.env.KES_PER_USD || "130");
  const kesAmount        = Math.round(member.memberPays * KES_PER_USD);
  const usdAmount        = +(kesAmount / KES_PER_USD).toFixed(2);
  const amountForPesapal = currency === "KES" ? kesAmount : usdAmount;

  const orderId     = `SP-${Date.now()}-${uuidv4().slice(0,8).toUpperCase()}`;
  const callbackUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-callback?orderId=${orderId}&groupId=${groupId}&memberId=${memberId}`;

  try {
    const nameParts = member.name.split(" ");
    const { redirectUrl, orderTrackingId } = await pesapal.submitOrder({
      orderId, amount: amountForPesapal, currency,
      description: `SplitPass: ${group.serviceName} ${group.planName} × ${member.months}mo — ${member.name}`,
      firstName: nameParts[0], lastName: nameParts.slice(1).join(" ") || "",
      email: member.email, phone: "", callbackUrl,
    });

    await prisma.pesapalOrder.create({
      data: {
        id: orderId, orderTrackingId, groupId, memberId,
        userId: req.user.id, memberName: member.name, memberEmail: member.email,
        months: member.months, baseAmount: member.baseAmount,
        platformFee: member.platformFee, moderatorOwed: member.moderatorOwed,
        organizerGets: member.moderatorOwed, moderatorId: group.organizerId,
        memberPays: member.memberPays, chargedAmount: amountForPesapal, currency,
      },
    });

    res.json({ redirectUrl, orderId, memberPays: member.memberPays, chargedAmount: amountForPesapal, currency, platformFee: member.platformFee });
  } catch (err) {
    console.error("PesaPal initiate:", err.message);
    res.status(502).json({ error: `Payment gateway error: ${err.message}` });
  }
});

// Shared order-confirmation logic (used by both verify + IPN)
async function confirmOrder(orderId) {
  const order = await prisma.pesapalOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status === "COMPLETED") return order;

  const statusData = await pesapal.getTransactionStatus(order.orderTrackingId);
  const code       = statusData.payment_status_description;

  await prisma.pesapalOrder.update({ where: { id: orderId }, data: { pesapalStatus: code } });

  if (code === "Completed") {
    const confirmedAt = new Date();
    const exp = new Date(); exp.setMonth(exp.getMonth() + (order.months || 1));

    await prisma.groupMember.update({ where: { id: order.memberId }, data: { paymentStatus: "confirmed", expiresAt: exp } });

    const alreadyRecorded = await prisma.payment.findFirst({ where: { pesapalOrderId: orderId } });
    if (!alreadyRecorded) {
      await prisma.payment.create({
        data: {
          groupId: order.groupId, memberId: order.memberId, userId: order.userId,
          memberName: order.memberName, months: order.months, amount: order.memberPays,
          platformFee: order.platformFee, moderatorOwed: order.moderatorOwed,
          organizerGets: order.moderatorOwed, moderatorId: order.moderatorId,
          method: "pesapal", pesapalOrderId: orderId, currency: order.currency,
          confirmedAt, payoutStatus: "pending",
        },
      });
      await prisma.platformEarning.create({
        data: { orderId, groupId: order.groupId, fee: order.platformFee, currency: order.currency, earnedAt: confirmedAt },
      });

      // Emails
      const [grp, mem] = await Promise.all([
        prisma.group.findUnique({ where: { id: order.groupId } }),
        prisma.groupMember.findUnique({ where: { id: order.memberId } }),
      ]);
      if (grp && mem) {
        const creds = await prisma.groupCredential.findUnique({ where: { groupId: grp.id } });
        if (creds) emailService.sendCredentialsUpdated({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName }).catch(() => {});
        emailService.sendWelcome({ to: mem.email, memberName: mem.name, groupName: `${grp.serviceName} ${grp.planName}`, serviceName: grp.serviceName, planName: grp.planName, billingCycle: grp.billingCycle, pricePerSlot: grp.pricePerSlot, memberPays: order.memberPays, currency: order.currency, expiresAt: mem.expiresAt, organizerName: grp.organizerName }).catch(() => {});
      }
    }

    const confirmedCount = await prisma.groupMember.count({ where: { groupId: order.groupId, paymentStatus: "confirmed", role: { not: "organizer" } } });
    const grp2 = await prisma.group.findUnique({ where: { id: order.groupId } });
    if (grp2 && confirmedCount >= grp2.maxSlots)
      await prisma.group.update({ where: { id: order.groupId }, data: { status: "full" } });

    await prisma.pesapalOrder.update({ where: { id: orderId }, data: { status: "COMPLETED", confirmedAt } });
  } else if (["Failed", "Invalid"].includes(code)) {
    await prisma.pesapalOrder.update({ where: { id: orderId }, data: { status: "FAILED" } });
  }

  return prisma.pesapalOrder.findUnique({ where: { id: orderId } });
}

app.get("/api/pesapal/verify", async (req, res) => {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });
  const order = await prisma.pesapalOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "COMPLETED")
    return res.json({ status: "COMPLETED", memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets, pesapalStatus: "Completed" });
  try {
    const updated = await confirmOrder(orderId);
    res.json({ status: updated.status, memberPays: updated.memberPays, platformFee: updated.platformFee, organizerGets: updated.organizerGets, pesapalStatus: updated.pesapalStatus });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.post("/api/pesapal/ipn", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.body;
  res.sendStatus(200);
  if (!OrderTrackingId || !OrderMerchantReference) return;
  try {
    const order = await prisma.pesapalOrder.findUnique({ where: { id: OrderMerchantReference } });
    if (!order || order.status === "COMPLETED") return;
    await prisma.pesapalOrder.update({ where: { id: OrderMerchantReference }, data: { orderTrackingId: OrderTrackingId } });
    await confirmOrder(OrderMerchantReference);
  } catch (err) { console.error("IPN error:", err.message); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — EARNINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/earnings", requireSuperAdmin, async (req, res) => {
  const feePercent  = await getPlatformFeePercent();
  const allEarnings = await prisma.platformEarning.findMany({ orderBy: { earnedAt: "asc" } });
  const total       = allEarnings.reduce((a, e) => a + e.fee, 0);
  const now         = new Date();

  const monthlyEarnings = Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const tot = allEarnings.filter(e => { const ed = new Date(e.earnedAt); return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth(); }).reduce((a, e) => a + e.fee, 0);
    return { label: d.toLocaleString("default", { month: "short", year: "2-digit" }), total: +tot.toFixed(2) };
  });

  const groups = await prisma.group.findMany();
  const byGroup = groups.map(g => ({
    groupId: g.id, serviceName: g.serviceName, planName: g.planName,
    fees: +allEarnings.filter(e => e.groupId === g.id).reduce((a, e) => a + e.fee, 0).toFixed(2),
  })).filter(g => g.fees > 0);

  const [pendingOrders, completedOrders, totalGroups, totalUsers, totalCustomers, pendingModerators, pendingPayments] = await Promise.all([
    prisma.pesapalOrder.count({ where: { status: "PENDING" } }),
    prisma.pesapalOrder.count({ where: { status: "COMPLETED" } }),
    prisma.group.count(), prisma.user.count(),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "moderator", status: "pending" } }),
    prisma.payment.findMany({ where: { payoutStatus: "pending" } }),
  ]);

  res.json({
    totalEarned: +total.toFixed(2), feePercent,
    totalPendingPayouts: +pendingPayments.reduce((a, p) => a + p.moderatorOwed, 0).toFixed(2),
    earningsCount: allEarnings.length, pendingOrders, completedOrders,
    totalGroups, totalUsers, totalCustomers, pendingModerators,
    byGroup, monthlyEarnings, recentEarnings: allEarnings.slice(-20).reverse(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — PLATFORM FEE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/settings", requireSuperAdmin, async (req, res) => {
  res.json({ feePercent: await getPlatformFeePercent() });
});

app.put("/api/admin/settings/fee", requireSuperAdmin, async (req, res) => {
  const { feePercent } = req.body;
  if (feePercent == null || feePercent < 1 || feePercent > 50)
    return res.status(400).json({ error: "feePercent must be between 1 and 50" });
  await prisma.platformSettings.upsert({ where: { id: 1 }, update: { feePercent: +feePercent }, create: { id: 1, feePercent: +feePercent } });
  res.json({ feePercent: +feePercent, message: "Platform fee updated." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — SUNDAY PAYOUT QUEUE
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/payout-queue", requireSuperAdmin, async (req, res) => {
  const pendingPayments = await prisma.payment.findMany({ where: { payoutStatus: "pending" } });
  const byMod = {};
  for (const p of pendingPayments) {
    if (!p.moderatorId) continue;
    if (!byMod[p.moderatorId]) {
      const [modUser, modSettings] = await Promise.all([
        prisma.user.findUnique({ where: { id: p.moderatorId } }),
        prisma.moderatorSettings.findUnique({ where: { userId: p.moderatorId } }),
      ]);
      byMod[p.moderatorId] = {
        moderatorId: p.moderatorId, moderatorName: modUser?.name || "Unknown",
        moderatorEmail: modUser?.email || "", pesapalEmail: modSettings?.pesapalEmail || modUser?.email || "",
        currency: p.currency || "KES", amountOwed: 0, paymentCount: 0, payments: [],
      };
    }
    byMod[p.moderatorId].amountOwed   = +(byMod[p.moderatorId].amountOwed + p.moderatorOwed).toFixed(2);
    byMod[p.moderatorId].paymentCount += 1;
    byMod[p.moderatorId].payments.push({ id: p.id, memberName: p.memberName, amount: p.amount, moderatorOwed: p.moderatorOwed, platformFee: p.platformFee, confirmedAt: p.confirmedAt, currency: p.currency });
  }
  const payoutHistory = await prisma.moderatorPayout.findMany({ orderBy: { paidAt: "desc" }, take: 50 });
  res.json({ queue: Object.values(byMod).sort((a, b) => b.amountOwed - a.amountOwed), totalOwed: +Object.values(byMod).reduce((a, m) => a + m.amountOwed, 0).toFixed(2), payoutHistory });
});

app.post("/api/admin/payouts/mark-paid", requireSuperAdmin, async (req, res) => {
  const { moderatorId, notes = "" } = req.body;
  if (!moderatorId) return res.status(400).json({ error: "moderatorId required" });

  const pending = await prisma.payment.findMany({ where: { moderatorId, payoutStatus: "pending" } });
  if (!pending.length) return res.status(400).json({ error: "No pending payments for this moderator" });

  const totalPaid = pending.reduce((a, p) => a + p.moderatorOwed, 0);
  const [modUser, modSettings] = await Promise.all([
    prisma.user.findUnique({ where: { id: moderatorId } }),
    prisma.moderatorSettings.findUnique({ where: { userId: moderatorId } }),
  ]);
  const now = new Date();

  await prisma.payment.updateMany({ where: { moderatorId, payoutStatus: "pending" }, data: { payoutStatus: "paid", paidAt: now, paidBy: "superadmin" } });

  const payoutRecord = await prisma.moderatorPayout.create({
    data: {
      moderatorId, moderatorName: modUser?.name || "Unknown",
      moderatorEmail: modUser?.email || "", pesapalEmail: modSettings?.pesapalEmail || modUser?.email || "",
      amountPaid: +totalPaid.toFixed(2), currency: pending[0]?.currency || "KES",
      paymentIds: pending.map(p => p.id), paymentCount: pending.length,
      notes, paidAt: now, weekEnding: now,
    },
  });
  res.json({ success: true, payout: payoutRecord });
});

app.get("/api/admin/payouts/history", requireSuperAdmin, async (req, res) => {
  res.json(await prisma.moderatorPayout.findMany({ orderBy: { paidAt: "desc" } }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  MODERATOR SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/moderator/settings", requireRole("moderator"), async (req, res) => {
  const settings = await prisma.moderatorSettings.findUnique({ where: { userId: req.user.id } });
  if (!settings) return res.json({ configured: false });
  res.json({ ...settings, configured: true });
});

app.put("/api/moderator/settings", requireRole("moderator"), async (req, res) => {
  const { pesapalEmail, displayName } = req.body;
  if (!pesapalEmail) return res.status(400).json({ error: "pesapalEmail is required so we can send your weekly payout" });
  const feePercent = await getPlatformFeePercent();
  const settings = await prisma.moderatorSettings.upsert({
    where:  { userId: req.user.id },
    update: { pesapalEmail: pesapalEmail.trim().toLowerCase(), displayName: displayName || "", feePercent },
    create: { userId: req.user.id, pesapalEmail: pesapalEmail.trim().toLowerCase(), displayName: displayName || "", feePercent },
  });
  res.json({ ...settings, configured: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MODERATOR DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/moderator/dashboard", requireRole("moderator"), async (req, res) => {
  const uid        = req.user.id;
  const feePercent = await getPlatformFeePercent();
  const [myGroups, settings, payoutHistory] = await Promise.all([
    prisma.group.findMany({ where: { organizerId: uid }, include: { members: true, payments: true } }),
    prisma.moderatorSettings.findUnique({ where: { userId: uid } }),
    prisma.moderatorPayout.findMany({ where: { moderatorId: uid }, orderBy: { paidAt: "desc" }, take: 10 }),
  ]);

  const groupStats = myGroups.map(g => {
    const confirmed      = g.members.filter(m => m.paymentStatus === "confirmed" && m.role !== "organizer").length;
    const totalCollected = g.payments.reduce((a, p) => a + p.amount, 0);
    const platformFees   = g.payments.reduce((a, p) => a + p.platformFee, 0);
    const modOwed        = g.payments.reduce((a, p) => a + p.moderatorOwed, 0);
    const modPaid        = g.payments.filter(p => p.payoutStatus === "paid").reduce((a, p) => a + p.moderatorOwed, 0);
    const modPending     = g.payments.filter(p => p.payoutStatus === "pending").reduce((a, p) => a + p.moderatorOwed, 0);
    return { id: g.id, serviceName: g.serviceName, serviceIcon: g.serviceIcon, planName: g.planName, status: g.status, reviewStatus: g.reviewStatus, billingCycle: g.billingCycle, maxSlots: g.maxSlots, confirmedMembers: confirmed, totalSlots: g.maxSlots, totalCollected: +totalCollected.toFixed(2), platformFees: +platformFees.toFixed(2), modOwed: +modOwed.toFixed(2), modPaid: +modPaid.toFixed(2), modPending: +modPending.toFixed(2), createdAt: g.createdAt };
  });

  res.json({
    groups: groupStats,
    payoutHistory,
    summary: {
      totalGroups: myGroups.length,
      activeGroups: myGroups.filter(g => g.status === "open" || g.status === "full").length,
      pendingReview: myGroups.filter(g => g.reviewStatus === "pending").length,
      totalMembers:   groupStats.reduce((a, g) => a + g.confirmedMembers, 0),
      totalCollected: +groupStats.reduce((a, g) => a + g.totalCollected, 0).toFixed(2),
      totalOwed:      +groupStats.reduce((a, g) => a + g.modOwed, 0).toFixed(2),
      totalPaid:      +groupStats.reduce((a, g) => a + g.modPaid, 0).toFixed(2),
      totalPending:   +groupStats.reduce((a, g) => a + g.modPending, 0).toFixed(2),
      feePercent, pesapalEmail: settings?.pesapalEmail || "", configured: !!settings,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — GROUP REVIEW
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/groups/pending", requireSuperAdmin, async (req, res) => {
  const groups = await prisma.group.findMany({ where: { reviewStatus: "pending" }, include: { organizer: true }, orderBy: { createdAt: "desc" } });
  res.json(groups.map(g => ({ ...g, organizerDetails: g.organizer ? { name: g.organizer.name, email: g.organizer.email, phone: g.organizer.phone } : null })));
});

app.patch("/api/admin/groups/:id/review", requireSuperAdmin, async (req, res) => {
  const { decision, note = "" } = req.body;
  if (!["approved", "rejected"].includes(decision))
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { organizer: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });

  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: { reviewStatus: decision, reviewNote: note, reviewedAt: new Date(), reviewedBy: "superadmin", status: decision === "approved" ? "open" : "closed" },
  });
  if (group.organizer) {
    const subject = decision === "approved" ? `✅ Your group "${group.serviceName} ${group.planName}" is now live!` : `❌ Your group "${group.serviceName} ${group.planName}" was not approved`;
    const html    = decision === "approved"
      ? `<p>Hi ${group.organizer.name},<br/><br/>Your group has been approved and is now live on SplitPass.<br/><br/>— SplitPass Team</p>`
      : `<p>Hi ${group.organizer.name},<br/><br/>Your group was not approved.<br/><br/><b>Reason:</b> ${note || "Not specified"}<br/><br/>You may revise and resubmit.<br/><br/>— SplitPass Team</p>`;
    emailService.sendEmail({ to: group.organizer.email, subject, html }).catch(() => {});
  }
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — EMAIL ORGANIZERS
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/admin/email-organizers", requireSuperAdmin, async (req, res) => {
  const { subject, body: msgBody, senderEmail, targetIds } = req.body;
  if (!subject || !msgBody) return res.status(400).json({ error: "subject and body required" });
  const where = { role: "moderator", status: "active" };
  if (Array.isArray(targetIds) && targetIds.length > 0) where.id = { in: targetIds };
  const targets = await prisma.user.findMany({ where });
  if (!targets.length) return res.status(400).json({ error: "No active organizers to email" });
  const from = senderEmail || process.env.ADMIN_EMAIL || "admin@splitpass.com";
  let sent = 0, failed = 0;
  await Promise.allSettled(targets.map(async u => { try { await emailService.sendGroupMessage({ to: u.email, memberName: u.name, groupName: "SplitPass Platform", serviceName: "SplitPass", senderName: "SplitPass Admin", senderEmail: from, subject, messageBody: msgBody }); sent++; } catch { failed++; } }));
  await prisma.newsletterCampaign.create({ data: { type: "organizer-email", subject, body: msgBody, senderEmail: from, recipientCount: sent, recipients: targets.map(u => u.email), status: "sent" } });
  res.json({ message: `Email sent to ${sent} organizer${sent !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed.` : ""}`, sent, failed, note: process.env.EMAIL_ENABLED !== "true" ? "Set EMAIL_ENABLED=true to deliver real emails." : undefined });
});

app.get("/api/admin/organizer-email-history", requireSuperAdmin, async (req, res) => {
  res.json(await prisma.newsletterCampaign.findMany({ where: { type: "organizer-email" }, orderBy: { sentAt: "desc" } }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  NEWSLETTER
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/newsletter/subscribers", requireSuperAdmin, async (req, res) => {
  const [users, footerSubs] = await Promise.all([prisma.user.findMany({ where: { newsletter: true } }), prisma.footerSubscriber.findMany()]);
  res.json({ subscribers: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, joinedAt: u.createdAt })), footerSubs, total: users.length + footerSubs.length });
});

app.post("/api/newsletter/subscribe", async (req, res) => {
  const { email } = req.body;
  const emailCheck = await validateEmail(email);
  if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });
  const [foSub, userSub] = await Promise.all([
    prisma.footerSubscriber.findUnique({ where: { email: email.toLowerCase().trim() } }),
    prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), newsletter: true } }),
  ]);
  if (foSub || userSub) return res.json({ message: "Already subscribed!" });
  await prisma.footerSubscriber.create({ data: { email: email.toLowerCase().trim() } });
  res.json({ message: "Subscribed successfully!" });
});

app.post("/api/admin/newsletter/send", requireSuperAdmin, async (req, res) => {
  const { subject, body, senderName, senderEmail } = req.body;
  if (!subject || !body) return res.status(400).json({ error: "subject and body required" });
  const [users, footerSubs] = await Promise.all([prisma.user.findMany({ where: { newsletter: true } }), prisma.footerSubscriber.findMany()]);
  const recipients = [...new Set([...users.map(u => u.email), ...footerSubs.map(s => s.email)])];
  const campaign = await prisma.newsletterCampaign.create({ data: { type: "newsletter", subject, body, senderName: senderName || process.env.ADMIN_USERNAME || "SplitPass Team", senderEmail: senderEmail || process.env.ADMIN_EMAIL || "newsletter@splitpass.com", recipientCount: recipients.length, recipients, status: "logged" } });
  res.json({ message: `Newsletter logged. ${recipients.length} recipient(s) queued.`, campaignId: campaign.id, recipientCount: recipients.length });
});

app.get("/api/admin/newsletter/history", requireSuperAdmin, async (req, res) => {
  res.json(await prisma.newsletterCampaign.findMany({ orderBy: { sentAt: "desc" } }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  CREDENTIAL VAULT
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/groups/:id/credentials", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const isOrganizer = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";
  const membership   = await prisma.groupMember.findFirst({ where: { groupId: group.id, userId: req.user.id, role: { not: "organizer" } } });
  if (!isOrganizer && !isSuperAdmin && !isModerator && membership?.paymentStatus !== "confirmed")
    return res.status(403).json({ error: "Access denied. Complete payment to view credentials.", requiresPayment: true });
  const creds = await prisma.groupCredential.findUnique({ where: { groupId: req.params.id } });
  if (!creds) return res.json({ exists: false, slots: [] });
  res.json({ exists: true, ...creds, canEdit: isOrganizer || isSuperAdmin || isModerator });
});

app.put("/api/groups/:id/credentials", requireAuth, async (req, res) => {
  const { slots = [], generalNote = "" } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const isOrganizer = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";
  if (!isOrganizer && !isSuperAdmin && !isModerator) return res.status(403).json({ error: "Forbidden" });
  if (!Array.isArray(slots) || !slots.length) return res.status(400).json({ error: "At least one credential slot is required" });

  const isUpdate  = !!(await prisma.groupCredential.findUnique({ where: { groupId: group.id } }));
  const slotData  = slots.map((s, i) => ({ slotNumber: i + 1, label: s.label || `Slot ${i + 1}`, username: s.username || "", password: s.password || "", note: s.note || "" }));
  const credRecord = await prisma.groupCredential.upsert({ where: { groupId: group.id }, update: { slots: slotData, generalNote, updatedBy: req.user.id }, create: { groupId: group.id, slots: slotData, generalNote, updatedBy: req.user.id } });

  if (isUpdate) {
    const members = await prisma.groupMember.findMany({ where: { groupId: group.id, role: { not: "organizer" }, paymentStatus: "confirmed" } });
    members.forEach(m => emailService.sendCredentialsUpdated({ to: m.email, memberName: m.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName }).catch(() => {}));
  }
  res.json({ message: isUpdate ? "Credentials updated." : "Credentials saved.", ...credRecord });
});

app.delete("/api/groups/:id/credentials", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const isOrganizer = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";
  if (!isOrganizer && !isSuperAdmin && !isModerator) return res.status(403).json({ error: "Forbidden" });
  await prisma.groupCredential.deleteMany({ where: { groupId: group.id } });
  res.json({ message: "Credentials cleared." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP EMAILS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/groups/:id/emails", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  res.json(await prisma.groupEmail.findMany({ where: { groupId: req.params.id }, orderBy: { sentAt: "desc" } }));
});

app.post("/api/groups/:id/emails/send", requireAuth, async (req, res) => {
  const { subject, body: msgBody, senderEmail } = req.body;
  if (!subject || !msgBody) return res.status(400).json({ error: "subject and body required" });
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const members = await prisma.groupMember.findMany({ where: { groupId: group.id, role: { not: "organizer" }, paymentStatus: "confirmed" } });
  if (!members.length) return res.status(400).json({ error: "No confirmed paying members to message yet." });

  const isSuperAdmin = req.user.role === "superadmin" && group.organizerId !== req.user.id;
  const senderName   = isSuperAdmin ? (process.env.ADMIN_USERNAME || "Super Admin") : group.organizerName;
  const fromEmail    = senderEmail || (isSuperAdmin ? process.env.ADMIN_EMAIL : group.organizerEmail) || "noreply@splitpass.com";

  const campaign = await prisma.groupEmail.create({ data: { groupId: group.id, groupName: `${group.serviceName} ${group.planName}`, subject, body: msgBody, senderName, senderEmail: fromEmail, recipientCount: members.length, recipients: members.map(m => m.email), sentBy: req.user.id, status: "sending" } });
  let sent = 0, failed = 0;
  await Promise.allSettled(members.map(async m => { try { await emailService.sendGroupMessage({ to: m.email, memberName: m.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName, senderName, senderEmail: fromEmail, subject, messageBody: msgBody }); sent++; } catch { failed++; } }));
  await prisma.groupEmail.update({ where: { id: campaign.id }, data: { status: failed === members.length ? "failed" : "sent", sent, failed } });
  res.json({ message: `Email sent to ${sent} member${sent !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed.` : ""}`, sent, failed, campaignId: campaign.id });
});

app.post("/api/groups/:id/emails/expiry-reminder", requireAuth, async (req, res) => {
  const { memberId, daysThreshold = 7 } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const now    = new Date();
  const thresh = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
  const where  = { groupId: group.id, role: { not: "organizer" }, paymentStatus: "confirmed", expiresAt: { not: null } };
  if (memberId) where.id = memberId; else where.expiresAt = { lte: thresh };
  const targets = await prisma.groupMember.findMany({ where });
  if (!targets.length) return res.json({ message: "No members match the expiry criteria.", sent: 0 });
  let sent = 0;
  await Promise.allSettled(targets.map(async m => {
    const daysLeft = Math.max(0, Math.ceil((new Date(m.expiresAt) - now) / (1000 * 60 * 60 * 24)));
    try { if (daysLeft <= 0) { await emailService.sendExpiryToday({ to: m.email, memberName: m.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName, renewUrl: process.env.FRONTEND_URL, currency: "KES", memberPays: group.memberPays }); } else { await emailService.sendExpiryWarning({ to: m.email, memberName: m.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName, expiresAt: m.expiresAt, renewUrl: process.env.FRONTEND_URL, daysLeft, currency: "KES", memberPays: group.memberPays }); } sent++; } catch {}
  }));
  res.json({ message: `Expiry reminder sent to ${sent} member${sent !== 1 ? "s" : ""}.`, sent });
});

app.get("/api/groups/:id/members", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const members = await prisma.groupMember.findMany({ where: { groupId: group.id, role: { not: "organizer" } } });
  const now = new Date();
  res.json(members.map(m => ({ ...m, daysLeft: m.expiresAt ? Math.ceil((new Date(m.expiresAt) - now) / (1000 * 60 * 60 * 24)) : null })));
});

app.post("/api/admin/expiry-scheduler", requireSuperAdmin, async (req, res) => {
  try { await emailService.runExpiryScheduler(prisma); res.json({ message: "Expiry scheduler completed." }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CURRENCY & PUBLIC STATS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/currency/rate", (req, res) => {
  const rate = parseFloat(process.env.KES_PER_USD || "130");
  res.json({ KES_PER_USD: rate, USD_PER_KES: +(1 / rate).toFixed(6), source: "env" });
});

app.get("/api/stats", async (req, res) => {
  const [openGroups, fullGroups, totalMembers, totalOrganizers, groups] = await Promise.all([
    prisma.group.count({ where: { status: "open" } }),
    prisma.group.count({ where: { status: "full" } }),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "moderator", status: "active" } }),
    prisma.group.findMany({ include: { members: true } }),
  ]);
  const totalSaved = groups.reduce((acc, g) => acc + (g.members.length > 0 ? (g.totalPrice - g.pricePerSlot) * g.members.length : 0), 0);
  res.json({ openGroups, fullGroups, totalMembers, totalOrganizers, totalSaved: +totalSaved.toFixed(2) });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  const fee = await getPlatformFeePercent();
  console.log(`\n🚀 SplitPass API  →  http://localhost:${PORT}`);
  console.log(`🗄️  Database      →  PostgreSQL (Prisma)`);
  console.log(`💰 Platform fee   →  ${fee}%`);
  console.log(`🌍 PesaPal env    →  ${process.env.PESAPAL_ENV || "sandbox"}`);
  console.log(`📧 Email enabled  →  ${process.env.EMAIL_ENABLED === "true" ? "YES" : "NO (stub mode)"}\n`);
  try { await pesapal.registerIPN(); } catch (e) { console.warn("⚠️  IPN pre-reg skipped:", e.message); }
  async function runScheduler() { try { await emailService.runExpiryScheduler(prisma); } catch (e) { console.error("Scheduler error:", e.message); } }
  runScheduler();
  setInterval(runScheduler, 24 * 60 * 60 * 1000);
});
