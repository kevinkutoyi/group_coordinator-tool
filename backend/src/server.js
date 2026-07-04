require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const rateLimit  = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const paystack   = require("./paystack");
const { validateEmail } = require("./emailValidator");
const emailService = require("./emailService");

const app    = express();
app.set("trust proxy", 1);
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3001;
const DEFAULT_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "8");
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
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

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role = "customer", phone = "", newsletter = true } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
    if (!["customer", "moderator"].includes(role)) return res.status(400).json({ error: "role must be customer or moderator" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const emailCheck = await validateEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });

    const cleanEmail = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const code = genOtp();
    const codeHash = await bcrypt.hash(code, 8);

    await prisma.emailOtp.deleteMany({ where: { email: cleanEmail, purpose: "signup" } });
    await prisma.emailOtp.create({
      data: {
        email: cleanEmail, codeHash, purpose: "signup",
        payload: { name: name.trim(), passwordHash, phone: (phone || "").trim(), role, newsletter: newsletter !== false },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    emailService.sendSignupOtp({ to: cleanEmail, code, name: name.trim() }).catch(e => console.error("Signup OTP email failed:", e?.message || e));
    res.json({ message: "Verification code sent. Check your email.", email: cleanEmail });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/verify-signup", authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "email and code required" });
    const cleanEmail = email.toLowerCase().trim();
    const otp = await prisma.emailOtp.findFirst({
      where: { email: cleanEmail, purpose: "signup", used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return res.status(400).json({ error: "No valid code found. Please request a new one." });
    if (otp.attempts >= 5) return res.status(429).json({ error: "Too many attempts. Please request a new code." });

    const valid = await bcrypt.compare(String(code), otp.codeHash);
    if (!valid) {
      await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: "Invalid code" });
    }

    const dup = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (dup) return res.status(409).json({ error: "Email already registered" });

    const p = otp.payload;
    const user = await prisma.user.create({
      data: {
        name: p.name, email: cleanEmail, phone: p.phone || "",
        passwordHash: p.passwordHash, role: p.role,
        status: p.role === "moderator" ? "pending" : "active",
        newsletter: p.newsletter !== false,
      },
    });
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { used: true } });
    if (user.role === "moderator") {
      return res.status(201).json({ message: "Email verified! Moderator account created. Awaiting super-admin approval.", user: safeUser(user) });
    }
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (user) {
      const code = genOtp();
      const codeHash = await bcrypt.hash(code, 8);
      await prisma.emailOtp.deleteMany({ where: { email: cleanEmail, purpose: "reset" } });
      await prisma.emailOtp.create({
        data: { email: cleanEmail, codeHash, purpose: "reset", expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
      emailService.sendPasswordResetOtp({ to: cleanEmail, code, name: user.name }).catch(e => console.error("Reset OTP failed:", e?.message || e));
    }
    res.json({ message: "If that email is registered, a reset code was sent." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: "email, code, and newPassword required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const cleanEmail = email.toLowerCase().trim();
    const otp = await prisma.emailOtp.findFirst({
      where: { email: cleanEmail, purpose: "reset", used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return res.status(400).json({ error: "No valid reset code. Please request a new one." });
    if (otp.attempts >= 5) return res.status(429).json({ error: "Too many attempts. Please request a new code." });
    const valid = await bcrypt.compare(String(code), otp.codeHash);
    if (!valid) {
      await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: "Invalid code" });
    }
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { used: true } });
    res.json({ message: "Password updated. You can now log in with your new password." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/resend-otp", authLimiter, async (req, res) => {
  try {
    const { email, purpose = "signup" } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    if (!["signup", "reset"].includes(purpose)) return res.status(400).json({ error: "invalid purpose" });
    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.emailOtp.findFirst({ where: { email: cleanEmail, purpose }, orderBy: { createdAt: "desc" } });
    if (!existing) return res.status(400).json({ error: "No previous request to resend. Please start over." });
    const code = genOtp();
    const codeHash = await bcrypt.hash(code, 8);
    await prisma.emailOtp.create({
      data: { email: cleanEmail, codeHash, purpose, payload: existing.payload, expiresAt: new Date(Date.now() + (purpose === "reset" ? 15 : 10) * 60 * 1000) },
    });
    const u = await prisma.user.findUnique({ where: { email: cleanEmail } });
    const name = u?.name || existing.payload?.name || "there";
    if (purpose === "signup") emailService.sendSignupOtp({ to: cleanEmail, code, name }).catch(() => {});
    else emailService.sendPasswordResetOtp({ to: cleanEmail, code, name }).catch(() => {});
    res.json({ message: "Code resent. Check your email." });
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

app.patch("/api/admin/users/:id/unsuspend", requireSuperAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data:  { status: "active", newsletter: true, rejectionNote: null },
  });
  console.log("✓ Unsuspended:", updated.email);
  res.json(safeUser(updated));
});

app.patch("/api/admin/users/:id/demote-to-customer", requireSuperAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "superadmin") return res.status(400).json({ error: "Cannot demote superadmin" });
  if (user.role === "customer") return res.status(400).json({ error: "User is already a customer" });
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: "customer" },
  });
  // Also update their group memberships role from organizer to member if any
  await prisma.groupMember.updateMany({
    where: { userId: req.params.id, role: "moderator" },
    data: { role: "member" },
  });
  console.log("[ADMIN] Demoted to customer:", updated.email);
  res.json({ ok: true, user: updated });
});

app.patch("/api/admin/users/:id/promote-to-moderator", requireSuperAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "superadmin") return res.status(400).json({ error: "Cannot change superadmin role" });
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data:  { role: "moderator", status: "active", approvedAt: new Date(), approvedBy: "superadmin" },
  });
  console.log("✓ Promoted to moderator:", updated.email);
  res.json(safeUser(updated));
});

app.get("/api/admin/pending-payments", requireSuperAdmin, async (req, res) => {
  const members = await prisma.groupMember.findMany({
    where: { role: { not: "organizer" }, paymentStatus: "pending" },
    include: { group: { select: { id: true, serviceName: true, serviceIcon: true, planName: true, organizerName: true, memberPays: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const now = Date.now();
  res.json(members.map(m => ({
    id: m.id, userId: m.userId, name: m.name, email: m.email, joinedAt: m.joinedAt,
    daysWaiting: Math.floor((now - new Date(m.joinedAt).getTime()) / (1000 * 60 * 60 * 24)),
    durationLabel: m.durationLabel, memberPays: m.memberPays,
    group: m.group,
  })));
});

app.post("/api/admin/pending-payments/:memberId/remind", requireSuperAdmin, async (req, res) => {
  const member = await prisma.groupMember.findUnique({
    where: { id: req.params.memberId },
    include: { group: true },
  });
  if (!member) return res.status(404).json({ error: "Member not found" });
  if (member.paymentStatus !== "pending") return res.status(400).json({ error: "Member's payment is not pending anymore." });
  try {
    await emailService.sendPaymentReminder({
      to: member.email, memberName: member.name,
      groupName: `${member.group.serviceName} ${member.group.planName}`,
      serviceName: member.group.serviceName,
      memberPays: member.memberPays || member.group.memberPays,
      durationLabel: member.durationLabel,
      groupId: member.groupId,
    });
    console.log(`🔔 Payment reminder sent to ${member.email}`);
    res.json({ message: `Reminder sent to ${member.name}.`, ok: true });
  } catch (err) {
    console.error("Payment reminder failed:", err);
    res.status(500).json({ error: "Could not send reminder" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICES & DURATIONS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/services",  (req, res) => res.json(SERVICES));
app.get("/api/durations", (req, res) => res.json(SUBSCRIPTION_DURATIONS));

// ═══════════════════════════════════════════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════════════════════════════════════════


// Mask the MIDDLE of an email so first + last chars stay visible, e.g.
//   "john.doe@gmail.com"     -> "jo****oe@gmail.com"
//   "ab@example.com"         -> "a*@example.com"
//   "pauline7@yahoo.com"     -> "pa****e7@yahoo.com"
function maskEmail(email) {
  if (!email || typeof email !== "string") return "";
  const [user, domain] = email.split("@");
  if (!domain) return "anon****";
  if (user.length <= 1) return `${user}*@${domain}`;
  if (user.length <= 3) return `${user[0]}*${user.slice(-1)}@${domain}`;
  if (user.length <= 6) return `${user[0]}${"*".repeat(user.length - 2)}${user.slice(-1)}@${domain}`;
  // longer than 6: keep first 2 + last 2, mask middle with at least 4 stars
  const middleLen = Math.max(user.length - 4, 4);
  return `${user.slice(0, 2)}${"*".repeat(middleLen)}${user.slice(-2)}@${domain}`;
}

app.get("/api/groups", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest", viewerId = null;
  try { const d = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET); viewerRole = d.role; viewerId = d.id; } catch {}

  const where = viewerRole === "superadmin" ? {}
    : viewerRole === "moderator" && viewerId ? { OR: [{ reviewStatus: "approved" }, { organizerId: viewerId }] }
    : { reviewStatus: "approved" };

  const groups = await prisma.group.findMany({ where, include: { members: true, payments: true }, orderBy: { createdAt: "desc" } });
  res.json(groups.map(g => {
    const confirmed = g.members.filter(m => m.role !== "organizer" && m.paymentStatus === "confirmed");
    const sortedConfirmed = confirmed.slice().sort((a, b) =>
      new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0)
    );
    const confirmedMaskedEmails = sortedConfirmed.map(m => maskEmail(m.email)).filter(Boolean);
    return {
      ...g,
      memberCount: confirmed.length,
      pendingCount: g.members.filter(m => m.role !== "organizer" && m.paymentStatus === "pending").length,
      // Most recent first; cycle through these on the card
      confirmedMaskedEmails,
      // Backward-compat (single email object)
      latestConfirmedMember: confirmedMaskedEmails[0]
        ? { maskedEmail: confirmedMaskedEmails[0], joinedAt: sortedConfirmed[0].joinedAt }
        : null,
      members: g.members.map(({ email, ...m }) => m),
    };
  }));
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
    creatorName  = process.env.SUPERADMIN_DISPLAY_NAME  || "SplitSubs Admin";
    creatorEmail = process.env.SUPERADMIN_DISPLAY_EMAIL || "admin@splitsubs.com";
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

app.post("/api/groups/:id/join", requireRole("customer", "moderator", "superadmin"), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open") return res.status(400).json({ error: "Group is not accepting new members" });

  const fixedMonths   = CYCLE_MONTHS[group.billingCycle] || 1;
  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === fixedMonths) || SUBSCRIPTION_DURATIONS[0];
  const payingMembers   = group.members.filter(m => m.role !== "organizer");
  const confirmedMembers = payingMembers.filter(m => m.paymentStatus === "confirmed");

  // Only CONFIRMED payments occupy slots. Pending members don't block new joins.
  if (confirmedMembers.length >= group.maxSlots) return res.status(400).json({ error: "Group is full" });
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

  // NOTE: We do NOT flip status to "full" on join — joining without paying must not
  // close the group to other customers. The flip happens in the payment-verify callback
  // once a confirmed payment count reaches maxSlots.

  res.status(201).json(member);
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTION RENEWAL
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/groups/:id/renew", requireRole("customer", "moderator", "superadmin"), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const member = await prisma.groupMember.findFirst({
    where: { groupId: group.id, userId: req.user.id, role: { not: "organizer" } },
  });
  if (!member) return res.status(404).json({ error: "You are not a member of this group" });
  if (member.paymentStatus === "pending") return res.status(400).json({ error: "You have a pending payment — complete that first." });
  const fixedMonths = CYCLE_MONTHS[group.billingCycle] || 1;
  const fees = await calcFee(group.pricePerSlot, fixedMonths);
  const updated = await prisma.groupMember.update({
    where: { id: member.id },
    data: {
      paymentStatus: "pending",
      memberPays:    fees.memberPays,
      platformFee:   fees.platformFee,
      organizerGets: fees.organizerGets,
      moderatorOwed: fees.moderatorOwed,
      months:        fixedMonths,
    },
  });
  res.json(updated);
});
// ═══════════════════════════════════════════════════════════════════════════
//  PAYSTACK PAYMENT
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/paystack/config", (req, res) => {
  res.json({ publicKey: PAYSTACK_PUBLIC_KEY });
});

app.post("/api/paystack/initiate", requireRole("customer", "moderator", "superadmin"), async (req, res) => {
  const { groupId, memberId } = req.body;
  if (!groupId || !memberId) return res.status(400).json({ error: "groupId and memberId required" });

  const [group, member] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.groupMember.findFirst({ where: { id: memberId, userId: req.user.id } }),
  ]);
  if (!group)  return res.status(404).json({ error: "Group not found" });
  if (!member) return res.status(404).json({ error: "Membership not found" });
  if (member.paymentStatus === "confirmed") return res.status(400).json({ error: "Already paid" });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const reference   = "SP-" + Date.now() + "-" + uuidv4().slice(0,8).toUpperCase();
  const callbackUrl = (process.env.FRONTEND_URL || "http://localhost:3000") + "/payment-callback?reference=" + reference + "&groupId=" + groupId + "&memberId=" + memberId;

  try {
    const { authorizationUrl } = await paystack.initializeTransaction({
      email: user.email, amount: member.memberPays,
      reference, callbackUrl,
      metadata: { groupId, memberId, groupName: group.serviceName + " " + group.planName, memberName: member.name, months: member.months },
    });

    await prisma.paystackOrder.create({
      data: {
        id: reference, reference, groupId, memberId,
        userId: req.user.id, memberName: member.name, memberEmail: user.email,
        months: member.months, baseAmount: member.baseAmount,
        platformFee: member.platformFee, moderatorOwed: member.moderatorOwed,
        organizerGets: member.moderatorOwed, moderatorId: group.organizerId,
        memberPays: member.memberPays, currency: "USD",
      },
    });

    res.json({ redirectUrl: authorizationUrl, reference, memberPays: member.memberPays });
  } catch (err) {
    console.error("Paystack initiate:", err.message);
    res.status(502).json({ error: "Payment gateway error: " + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Shared order-confirmation logic (used by both verify + IPN)
async function confirmOrder(reference) {
  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
  if (!order || order.status === "COMPLETED") return order;

  const txData = await paystack.verifyTransaction(reference);
  const code   = txData.status;

  await prisma.paystackOrder.update({ where: { id: reference }, data: { paystackStatus: code } });

  if (code === "success") {
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

    await prisma.paystackOrder.update({ where: { id: reference }, data: { status: "COMPLETED", confirmedAt } });
  } else if (["failed", "abandoned"].includes(code)) {
    await prisma.paystackOrder.update({ where: { id: reference }, data: { status: "FAILED" } });
  }

  return prisma.paystackOrder.findUnique({ where: { id: reference } });
}

app.get("/api/paystack/verify", async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: "reference required" });
  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "COMPLETED")
    return res.json({ status: "COMPLETED", memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets });
  try {
    const updated = await confirmOrder(reference);
    res.json({ status: updated.status, memberPays: updated.memberPays, platformFee: updated.platformFee, organizerGets: updated.organizerGets });
  } catch (err) { res.status(502).json({ error: err.message }); }
})

app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!paystack.verifyWebhookSignature(req.body, signature)) return res.status(400).json({ error: "Invalid signature" });
  res.sendStatus(200);
  try {
    const event = JSON.parse(req.body.toString());
    if (event.event !== "charge.success") return;
    const reference = event.data && event.data.reference;
    if (!reference) return;
    const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
    if (!order || order.status === "COMPLETED") return;
    await confirmOrder(reference);
    console.log("Paystack webhook confirmed:", reference);
  } catch (err) { console.error("Webhook error:", err.message); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN - EXPIRED SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/expired-members", requireSuperAdmin, async (req, res) => {
  const now = new Date();
  const members = await prisma.groupMember.findMany({
    where: { role: { not: "organizer" }, paymentStatus: { in: ["expired", "confirmed"] }, expiresAt: { not: null, lte: now } },
    include: { group: true },
    orderBy: { expiresAt: "asc" },
  });
  res.json(members.map(m => ({
    id: m.id, userId: m.userId, name: m.name, email: m.email, groupId: m.groupId,
    groupName:    m.group.serviceName + " " + m.group.planName,
    serviceIcon:  m.group.serviceIcon,
    serviceName:  m.group.serviceName,
    planName:     m.group.planName,
    memberPays:   m.memberPays || m.group.memberPays,
    billingCycle: m.group.billingCycle,
    expiresAt:    m.expiresAt,
    daysExpired:  Math.floor((now - new Date(m.expiresAt)) / (1000 * 60 * 60 * 24)),
    paymentStatus: m.paymentStatus,
  })));
});

app.post("/api/admin/expired-members/remind-all", requireSuperAdmin, async (req, res) => {
  const now = new Date();
  const members = await prisma.groupMember.findMany({
    where: { role: { not: "organizer" }, paymentStatus: { in: ["expired", "confirmed"] }, expiresAt: { not: null, lte: now } },
    include: { group: true },
  });
  if (!members.length) return res.json({ message: "No expired members found.", sent: 0, failed: 0 });
  let sent = 0, failed = 0;
  for (const m of members) {
    try {
      await emailService.sendExpiredRenewalReminder({
        to: m.email, memberName: m.name,
        groupName: m.group.serviceName + " " + m.group.planName,
        serviceName: m.group.serviceName, planName: m.group.planName,
        memberPays: m.memberPays || m.group.memberPays,
        billingCycle: m.group.billingCycle, expiresAt: m.expiresAt,
        daysExpired: Math.floor((now - new Date(m.expiresAt)) / (1000 * 60 * 60 * 24)),
        renewUrl: (process.env.FRONTEND_URL || "https://splitsubs.com") + "/group/" + m.groupId,
      });
      sent++;
    } catch { failed++; }
  }
  res.json({ message: "Reminders sent to " + sent + " expired member" + (sent !== 1 ? "s" : "") + "." + (failed > 0 ? " " + failed + " failed." : ""), sent, failed });
});

app.post("/api/admin/expired-members/:memberId/remind", requireSuperAdmin, async (req, res) => {
  const now = new Date();
  const member = await prisma.groupMember.findUnique({ where: { id: req.params.memberId }, include: { group: true } });
  if (!member) return res.status(404).json({ error: "Member not found" });
  try {
    await emailService.sendExpiredRenewalReminder({
      to: member.email, memberName: member.name,
      groupName: member.group.serviceName + " " + member.group.planName,
      serviceName: member.group.serviceName, planName: member.group.planName,
      memberPays: member.memberPays || member.group.memberPays,
      billingCycle: member.group.billingCycle, expiresAt: member.expiresAt,
      daysExpired: Math.floor((now - new Date(member.expiresAt)) / (1000 * 60 * 60 * 24)),
      renewUrl: (process.env.FRONTEND_URL || "https://splitsubs.com") + "/group/" + member.groupId,
    });
    res.json({ message: "Reminder sent to " + member.name + ".", ok: true });
  } catch (err) { res.status(500).json({ error: "Could not send reminder" }); }
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
      ? `<p>Hi ${group.organizer.name},<br/><br/>Your group has been approved and is now live on SplitSubs.<br/><br/>— SplitSubs Team</p>`
      : `<p>Hi ${group.organizer.name},<br/><br/>Your group was not approved.<br/><br/><b>Reason:</b> ${note || "Not specified"}<br/><br/>You may revise and resubmit.<br/><br/>— SplitSubs Team</p>`;
    emailService.sendEmail({ to: group.organizer.email, subject, html }).catch(() => {});
  }
  res.json(updated);
});


// ─── DELETE A GROUP ENTIRELY (super admin only, irreversible) ───────────────
app.delete("/api/admin/groups/:id", requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true, payments: true, pesapalOrders: true, platformEarnings: true } },
    },
  });
  if (!group) return res.status(404).json({ error: "Group not found" });
  try {
    await prisma.$transaction([
      prisma.platformEarning.deleteMany({ where: { groupId: id } }),
      prisma.payment.deleteMany({ where: { groupId: id } }),
      prisma.pesapalOrder.deleteMany({ where: { groupId: id } }),
      prisma.group.delete({ where: { id } }),
    ]);
    console.log(`[ADMIN] Deleted group ${id} (${group.serviceName} — ${group.planName})`);
    res.json({ ok: true, deleted: { id, serviceName: group.serviceName, planName: group.planName, members: group._count.members, payments: group._count.payments, pesapalOrders: group._count.pesapalOrders, platformEarnings: group._count.platformEarnings } });
  } catch (err) {
    console.error("Delete group failed:", err);
    res.status(500).json({ error: err.message || "Failed to delete group" });
  }
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
  const from = senderEmail || process.env.ADMIN_EMAIL || "admin@splitsubs.com";
  let sent = 0, failed = 0;
  await Promise.allSettled(targets.map(async u => { try { await emailService.sendGroupMessage({ to: u.email, memberName: u.name, groupName: "SplitSubs Platform", serviceName: "SplitSubs", senderName: "SplitSubs Admin", senderEmail: from, subject, messageBody: msgBody }); sent++; } catch { failed++; } }));
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

  const [users, footerSubs] = await Promise.all([
    prisma.user.findMany({ where: { newsletter: true }, select: { email: true, name: true } }),
    prisma.footerSubscriber.findMany({ select: { email: true } }),
  ]);

  // Deduplicate
  const seen = new Set();
  const audience = [];
  for (const u of users)     if (u.email && !seen.has(u.email.toLowerCase())) { seen.add(u.email.toLowerCase()); audience.push({ email: u.email, name: u.name || "there" }); }
  for (const s of footerSubs) if (s.email && !seen.has(s.email.toLowerCase())) { seen.add(s.email.toLowerCase()); audience.push({ email: s.email, name: "there" }); }

  const fromName  = senderName  || process.env.ADMIN_USERNAME     || "SplitSubs Team";
  const fromEmail = senderEmail || process.env.ADMIN_EMAIL        || "newsletter@splitsubs.com";
  const appUrl    = process.env.FRONTEND_URL || "https://splitsubs.com";

  const campaign = await prisma.newsletterCampaign.create({
    data: { type: "newsletter", subject, body, senderName: fromName, senderEmail: fromEmail, recipientCount: audience.length, recipients: audience.map(a => a.email), status: "sending" },
  });

  // Send immediately, respond first
  res.json({ message: `Sending to ${audience.length} subscriber(s)…`, campaignId: campaign.id, recipientCount: audience.length });

  // Send in background
  let sent = 0, failed = 0;
  for (const recipient of audience) {
    try {
      const personalised = body.replace(/\{name\}/g, recipient.name);
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f8">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:28px">⚡ Split<span style="color:#7c6aff">Subs</span></div>
  <div style="background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#fff">${subject}</h1>
    <div style="font-size:15px;line-height:1.75;color:#aaaacc;white-space:pre-wrap">${personalised}</div>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0"/>
    <a href="${appUrl}" style="display:inline-block;background:#7c6aff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px">Visit SplitSubs →</a>
  </div>
  <div style="text-align:center;font-size:12px;color:#555577;margin-top:24px;line-height:1.6">
    SplitSubs · Legal group subscription sharing<br/>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}" style="color:#7c6aff;text-decoration:none">Unsubscribe</a>
  </div>
</div></body></html>`;
      await emailService.sendEmail({ to: recipient.email, subject, html });
      sent++;
    } catch { failed++; }
    // Rate limit: 2 per second
    await new Promise(r => setTimeout(r, 500));
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: { status: failed === audience.length ? "failed" : "sent", sent, failed: failed || undefined },
  });
  console.log(`📨 Newsletter "${subject}": ${sent} sent, ${failed} failed`);
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
  const slotData = slots.map((s, i) => ({
    slotNumber: i + 1,
    label:      s.label      || `Slot ${i + 1}`,
    inviteLink: typeof s.inviteLink === "string" ? s.inviteLink : "",
    address:    typeof s.address    === "string" ? s.address    : "",
    note:       s.note       || "",
  }));
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
  const senderName   = isSuperAdmin ? (process.env.SUPERADMIN_DISPLAY_NAME  || "SplitSubs Admin")    : group.organizerName;
  const fromEmail    = senderEmail || (isSuperAdmin ? (process.env.SUPERADMIN_DISPLAY_EMAIL || "admin@splitsubs.com") : group.organizerEmail) || "admin@splitsubs.com";

  const campaign = await prisma.groupEmail.create({ data: { groupId: group.id, groupName: `${group.serviceName} ${group.planName}`, subject, body: msgBody, senderName, senderEmail: fromEmail, recipientCount: members.length, recipients: members.map(m => m.email), sentBy: req.user.id, status: "sending" } });
  let sent = 0, failed = 0;
  await Promise.allSettled(members.map(async m => { try { await emailService.sendGroupMessage({ to: m.email, memberName: m.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName, senderName, senderEmail: fromEmail, subject, messageBody: msgBody }); sent++; } catch { failed++; } }));
  await prisma.groupEmail.update({ where: { id: campaign.id }, data: { status: failed === members.length ? "failed" : "sent", sent, failed } });
  res.json({ message: `Email sent to ${sent} member${sent !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed.` : ""}`, sent, failed, campaignId: campaign.id });
});

app.post("/api/groups/:id/emails/send-to-member", requireAuth, async (req, res) => {
  const { memberId, subject, body: msgBody, senderEmail } = req.body;
  if (!memberId || !subject || !msgBody) return res.status(400).json({ error: "memberId, subject, body required" });
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const member = await prisma.groupMember.findFirst({ where: { id: memberId, groupId: group.id } });
  if (!member) return res.status(404).json({ error: "Member not found in this group" });

  const isSuperAdmin = req.user.role === "superadmin" && group.organizerId !== req.user.id;
  const senderName   = isSuperAdmin ? (process.env.SUPERADMIN_DISPLAY_NAME  || "SplitSubs Admin")    : group.organizerName;
  const fromEmail    = senderEmail || (isSuperAdmin ? (process.env.SUPERADMIN_DISPLAY_EMAIL || "admin@splitsubs.com") : group.organizerEmail) || "admin@splitsubs.com";

  const campaign = await prisma.groupEmail.create({ data: { groupId: group.id, groupName: `${group.serviceName} ${group.planName}`, subject, body: msgBody, senderName, senderEmail: fromEmail, recipientCount: 1, recipients: [member.email], sentBy: req.user.id, status: "sending" } });
  let sent = 0, failed = 0;
  try {
    await emailService.sendGroupMessage({ to: member.email, memberName: member.name, groupName: `${group.serviceName} ${group.planName}`, serviceName: group.serviceName, senderName, senderEmail: fromEmail, subject, messageBody: msgBody });
    sent = 1;
  } catch (err) { failed = 1; console.error("send-to-member failed:", err); }
  await prisma.groupEmail.update({ where: { id: campaign.id }, data: { status: failed ? "failed" : "sent", sent, failed } });
  res.json({ message: failed ? "Send failed — check server logs." : `Email sent to ${member.name}.`, sent, failed, campaignId: campaign.id });
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

// Ensures a users row exists for the file-based superadmin so FK constraints
// (groups.organizerId, groupMembers.userId, payments.userId) resolve when the
// superadmin creates or joins records. Idempotent — safe to run every startup.
async function ensureSuperAdminUser() {
  try {
    await prisma.user.upsert({
      where: { id: "superadmin" },
      update: {
        name:  process.env.ADMIN_USERNAME || "Super Admin",
        email: process.env.ADMIN_EMAIL    || "admin@splitsubs.com",
      },
      create: {
        id: "superadmin",
        name:  process.env.ADMIN_USERNAME || "Super Admin",
        email: process.env.ADMIN_EMAIL    || "admin@splitsubs.com",
        phone: "",
        passwordHash: "",
        role: "superadmin",
        status: "active",
        newsletter: false,
      },
    });
  } catch (e) {
    console.error("⚠️  Failed to ensure superadmin user row:", e.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────
// ─── Public unsubscribe / resubscribe ──────────────────────────────────────
app.get("/api/unsubscribe", async (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) await prisma.user.update({ where: { email }, data: { newsletter: false } });
    await prisma.footerSubscriber.deleteMany({ where: { email } });
    console.log("📭 Unsubscribed:", email);
    res.json({ success: true, email });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).json({ error: "Could not process unsubscribe" });
  }
});

app.post("/api/resubscribe", async (req, res) => {
  const email = (req.body.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) await prisma.user.update({ where: { email }, data: { newsletter: true } });
    console.log("📬 Resubscribed:", email);
    res.json({ success: true, email });
  } catch (err) {
    console.error("Resubscribe error:", err);
    res.status(500).json({ error: "Could not process resubscribe" });
  }
});



// ── Blog: image upload + public static handler ─────────────────────────────
const multer = require("multer");
const fsBlog = require("fs");
const pathBlog = require("path");
const BLOG_UPLOAD_DIR = pathBlog.join(__dirname, "..", "uploads", "blog");
if (!fsBlog.existsSync(BLOG_UPLOAD_DIR)) fsBlog.mkdirSync(BLOG_UPLOAD_DIR, { recursive: true });

const blogUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BLOG_UPLOAD_DIR),
    filename:   (req, file, cb) => {
      const ext = pathBlog.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    cb(ok ? null : new Error("Image must be jpg, png, webp, or gif"), ok);
  },
});

app.post("/api/blog/upload-image", requireRole("moderator", "superadmin"), blogUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  res.json({ url: `/uploads/blog/${req.file.filename}`, size: req.file.size, name: req.file.originalname });
});

// Public static handler for blog images (served by Express; Nginx will pass-through)
app.use("/uploads/blog", express.static(pathBlog.join(__dirname, "..", "uploads", "blog"), {
  maxAge: "30d",
  immutable: true,
}));

// ── Blog: newsletter notification when a post publishes ────────────────────
async function notifyNewBlogPost(post) {
  if (!post || post.status !== "published" || post.reviewStatus !== "approved") return;
  if (post.noIndex) return; // skip noindexed posts
  try {
    // Combined audience: opted-in users + footer subscribers (deduplicated)
    const users = await prisma.user.findMany({
      where: { newsletter: true, status: "active" },
      select: { email: true, name: true },
    });
    const subs = await prisma.footerSubscriber.findMany({ select: { email: true } }).catch(() => []);
    const seen = new Set();
    const audience = [];
    for (const u of users)  if (u.email && !seen.has(u.email.toLowerCase())) { seen.add(u.email.toLowerCase()); audience.push({ email: u.email, name: u.name }); }
    for (const s of subs)   if (s.email && !seen.has(s.email.toLowerCase())) { seen.add(s.email.toLowerCase()); audience.push({ email: s.email, name: "" }); }

    console.log(`📨 Sending new-post notification to ${audience.length} recipients for "${post.title}"`);
    let sent = 0, failed = 0;
    for (const r of audience) {
      try {
        await emailService.sendNewBlogPostNotification({
          to: r.email, name: r.name || "there",
          title: post.title,
          excerpt: post.excerpt || post.metaDescription,
          url: `${(process.env.FRONTEND_URL || "https://splitsubs.com")}/blog/${post.slug}`,
          coverImage: post.coverImage,
          authorName: post.authorName,
          readingMinutes: post.readingMinutes,
        });
        sent++;
      } catch (e) { failed++; }
      await new Promise(r => setTimeout(r, 500)); // 2/sec
    }
    console.log(`📨 Blog notification done: ${sent} sent, ${failed} failed`);
  } catch (err) {
    console.error("notifyNewBlogPost error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BLOG / SEO
// ═══════════════════════════════════════════════════════════════════════════
const { marked } = require("marked");
const slugify = require("slugify");
marked.setOptions({ gfm: true, breaks: true, headerIds: true });

const SITE_URL = process.env.FRONTEND_URL || "https://splitsubs.com";
const SITE_NAME = "SplitSubs";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function readingTime(text) {
  const words = String(text || "").trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function ensureUniqueSlug(base, currentId = null) {
  return prisma.blogPost.findFirst({ where: { slug: base, NOT: currentId ? { id: currentId } : undefined } })
    .then(existing => existing ? `${base}-${Date.now().toString(36).slice(-4)}` : base);
}

// ── SSR: blog list page ────────────────────────────────────────────────────
app.get("/blog", async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: "published", reviewStatus: "approved" },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
    const html = renderBlogListHtml(posts, req);
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (err) {
    console.error("Blog list SSR error:", err);
    res.status(500).send("Error rendering blog");
  }
});

// ── SSR: single post page ──────────────────────────────────────────────────
app.get("/blog/:slug", async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || post.status !== "published" || post.reviewStatus !== "approved") {
      return res.status(404).send(renderNotFoundHtml(req.params.slug));
    }
    // Increment view count async
    prisma.blogPost.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    // Related posts (same category, exclude current)
    const related = await prisma.blogPost.findMany({
      where: { status: "published", reviewStatus: "approved", category: post.category, NOT: { id: post.id } },
      orderBy: { publishedAt: "desc" }, take: 3,
    });
    const html = renderBlogPostHtml(post, related, req);
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (err) {
    console.error("Blog post SSR error:", err);
    res.status(500).send("Error rendering blog post");
  }
});

// ── sitemap.xml ────────────────────────────────────────────────────────────
app.get("/sitemap.xml", async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: "published", reviewStatus: "approved", noIndex: false },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, updatedAt: true },
    });
    const urls = [
      { loc: SITE_URL + "/", priority: "1.0", changefreq: "daily" },
      { loc: SITE_URL + "/groups", priority: "0.9", changefreq: "hourly" },
      { loc: SITE_URL + "/blog", priority: "0.8", changefreq: "daily" },
      ...posts.map(p => ({
        loc: `${SITE_URL}/blog/${p.slug}`,
        lastmod: p.updatedAt.toISOString(),
        priority: "0.7", changefreq: "weekly",
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
    res.set("Content-Type", "application/xml; charset=utf-8").send(xml);
  } catch (err) {
    res.status(500).send("Sitemap error");
  }
});

// ── robots.txt ─────────────────────────────────────────────────────────────
app.get("/robots.txt", (req, res) => {
  res.set("Content-Type", "text/plain").send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin-login
Disallow: /payment-callback
Disallow: /unsubscribe

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

// ── JSON API ───────────────────────────────────────────────────────────────
app.get("/api/blog/my", requireRole("moderator", "superadmin"), async (req, res) => {
  const where = req.user.role === "superadmin"
    ? {}
    : { authorId: req.user.id };
  const posts = await prisma.blogPost.findMany({ where, orderBy: { updatedAt: "desc" } });
  res.json(posts);
});

app.get("/api/blog", async (req, res) => {
  const { category, tag, status } = req.query;
  const where = {};
  if (status === "all" && req.headers.authorization) {
    // Auth users with admin role can see all
    try {
      const d = jwt.verify(req.headers.authorization.replace("Bearer ", ""), JWT_SECRET);
      if (d.role !== "superadmin") where.status = "published";
    } catch { where.status = "published"; }
  } else {
    where.status = "published";
    where.reviewStatus = "approved";
  }
  if (category) where.category = category;
  if (tag)      where.tags = { has: tag };
  const posts = await prisma.blogPost.findMany({
    where, orderBy: { publishedAt: "desc" }, take: 100,
  });
  res.json(posts);
});

app.get("/api/blog/:slug", async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json(post);
});

app.post("/api/blog", requireRole("moderator", "superadmin"), async (req, res) => {
  try {
    const { title, content, metaDescription, excerpt, coverImage, coverImageAlt,
            category, tags, metaTitle, ogImage, noIndex, status, authorBio } = req.body;
    if (!title || !content || !metaDescription) {
      return res.status(400).json({ error: "title, content, metaDescription required" });
    }
    const isAdmin = req.user.role === "superadmin";
    const author = isAdmin
      ? { id: "superadmin", name: process.env.SUPERADMIN_DISPLAY_NAME || "SplitSubs Admin" }
      : { id: req.user.id, name: (await prisma.user.findUnique({ where: { id: req.user.id } }))?.name || "Author" };

    const baseSlug = slugify(title, { lower: true, strict: true }).slice(0, 80) || "post";
    const slug = await ensureUniqueSlug(baseSlug);

    const post = await prisma.blogPost.create({
      data: {
        slug, title: String(title).slice(0, 200),
        metaTitle: metaTitle ? String(metaTitle).slice(0, 70) : null,
        metaDescription: String(metaDescription).slice(0, 200),
        excerpt: excerpt ? String(excerpt).slice(0, 300) : null,
        content: String(content),
        coverImage:    coverImage    || null,
        coverImageAlt: coverImageAlt || null,
        category:      category      || "general",
        tags:          Array.isArray(tags) ? tags.slice(0, 10) : [],
        authorId:      author.id,
        authorName:    author.name,
        authorBio:     authorBio || null,
        status:        status === "published" ? (isAdmin ? "published" : "draft") : "draft",
        reviewStatus:  isAdmin ? "approved" : "pending",
        ogImage:       ogImage || coverImage || null,
        noIndex:       !!noIndex,
        readingMinutes: readingTime(content),
        publishedAt:   status === "published" && isAdmin ? new Date() : null,
      },
    });
    res.status(201).json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/blog/:id", requireRole("moderator", "superadmin"), async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Not found" });
  if (post.authorId !== req.user.id && req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const isAdmin = req.user.role === "superadmin";
  const { title, content, metaDescription, excerpt, coverImage, coverImageAlt,
          category, tags, metaTitle, ogImage, noIndex, status, authorBio } = req.body;
  const data = {
    ...(title           !== undefined && { title: String(title).slice(0, 200) }),
    ...(metaTitle       !== undefined && { metaTitle: metaTitle ? String(metaTitle).slice(0, 70) : null }),
    ...(metaDescription !== undefined && { metaDescription: String(metaDescription).slice(0, 200) }),
    ...(excerpt         !== undefined && { excerpt: excerpt ? String(excerpt).slice(0, 300) : null }),
    ...(content         !== undefined && { content: String(content), readingMinutes: readingTime(content) }),
    ...(coverImage      !== undefined && { coverImage }),
    ...(coverImageAlt   !== undefined && { coverImageAlt }),
    ...(category        !== undefined && { category }),
    ...(tags            !== undefined && { tags: Array.isArray(tags) ? tags.slice(0, 10) : [] }),
    ...(ogImage         !== undefined && { ogImage }),
    ...(noIndex         !== undefined && { noIndex: !!noIndex }),
    ...(authorBio       !== undefined && { authorBio }),
  };
  if (status !== undefined) {
    if (status === "published" && isAdmin) {
      data.status = "published";
      if (!post.publishedAt) data.publishedAt = new Date();
    } else if (status === "draft" || status === "archived") {
      data.status = status;
    } else if (status === "published" && !isAdmin) {
      data.reviewStatus = "pending";
    }
  }
  const updated = await prisma.blogPost.update({ where: { id: post.id }, data });
  res.json(updated);
});

app.delete("/api/blog/:id", requireRole("moderator", "superadmin"), async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Not found" });
  if (post.authorId !== req.user.id && req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  await prisma.blogPost.delete({ where: { id: post.id } });
  res.json({ message: "Deleted" });
});

// Admin review queue
app.get("/api/admin/blog/pending", requireSuperAdmin, async (req, res) => {
  const posts = await prisma.blogPost.findMany({
    where: { reviewStatus: "pending" }, orderBy: { createdAt: "desc" },
  });
  res.json(posts);
});
app.patch("/api/admin/blog/:id/review", requireSuperAdmin, async (req, res) => {
  const { decision, note = "" } = req.body;
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "decision invalid" });
  const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Not found" });
  const data = decision === "approved"
    ? { reviewStatus: "approved", status: "published", publishedAt: post.publishedAt || new Date(), rejectionNote: null }
    : { reviewStatus: "rejected", status: "draft", rejectionNote: note };
  const reviewed = await prisma.blogPost.update({ where: { id: post.id }, data });
  res.json(reviewed);
});

// ── HTML renderers ─────────────────────────────────────────────────────────
function siteHeader(req) {
  return `<header class="ssr-header">
    <a href="/" class="ssr-logo">⚡ ${SITE_NAME}</a>
    <nav class="ssr-nav" id="ssr-nav">
      <a href="/">Home</a>
      <a href="/groups">Browse Groups</a>
      <a href="/blog" class="active">Blog</a>
      <a href="/login" id="ssr-login">Log In</a>
      <a href="/signup" id="ssr-signup" class="cta">Sign Up</a>
    </nav>
  </header>
  <script>
  (function() {
    try {
      var token = sessionStorage.getItem('sp_token');
      var userJson = sessionStorage.getItem('sp_user');
      if (token && userJson) {
        var user = JSON.parse(userJson);
        var loginLink = document.getElementById('ssr-login');
        var signupLink = document.getElementById('ssr-signup');
        if (loginLink) loginLink.remove();
        if (signupLink) {
          signupLink.textContent = '👤 ' + (user.name || 'Account');
          if (user.role === 'superadmin') signupLink.href = '/admin';
          else if (user.role === 'moderator') signupLink.href = '/mod-dash';
          else signupLink.href = '/my-groups';
        }
        // Add Editor link for mod/admin
        if (user.role === 'superadmin' || user.role === 'moderator') {
          var nav = document.getElementById('ssr-nav');
          var editor = document.createElement('a');
          editor.href = '/blog-editor';
          editor.textContent = '✏️ Editor';
          nav.insertBefore(editor, signupLink);
        }
      }
    } catch (e) {}
  })();
  </script>`;
}

function siteFooter() {
  return `<footer class="ssr-footer">
    <div>
      <strong>⚡ ${SITE_NAME}</strong> · Share legally, save smartly.<br/>
      <small>© ${new Date().getFullYear()} ${SITE_NAME}. All group buys use official family/group plans only.</small>
    </div>
  </footer>`;
}

function ssrCss() {
  return `<style>
    body { margin:0; font-family:'DM Sans','Segoe UI',Arial,sans-serif; background:#0a0a0f; color:#f0f0f8; line-height:1.65; }
    .ssr-header { display:flex; justify-content:space-between; align-items:center; padding:18px 32px; border-bottom:1px solid rgba(255,255,255,0.07); background:#14141e; position:sticky; top:0; z-index:10; }
    .ssr-logo { font-family:'Syne','Segoe UI',sans-serif; font-weight:800; font-size:1.15rem; color:#fff; text-decoration:none; }
    .ssr-nav { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
    .ssr-nav a { color:#aaaacc; text-decoration:none; font-size:0.92rem; padding:6px 10px; border-radius:6px; }
    .ssr-nav a:hover, .ssr-nav a.active { color:#fff; background:rgba(255,255,255,0.05); }
    .ssr-nav a.cta { background:linear-gradient(90deg,#7c6aff,#ff6a8e); color:#fff; padding:8px 18px; border-radius:8px; font-weight:600; }
    main { max-width:760px; margin:48px auto; padding:0 24px; }
    main.list { max-width:1080px; }
    h1, h2, h3, h4 { font-family:'Syne','Segoe UI',sans-serif; color:#fff; line-height:1.25; }
    h1 { font-size:2.4rem; margin:0 0 14px; letter-spacing:-0.02em; }
    h2 { font-size:1.7rem; margin:32px 0 12px; }
    h3 { font-size:1.3rem; margin:24px 0 10px; }
    p { color:#cccce0; margin:0 0 18px; font-size:1.05rem; }
    a { color:#7c6aff; }
    .post-meta { color:#888; font-size:0.85rem; margin-bottom:24px; }
    .post-cover { width:100%; border-radius:14px; margin:24px 0; }
    .article-content { font-size:1.05rem; }
    .article-content img { max-width:100%; border-radius:10px; }
    .article-content code { background:#1f1f2e; padding:2px 6px; border-radius:4px; font-family:'Courier New',monospace; font-size:0.9em; }
    .article-content pre { background:#14141e; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:16px; overflow:auto; }
    .article-content pre code { background:none; padding:0; }
    .article-content blockquote { border-left:3px solid #7c6aff; margin:18px 0; padding:8px 16px; color:#aaaacc; font-style:italic; background:rgba(124,106,255,0.05); border-radius:0 8px 8px 0; }
    .tags { display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }
    .tag { background:rgba(124,106,255,0.15); color:#9d8eff; border:1px solid rgba(124,106,255,0.25); border-radius:99px; padding:4px 12px; font-size:0.78rem; text-decoration:none; }
    .author-card { background:#14141e; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:20px; margin:36px 0; }
    .author-card strong { color:#fff; display:block; margin-bottom:6px; }
    .related { margin-top:48px; padding-top:32px; border-top:1px solid rgba(255,255,255,0.07); }
    .related h2 { font-size:1.3rem; margin-bottom:18px; }
    .related-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
    .related-card { background:#14141e; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:18px; text-decoration:none; color:inherit; transition:border-color 0.18s; }
    .related-card:hover { border-color:#7c6aff; }
    .related-card .rc-title { color:#fff; font-weight:700; font-size:0.98rem; margin-bottom:6px; }
    .related-card p { color:#aaaacc; font-size:0.84rem; margin:0; }
    .post-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:22px; margin-top:24px; }
    .post-card { background:#14141e; border:1px solid rgba(255,255,255,0.08); border-radius:14px; overflow:hidden; text-decoration:none; color:inherit; transition:transform 0.18s, border-color 0.18s; }
    .post-card:hover { transform:translateY(-3px); border-color:#7c6aff; }
    .post-card img { width:100%; height:180px; object-fit:cover; display:block; }
    .post-card .pc-body { padding:18px; }
    .post-card h2 { font-size:1.15rem; margin:0 0 8px; }
    .post-card p { font-size:0.88rem; color:#aaaacc; margin:0 0 12px; }
    .post-card .pc-meta { font-size:0.74rem; color:#666; }
    .ssr-footer { text-align:center; padding:32px 24px; border-top:1px solid rgba(255,255,255,0.07); color:#888; font-size:0.84rem; margin-top:80px; }
    @media (max-width:640px) {
      h1 { font-size:1.7rem; } h2 { font-size:1.35rem; }
      .ssr-header { padding:14px 18px; }
      .ssr-nav { gap:10px; } .ssr-nav a { font-size:0.84rem; padding:4px 7px; }
      main { padding:0 16px; margin:28px auto; }
    }
  </style>`;
}

function renderBlogListHtml(posts, req) {
  const title = `Blog — ${SITE_NAME}: Save on Premium Subscriptions Legally`;
  const desc  = `Guides, tips, and stories on splitting subscription costs legally. Save up to 70% on Spotify, Netflix, Disney+ and more by joining official family plans.`;
  const url   = SITE_URL + "/blog";
  const cards = posts.map(p => `
    <a class="post-card" href="/blog/${p.slug}">
      ${p.coverImage ? `<img src="${escapeHtml(p.coverImage)}" alt="${escapeHtml(p.coverImageAlt || p.title)}" loading="lazy"/>` : ""}
      <div class="pc-body">
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.excerpt || p.metaDescription || "").slice(0, 140)}${(p.excerpt || p.metaDescription || "").length > 140 ? "…" : ""}</p>
        <div class="pc-meta">${new Date(p.publishedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · ${p.readingMinutes} min read · ${escapeHtml(p.category)}</div>
      </div>
    </a>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}"/>
<link rel="canonical" href="${url}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:site_name" content="${SITE_NAME}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(title)}"/>
<meta name="twitter:description" content="${escapeHtml(desc)}"/>
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org","@type":"Blog","name":SITE_NAME+" Blog","url":url,
  "blogPost": posts.slice(0,10).map(p=>({"@type":"BlogPosting","headline":p.title,"url":`${SITE_URL}/blog/${p.slug}`,"datePublished":p.publishedAt,"author":{"@type":"Person","name":p.authorName}}))
})}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
${ssrCss()}
</head>
<body>
${siteHeader(req)}
<main class="list">
  <h1>The SplitSubs Blog</h1>
  <p class="post-meta">Guides, tips, and stories on splitting subscriptions legally and saving on premium plans.</p>
  ${posts.length === 0 ? `<p>No posts yet. Check back soon.</p>` : `<div class="post-grid">${cards}</div>`}
</main>
${siteFooter()}
</body></html>`;
}

function renderBlogPostHtml(post, related, req) {
  const title = post.metaTitle || `${post.title} | ${SITE_NAME}`;
  const url   = `${SITE_URL}/blog/${post.slug}`;
  const og    = post.ogImage || post.coverImage || `${SITE_URL}/og-default.png`;
  const html  = marked.parse(post.content || "");
  const tags  = (post.tags || []).map(t => `<a href="/blog?tag=${encodeURIComponent(t)}" class="tag">#${escapeHtml(t)}</a>`).join("");
  const relatedCards = related.map(r => `
    <a class="related-card" href="/blog/${r.slug}">
      <div class="rc-title">${escapeHtml(r.title)}</div>
      <p>${escapeHtml((r.excerpt || r.metaDescription || "").slice(0, 90))}${(r.excerpt || r.metaDescription || "").length > 90 ? "…" : ""}</p>
    </a>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(post.metaDescription)}"/>
<link rel="canonical" href="${escapeHtml(post.canonicalUrl || url)}"/>
${post.noIndex ? '<meta name="robots" content="noindex,nofollow"/>' : '<meta name="robots" content="index,follow"/>'}
<meta name="author" content="${escapeHtml(post.authorName)}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${escapeHtml(post.title)}"/>
<meta property="og:description" content="${escapeHtml(post.metaDescription)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:site_name" content="${SITE_NAME}"/>
<meta property="og:image" content="${escapeHtml(og)}"/>
<meta property="article:published_time" content="${post.publishedAt ? post.publishedAt.toISOString() : ""}"/>
<meta property="article:modified_time" content="${post.updatedAt.toISOString()}"/>
<meta property="article:author" content="${escapeHtml(post.authorName)}"/>
${(post.tags||[]).map(t => `<meta property="article:tag" content="${escapeHtml(t)}"/>`).join("\n")}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(post.title)}"/>
<meta name="twitter:description" content="${escapeHtml(post.metaDescription)}"/>
<meta name="twitter:image" content="${escapeHtml(og)}"/>
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org","@type":"BlogPosting",
  "headline": post.title, "description": post.metaDescription,
  "image": og, "datePublished": post.publishedAt, "dateModified": post.updatedAt,
  "author": { "@type":"Person", "name": post.authorName },
  "publisher": { "@type":"Organization", "name": SITE_NAME, "logo":{"@type":"ImageObject","url":SITE_URL+"/logo512.png"} },
  "mainEntityOfPage": { "@type":"WebPage", "@id": url },
  "keywords": (post.tags||[]).join(", "),
})}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
${ssrCss()}
</head>
<body>
${siteHeader(req)}
<main>
  <article>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="post-meta">By <strong>${escapeHtml(post.authorName)}</strong> · ${new Date(post.publishedAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})} · ${post.readingMinutes} min read · ${escapeHtml(post.category)}</p>
    ${post.coverImage ? `<img class="post-cover" src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.coverImageAlt || post.title)}"/>` : ""}
    <div class="article-content">${html}</div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${post.authorBio ? `<div class="author-card"><strong>About ${escapeHtml(post.authorName)}</strong>${escapeHtml(post.authorBio)}</div>` : ""}
  </article>
  ${related.length > 0 ? `<section class="related"><h2>Related Posts</h2><div class="related-grid">${relatedCards}</div></section>` : ""}
</main>
${siteFooter()}
</body></html>`;
}

function renderNotFoundHtml(slug) {
  return `<!DOCTYPE html><html><head><title>Not Found — ${SITE_NAME}</title><meta name="robots" content="noindex"/>${ssrCss()}</head>
<body>${siteHeader({})}
<main><h1>Post not found</h1><p>The post "${escapeHtml(slug)}" doesn't exist or has been removed. Browse <a href="/blog">all posts</a> instead.</p></main>
${siteFooter()}</body></html>`;
}


// ═══════════════════════════════════════════════════════════════════════════
//  SUPPORT CHAT + PRESENCE
// ═══════════════════════════════════════════════════════════════════════════
const ONLINE_WINDOW_MS = 90 * 1000;

app.post("/api/presence/heartbeat", requireAuth, async (req, res) => {
  await prisma.userPresence.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, online: true, lastSeen: new Date() },
    update: { online: true, lastSeen: new Date() },
  });
  res.json({ ok: true });
});

app.post("/api/admin/presence/heartbeat", requireSuperAdmin, async (req, res) => {
  await prisma.userPresence.upsert({
    where: { userId: "superadmin" },
    create: { userId: "superadmin", online: true, lastSeen: new Date() },
    update: { online: true, lastSeen: new Date() },
  });
  res.json({ ok: true });
});

app.get("/api/presence/superadmin", async (req, res) => {
  const p = await prisma.userPresence.findUnique({ where: { userId: "superadmin" } });
  if (!p) return res.json({ online: false, lastSeen: null });
  const ageMs = Date.now() - new Date(p.lastSeen).getTime();
  res.json({ online: ageMs < ONLINE_WINDOW_MS, lastSeen: p.lastSeen });
});

app.get("/api/support/me", requireAuth, async (req, res) => {
  let thread = await prisma.supportThread.findUnique({
    where: { userId: req.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (thread && thread.unreadByUser > 0) {
    await prisma.supportThread.update({ where: { id: thread.id }, data: { unreadByUser: 0 } });
    thread.unreadByUser = 0;
  }
  res.json({ thread });
});

app.get("/api/support/me/unread", requireAuth, async (req, res) => {
  const t = await prisma.supportThread.findUnique({ where: { userId: req.user.id }, select: { unreadByUser: true } });
  res.json({ count: t?.unreadByUser || 0 });
});

app.post("/api/support/me/message", requireAuth, async (req, res) => {
  const body = (req.body?.body || "").trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: "Empty message" });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  let thread = await prisma.supportThread.findUnique({ where: { userId: user.id } });
  if (!thread) {
    thread = await prisma.supportThread.create({
      data: {
        userId: user.id, userName: user.name, userEmail: user.email, userRole: user.role,
        lastMessage: body, lastSenderRole: user.role, unreadByAdmin: 1,
      },
    });
  } else {
    await prisma.supportThread.update({
      where: { id: thread.id },
      data: { lastMessage: body, lastSenderRole: user.role, unreadByAdmin: { increment: 1 }, updatedAt: new Date() },
    });
  }
  const msg = await prisma.supportMessage.create({
    data: { threadId: thread.id, senderId: user.id, senderRole: user.role, body },
  });
  res.status(201).json({ message: msg });
});

app.get("/api/admin/support/threads", requireSuperAdmin, async (req, res) => {
  const threads = await prisma.supportThread.findMany({ orderBy: { updatedAt: "desc" } });
  const userIds = threads.map(t => t.userId);
  const presences = await prisma.userPresence.findMany({ where: { userId: { in: userIds } } });
  const presMap = Object.fromEntries(presences.map(p => [p.userId, p]));
  res.json(threads.map(t => {
    const p = presMap[t.userId];
    const ageMs = p ? Date.now() - new Date(p.lastSeen).getTime() : Infinity;
    return { ...t, online: p ? ageMs < ONLINE_WINDOW_MS : false, lastSeen: p?.lastSeen || null };
  }));
});

app.get("/api/admin/support/threads/:id", requireSuperAdmin, async (req, res) => {
  const thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) return res.status(404).json({ error: "Not found" });
  if (thread.unreadByAdmin > 0) {
    await prisma.supportThread.update({ where: { id: thread.id }, data: { unreadByAdmin: 0 } });
    thread.unreadByAdmin = 0;
  }
  const p = await prisma.userPresence.findUnique({ where: { userId: thread.userId } });
  const ageMs = p ? Date.now() - new Date(p.lastSeen).getTime() : Infinity;
  thread.online = p ? ageMs < ONLINE_WINDOW_MS : false;
  thread.lastSeen = p?.lastSeen || null;
  res.json(thread);
});

app.post("/api/admin/support/threads/:id/reply", requireSuperAdmin, async (req, res) => {
  const body = (req.body?.body || "").trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: "Empty message" });
  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Not found" });
  const msg = await prisma.supportMessage.create({
    data: { threadId: thread.id, senderId: "superadmin", senderRole: "superadmin", body },
  });
  await prisma.supportThread.update({
    where: { id: thread.id },
    data: { lastMessage: body, lastSenderRole: "superadmin", unreadByUser: { increment: 1 }, updatedAt: new Date() },
  });
  await prisma.userPresence.upsert({
    where: { userId: "superadmin" },
    create: { userId: "superadmin", online: true, lastSeen: new Date() },
    update: { online: true, lastSeen: new Date() },
  });
  res.json({ message: msg });
});

app.listen(PORT, async () => {
  const fee = await getPlatformFeePercent();
  console.log(`\n🚀 SplitSubs API  →  http://localhost:${PORT}`);
  console.log(`🗄️  Database      →  PostgreSQL (Prisma)`);
  console.log(`💰 Platform fee   →  ${fee}%`);
  console.log(`🌍 PesaPal env    →  ${process.env.PESAPAL_ENV || "sandbox"}`);
  console.log(`📧 Email enabled  →  ${process.env.EMAIL_ENABLED === "true" ? "YES" : "NO (stub mode)"}\n`);
  await ensureSuperAdminUser();
  console.log("✅ Paystack webhook ready at /api/paystack/webhook");
  async function runScheduler() { try { await emailService.runExpiryScheduler(prisma); } catch (e) { console.error("Scheduler error:", e.message); } }
  runScheduler();
  setInterval(runScheduler, 24 * 60 * 60 * 1000);
});
app.patch("/api/admin/members/:id/adjust-expiry", requireSuperAdmin, async (req, res) => {
  const { days, note = "" } = req.body;
  if (days === undefined || days === 0) return res.status(400).json({ error: "days required (positive or negative)" });
  const member = await prisma.groupMember.findUnique({ where: { id: req.params.id } });
  if (!member) return res.status(404).json({ error: "Member not found" });
  const base = member.expiresAt && new Date(member.expiresAt) > new Date() ? new Date(member.expiresAt) : new Date();
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const updated = await prisma.groupMember.update({
    where: { id: req.params.id },
    data: {
      expiresAt:            newExpiry,
      expiryAdjustmentDays: (member.expiryAdjustmentDays || 0) + days,
      expiryAdjustedAt:     new Date(),
      expiryAdjustedNote:   note || null,
    },
  });
  console.log("[ADMIN] Expiry adjusted for", member.name, "by", days, "days. Total:", updated.expiryAdjustmentDays, "days");
  res.json({ ok: true, member: updated, newExpiry, totalAdjustmentDays: updated.expiryAdjustmentDays });
});

app.post("/api/admin/users/email", requireSuperAdmin, async (req, res) => {
  const { userId, subject, body: msgBody } = req.body;
  if (!userId || !subject || !msgBody) return res.status(400).json({ error: "userId, subject and body required" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  try {
    const html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;background:#0a0a0f;color:#f0f0f8'>" +
      "<div style='font-size:22px;font-weight:800;color:#fff;margin-bottom:28px'>⚡ Split<span style='color:#7c6aff'>Subs</span></div>" +
      "<div style='background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px'>" +
      "<h1 style='font-size:22px;font-weight:700;margin:0 0 12px;color:#fff'>" + subject + "</h1>" +
      "<p style='font-size:15px;color:#aaaacc'>Hi <strong style='color:#fff'>" + user.name + "</strong>,</p>" +
      "<div style='font-size:15px;line-height:1.65;color:#aaaacc;white-space:pre-wrap'>" + msgBody + "</div>" +
      "<hr style='border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0'/>" +
      "<p style='font-size:13px;color:#666688'>— SplitSubs Admin Team</p>" +
      "</div></div>";
    await emailService.sendEmail({ to: user.email, subject, html });
    console.log("[ADMIN] Email sent to user:", user.email);
    res.json({ ok: true, message: "Email sent to " + user.name + "." });
  } catch (err) {
    console.error("User email failed:", err.message);
    res.status(500).json({ error: "Could not send email" });
  }
});

