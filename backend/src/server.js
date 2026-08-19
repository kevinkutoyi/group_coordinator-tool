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
const crypto      = require("crypto");

const app    = express();
app.set("trust proxy", 1);
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3001;
const DEFAULT_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "8");
const DEFAULT_KES_PER_USD = parseFloat(process.env.KES_PER_USD || "130");
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_in_production";

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use('/api/inbound/email', express.raw({ type: '*/*' })); // raw body needed for Svix signature verification
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

// USD→KES rate, admin-configurable from Settings (fluctuates with the real
// market rate — see the "Currency" card next to Platform Fee).
async function getPlatformKesRate() {
  try {
    const s = await prisma.platformSettings.findUnique({ where: { id: 1 } });
    return s?.kesPerUsd ?? DEFAULT_KES_PER_USD;
  } catch { return DEFAULT_KES_PER_USD; }
}

// discountPercent is taken off the total for the chosen duration (e.g. 6
// months at 4% off = pricePerSlot * 6 * 0.96), not off the per-month rate.
async function calcFee(amount, months = 1, discountPercent = 0) {
  const feePercent    = await getPlatformFeePercent();
  const grossTotal     = +(amount * months).toFixed(2);
  const memberPays    = +(grossTotal * (1 - discountPercent / 100)).toFixed(2);
  const platformFee   = +(memberPays * feePercent / 100).toFixed(2);
  const moderatorOwed = +(memberPays - platformFee).toFixed(2);
  return { base: grossTotal, memberPays, platformFee, moderatorOwed,
           feePercent, organizerGets: moderatorOwed, discountPercent };
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
// `category` groups services for the "Browse by Category" cards on the
// frontend Browse Groups page (see CATEGORY_ORDER in GroupsPage.js) — use
// one of: "Streaming & Entertainment", "AI & Productivity",
// "Social Media Accounts", "Design & Creativity", "Security, VPNs & Proxies",
// "E-books and Manuals", "Tech Help & Services".
const SERVICES = [
  // ── Streaming & Entertainment ──────────────────────────────────────────
  { id: "spotify",  name: "Spotify",         icon: "🎵", category: "Streaming & Entertainment",
    plans: [{ name: "Premium Duo", price: 16.99, maxSlots: 2 },
            { name: "Premium Family", price: 17.99, maxSlots: 6 }] },
  { id: "netflix",  name: "Netflix",          icon: "🎬", category: "Streaming & Entertainment",
    plans: [{ name: "Standard", price: 15.49, maxSlots: 2 },
            { name: "Premium",  price: 22.99, maxSlots: 4 }] },
  { id: "youtube",  name: "YouTube Premium",  icon: "▶️", category: "Streaming & Entertainment",
    plans: [{ name: "Family Plan", price: 22.99, maxSlots: 6 }] },
  { id: "dstv",     name: "DStv",              icon: "📡", category: "Streaming & Entertainment",
    plans: [{ name: "Compact",      price: 32.00, maxSlots: 4 },
            { name: "Compact Plus", price: 56.00, maxSlots: 5 }] },
  { id: "apple",    name: "Apple One",        icon: "🍎", category: "Streaming & Entertainment",
    plans: [{ name: "Family", price: 25.95, maxSlots: 6 }] },
  { id: "disney",   name: "Disney+",          icon: "🏰", category: "Streaming & Entertainment",
    plans: [{ name: "Standard", price: 7.99, maxSlots: 4 },
            { name: "Premium",  price: 13.99, maxSlots: 4 }] },
  { id: "hbo",      name: "Max (HBO)",        icon: "👑", category: "Streaming & Entertainment",
    plans: [{ name: "Ultimate", price: 20.99, maxSlots: 4 }] },

  // ── AI & Productivity ──────────────────────────────────────────────────
  { id: "chatgpt",  name: "ChatGPT Plus",     icon: "🤖", category: "AI & Productivity",
    plans: [{ name: "Family Plan", price: 30.00, maxSlots: 5 }] },
  { id: "claude",   name: "Claude AI",        icon: "✨", category: "AI & Productivity",
    plans: [{ name: "Claude Max 5x", price: 100.00, maxSlots: 5 }] },
  { id: "gemini",   name: "Gemini (Google AI Pro)", icon: "♊", category: "AI & Productivity",
    plans: [{ name: "AI Pro", price: 19.99, maxSlots: 3 }] },

  // ── Social Media Accounts ──────────────────────────────────────────────
  { id: "x",        name: "X Premium+",       icon: "𝕏", category: "Social Media Accounts",
    plans: [{ name: "Premium+", price: 40.00, maxSlots: 3 }] },
  { id: "facebook", name: "Meta Verified",    icon: "📘", category: "Social Media Accounts",
    plans: [{ name: "Verified", price: 14.99, maxSlots: 2 }] },
  { id: "binance",  name: "Binance",          icon: "🔶", category: "Social Media Accounts",
    plans: [{ name: "Account", price: 20.00, maxSlots: 2 }] },

  // ── Design & Creativity ─────────────────────────────────────────────────
  { id: "canva",    name: "Canva",            icon: "🎨", category: "Design & Creativity",
    plans: [{ name: "Business", price: 25.00, maxSlots: 5 }] },
  { id: "revoicer", name: "Revoicer",         icon: "🎙️", category: "Design & Creativity",
    plans: [{ name: "PRO", price: 47.00, maxSlots: 3 }] },

  // ── Security, VPNs & Proxies ─────────────────────────────────────────────
  { id: "nordvpn",  name: "NordVPN",          icon: "🛡️", category: "Security, VPNs & Proxies",
    plans: [{ name: "Complete", price: 14.99, maxSlots: 4 }] },

  // ── E-books and Manuals ─────────────────────────────────────────────────
  // Same "pool money, unlock the shared file" model as everything else —
  // the download link/notes go in the group's Credential Vault after payment.
  { id: "ebooks",       name: "E-books Bundle",   icon: "📚", category: "E-books and Manuals",
    plans: [{ name: "Digital Library Bundle", price: 15.00, maxSlots: 5 }] },
  { id: "howto-guides", name: "How-To Guides",    icon: "📖", category: "E-books and Manuals",
    plans: [{ name: "Guide Pack", price: 10.00, maxSlots: 5 }] },

  // ── Tech Help & Services ────────────────────────────────────────────────
  // Not a cost-split — each of these is a one-off job. maxSlots is fixed at
  // 1 so it's a single customer paying, then the moderator's contact info /
  // scheduling details go in the Credential Vault to arrange the actual work.
  { id: "tech-setup",        name: "Setup & Installation", icon: "🖥️", category: "Tech Help & Services",
    plans: [{ name: "Quick Setup", price: 15.00, maxSlots: 1 }] },
  { id: "tech-design",       name: "Design Services",      icon: "🖌️", category: "Tech Help & Services",
    plans: [{ name: "Design Job", price: 25.00, maxSlots: 1 }] },
  { id: "tech-network",      name: "Network & Internet",   icon: "📶", category: "Tech Help & Services",
    plans: [{ name: "Network Setup", price: 20.00, maxSlots: 1 }] },
  { id: "tech-troubleshoot", name: "Troubleshooting",      icon: "🔧", category: "Tech Help & Services",
    plans: [{ name: "Quick Fix", price: 12.00, maxSlots: 1 }] },
];

const SUBSCRIPTION_DURATIONS = [
  { months: 1,  label: "1 Month",   discount: 0 },
  { months: 3,  label: "3 Months",  discount: 2 },
  { months: 6,  label: "6 Months",  discount: 4 },
  { months: 9,  label: "9 Months",  discount: 6 },
  { months: 12, label: "12 Months", discount: 8 },
];
const ALLOWED_DURATION_MONTHS = SUBSCRIPTION_DURATIONS.map(d => d.months);

const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };

// ═══════════════════════════════════════════════════════════════════════════
//  USER AUTH
// ═══════════════════════════════════════════════════════════════════════════

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role = "customer", phone = "", newsletter = true, ref = "" } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
    if (!["customer", "moderator"].includes(role)) return res.status(400).json({ error: "role must be customer or moderator" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const emailCheck = await validateEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });

    const cleanEmail = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    // Referral code is just the referrer's own User.id (?ref=<userId> on the
    // signup link) — only stored if it actually resolves to a real user, so
    // a bad/forged value silently just means no referral, not an error.
    let referredBy = null;
    if (ref && typeof ref === "string") {
      const referrer = await prisma.user.findUnique({ where: { id: ref.trim() } });
      if (referrer) referredBy = referrer.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const code = genOtp();
    const codeHash = await bcrypt.hash(code, 8);

    await prisma.emailOtp.deleteMany({ where: { email: cleanEmail, purpose: "signup" } });
    await prisma.emailOtp.create({
      data: {
        email: cleanEmail, codeHash, purpose: "signup",
        payload: { name: name.trim(), passwordHash, phone: (phone || "").trim(), role, newsletter: newsletter !== false, referredBy },
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
        referredBy: p.referredBy || null,
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
    const cleanEmail = email.toLowerCase().trim();

    // Superadmin signs in through this same email/password form — no
    // separate admin login page or username field. Identity is ADMIN_EMAIL
    // (falls back to ADMIN_USERNAME for older configs that only set that),
    // password is ADMIN_PASSWORD — checked against env vars, not a User
    // row, but the resulting session carries the same superadmin rights.
    const adminIdentity = (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "admin@splitsubs.com").toLowerCase().trim();
    if (cleanEmail === adminIdentity) {
      if (password !== (process.env.ADMIN_PASSWORD || "admin"))
        return res.status(401).json({ error: "Invalid credentials" });
      const token = signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h");
      return res.json({ token, user: { id: "superadmin", name: "Super Admin", role: "superadmin" } });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
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

// ─── SplitCoins ───────────────────────────────────────────────────────────
// 1 SplitCoin = KES 10. Balance is always derived (SUM(amount)), never
// cached — a user who's never earned coins simply has zero ledger rows,
// which naturally reduces to 0 SplitCoins / KES 0.
app.get("/api/splitcoins/me", requireAuth, async (req, res) => {
  const recipientId = req.user.role === "superadmin" ? SPLITCOIN_PLATFORM_WALLET : req.user.id;
  const [rows, history] = await Promise.all([
    prisma.splitCoinTransaction.findMany({ where: { recipientId } }),
    prisma.splitCoinTransaction.findMany({ where: { recipientId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const balance = rows.reduce((sum, r) => sum + r.amount, 0);
  const earnedFromPurchases = rows.filter(r => r.sourceType === "purchase").reduce((sum, r) => sum + r.amount, 0);
  const earnedFromReferrals = rows.filter(r => r.sourceType === "referral").reduce((sum, r) => sum + r.amount, 0);
  const isSuperAdmin = req.user.role === "superadmin";
  res.json({
    balance,
    // KES value is admin-only for now — regular users/moderators should not
    // learn the coin-to-KES exchange rate, so this field is simply omitted
    // (not sent as 0/null) rather than hidden client-side only.
    ...(isSuperAdmin ? { kesValue: Math.round(balance * 10 * 100) / 100 } : {}),
    earnedFromPurchases, earnedFromReferrals,
    referralCode: isSuperAdmin ? null : req.user.id,
    history,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN AUTH — superadmin now signs in through /api/auth/login above,
//  using the same email/password form as everyone else. This standalone
//  admin/login route (separate username field, no User row) is retired.
// ═══════════════════════════════════════════════════════════════════════════

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

app.get("/api/admin/confirmed-payments", requireSuperAdmin, async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { confirmedAt: { not: null } },
    include: {
      group: { select: { id: true, serviceName: true, serviceIcon: true, planName: true, organizerName: true } },
      user:  { select: { email: true } },
    },
    orderBy: { confirmedAt: "desc" },
  });
  res.json(payments.map(p => ({
    id: p.id, memberName: p.memberName, email: p.user?.email || "",
    amount: p.amount, months: p.months, confirmedAt: p.confirmedAt,
    group: p.group,
  })));
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

// Renew date + subscription cost are sensitive financial info — only the
// group's own organizer (moderator) or a superadmin should ever see them.
//
// liveFeePercent is the CURRENT platform rate (from Settings), not
// group.feePercent (a snapshot frozen at group-creation time) — this
// projection should track the same rate real payments actually use,
// otherwise it silently drifts out of sync after any fee change.
function computeGroupFinancials(group, liveFeePercent) {
  const feePercent   = liveFeePercent ?? group.feePercent ?? 8;
  const confirmed    = (group.members || []).filter(m => m.role !== "organizer" && m.paymentStatus === "confirmed").length;
  const monthlyRevenue = +(confirmed * (group.pricePerSlot || 0) * (1 - feePercent / 100)).toFixed(2);
  const subscriptionCost = group.subscriptionCost || 0;
  const profit = +(monthlyRevenue - subscriptionCost).toFixed(2);
  return { monthlyRevenue, profit };
}

function sanitizeGroupFinancials(group, viewerRole, viewerId, liveFeePercent) {
  const canSeeFinancials = viewerRole === "superadmin" || (viewerRole === "moderator" && viewerId === group.organizerId);
  if (canSeeFinancials) {
    const { monthlyRevenue, profit } = computeGroupFinancials(group, liveFeePercent);
    return { ...group, monthlyRevenue, profit };
  }
  // Payment log (per-member amounts, platform fee, moderator payout) is
  // financial detail for the admin/owning organizer only — not for other
  // moderators or customers browsing/viewing the group.
  return { ...group, renewDate: null, subscriptionCost: null, monthlyRevenue: null, profit: null, payments: [] };
}

function urlSlugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

app.get("/sitemap.xml", async (req, res) => {
  try {
    const base = process.env.FRONTEND_URL || "https://splitsubs.com";
    // Mirrors CATEGORY_ORDER in frontend/src/pages/GroupsPage.js (which
    // slugifies the same way, via frontend/src/slugify.js) — one URL per
    // Browse Groups category, plus the synthetic "All Listings" page.
    const categorySlugs = ["all-listings", ...new Set(SERVICES.map(s => urlSlugify(s.category)))];
    const urls = [
      { loc: base + "/", changefreq: "daily", priority: "1.0" },
      { loc: base + "/groups", changefreq: "hourly", priority: "0.9" },
      ...categorySlugs.map(slug => ({ loc: base + "/groups/" + slug, changefreq: "daily", priority: "0.8" })),
      { loc: base + "/blog", changefreq: "daily", priority: "0.7" },
      { loc: base + "/terms", changefreq: "monthly", priority: "0.3" },
      { loc: base + "/privacy", changefreq: "monthly", priority: "0.3" },
      { loc: base + "/refund-policy", changefreq: "monthly", priority: "0.3" },
      { loc: base + "/data-protection", changefreq: "monthly", priority: "0.3" },
    ];

    const groups = await prisma.group.findMany({
      where: { reviewStatus: "approved", status: { in: ["open", "full"] } },
      select: { id: true, serviceName: true, planName: true, updatedAt: true },
    });
    for (const g of groups) {
      const slug = urlSlugify(g.serviceName + " " + g.planName);
      urls.push({
        loc: base + "/group/" + (slug ? slug + "-" : "") + g.id,
        changefreq: "daily",
        priority: "0.8",
        lastmod: g.updatedAt ? new Date(g.updatedAt).toISOString().split("T")[0] : undefined,
      });
    }

    const posts = await prisma.blogPost.findMany({
      where: { status: "published", reviewStatus: "approved", noIndex: { not: true } },
      select: { slug: true, updatedAt: true, publishedAt: true },
    });
    for (const p of posts) {
      urls.push({
        loc: base + "/blog/" + p.slug,
        changefreq: "weekly",
        priority: "0.6",
        lastmod: (p.updatedAt || p.publishedAt) ? new Date(p.updatedAt || p.publishedAt).toISOString().split("T")[0] : undefined,
      });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` +
      urls.map(u => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>
` : "") +
        `    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n") +
      `
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("[SITEMAP] Error:", err.message);
    res.status(500).send("Error generating sitemap");
  }
});

app.get("/api/groups", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest", viewerId = null;
  try { const d = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET); viewerRole = d.role; viewerId = d.id; } catch {}

  const where = viewerRole === "superadmin" ? {}
    : viewerRole === "moderator" && viewerId ? { OR: [{ reviewStatus: "approved" }, { organizerId: viewerId }] }
    : { reviewStatus: "approved" };

  const groups = await prisma.group.findMany({ where, include: { members: true, payments: true }, orderBy: { createdAt: "desc" } });
  const liveFeePercent = (viewerRole === "superadmin" || viewerRole === "moderator") ? await getPlatformFeePercent() : null;

  // One aggregate query for every group's rating (not N+1) — cheap enough to
  // include on every card in the Browse Groups grid.
  const reviewStats = await prisma.groupReview.groupBy({ by: ["groupId"], _avg: { rating: true }, _count: { rating: true } });
  const reviewByGroup = Object.fromEntries(reviewStats.map(r => [r.groupId, { avgRating: +r._avg.rating.toFixed(1), reviewCount: r._count.rating }]));

  res.json(groups.map(g => {
    const confirmed = g.members.filter(m => m.role !== "organizer" && m.paymentStatus === "confirmed");
    const sortedConfirmed = confirmed.slice().sort((a, b) =>
      new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0)
    );
    const confirmedMaskedEmails = sortedConfirmed.map(m => maskEmail(m.email)).filter(Boolean);
    const base = {
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
      avgRating: reviewByGroup[g.id]?.avgRating || null,
      reviewCount: reviewByGroup[g.id]?.reviewCount || 0,
    };
    return sanitizeGroupFinancials(base, viewerRole, viewerId, liveFeePercent);
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

  const liveFeePercent = (isSuperAdmin || isOwner) ? await getPlatformFeePercent() : null;
  res.json(sanitizeGroupFinancials(group, viewerRole, viewerId, liveFeePercent));
});

app.post("/api/groups", requireRole("moderator", "superadmin"), async (req, res) => {
  const { renewDate, serviceId, planName, totalPrice, maxSlots, description, billingCycle = "monthly", subscriptionCost } = req.body;
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
      renewDate:     renewDate ? new Date(renewDate) : null,
      subscriptionCost: subscriptionCost ? +subscriptionCost : 0,
      status:       isSuperAdmin ? "open"     : "pending_review",
      reviewStatus: isSuperAdmin ? "approved" : "pending",
    },
  });
  res.status(201).json(group);
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP REVIEWS — 5-star rating, one per (group, confirmed paying member)
// ═══════════════════════════════════════════════════════════════════════════

// "Jane Doe" -> "Jane D." — first name kept, surname reduced to an initial
// so reviews don't publish a member's full name.
function reviewerDisplayName(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

function summarizeReviews(reviews) {
  const count = reviews.length;
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews) breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
  const avg = count ? reviews.reduce((a, r) => a + r.rating, 0) / count : 0;
  const recommend = count ? reviews.filter(r => r.rating >= 4).length / count : 0;
  return {
    count,
    average: +avg.toFixed(1),
    recommendPercent: Math.round(recommend * 100),
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([star, n]) => [star, count ? Math.round((n / count) * 100) : 0])
    ),
  };
}

app.get("/api/groups/:id/reviews", async (req, res) => {
  const groupId = req.params.id;
  const authHeader = req.headers.authorization || "";
  let viewerId = null;
  try { viewerId = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET).id; } catch {}

  const reviews = await prisma.groupReview.findMany({
    where: { groupId }, orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });
  const summary = summarizeReviews(reviews);

  let canReview = false, myReview = null;
  if (viewerId) {
    const [membership, existing] = await Promise.all([
      prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: viewerId } } }),
      prisma.groupReview.findUnique({ where: { groupId_userId: { groupId, userId: viewerId } } }),
    ]);
    canReview = !!membership && membership.paymentStatus === "confirmed" && membership.role !== "organizer";
    myReview = existing;
  }

  res.json({
    summary,
    reviews: reviews.map(r => ({
      id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
      reviewerName: reviewerDisplayName(r.user?.name),
    })),
    canReview, myReview,
  });
});

app.post("/api/groups/:id/reviews", requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const { rating, comment = "" } = req.body;
  const stars = parseInt(rating, 10);
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: "rating must be 1-5" });
  if (comment.length > 500) return res.status(400).json({ error: "Review is too long (max 500 characters)" });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user.id } } });
  if (!membership || membership.paymentStatus !== "confirmed" || membership.role === "organizer")
    return res.status(403).json({ error: "Only members with a confirmed payment on this group can leave a review." });

  const review = await prisma.groupReview.upsert({
    where: { groupId_userId: { groupId, userId: req.user.id } },
    update: { rating: stars, comment: comment.trim() },
    create: { groupId, userId: req.user.id, rating: stars, comment: comment.trim() },
  });
  res.json(review);
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP PROFILES (Netflix-style multi-profile PIN assignment)
// ═══════════════════════════════════════════════════════════════════════════

// List/manage profiles — shape depends on requester
app.get("/api/groups/:id/profiles", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const isOrganizer = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const canManage = isOrganizer || isSuperAdmin || req.user.role === "moderator";

  const profiles = await prisma.groupProfile.findMany({
    where: { groupId: req.params.id },
    include: { members: { select: { id: true, name: true, userId: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (canManage) {
    return res.json({
      role: "admin",
      profiles: profiles.map(p => ({
        id: p.id, name: p.name, pin: p.pin,
        assignedTo: p.members[0] ? { memberId: p.members[0].id, name: p.members[0].name } : null,
      })),
    });
  }

  const myMember = await prisma.groupMember.findFirst({
    where: { groupId: req.params.id, userId: req.user.id, paymentStatus: "confirmed" },
    include: { profile: true },
  });

  if (!myMember) return res.json({ role: "none" });

  if (myMember.profile) {
    return res.json({ role: "member", myProfile: { name: myMember.profile.name, pin: myMember.profile.pin } });
  }

  const taken = new Set(profiles.filter(p => p.members.length > 0).map(p => p.id));
  return res.json({
    role: "member",
    myProfile: null,
    available: profiles.filter(p => !taken.has(p.id)).map(p => ({ id: p.id, name: p.name })),
  });
});

// Create a profile (admin/organizer)
app.post("/api/groups/:id/profiles", requireRole("moderator", "superadmin"), async (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: "name and pin required" });
  const profile = await prisma.groupProfile.create({
    data: { groupId: req.params.id, name, pin },
  });
  console.log("[PROFILE] Created", name, "for group", req.params.id);
  res.json({ ok: true, profile });
});

// Edit a profile (admin/organizer)
app.patch("/api/groups/:id/profiles/:profileId", requireRole("moderator", "superadmin"), async (req, res) => {
  const { name, pin } = req.body;
  const profile = await prisma.groupProfile.update({
    where: { id: req.params.profileId },
    data: { ...(name && { name }), ...(pin && { pin }) },
  });
  res.json({ ok: true, profile });
});

// Delete a profile (admin/organizer) — unassigns any member first
app.delete("/api/groups/:id/profiles/:profileId", requireRole("moderator", "superadmin"), async (req, res) => {
  await prisma.groupMember.updateMany({ where: { profileId: req.params.profileId }, data: { profileId: null, profileSelectedAt: null } });
  await prisma.groupProfile.delete({ where: { id: req.params.profileId } });
  res.json({ ok: true });
});

// Member self-selects a profile (once, locked after)
app.post("/api/groups/:id/profiles/:profileId/select", requireAuth, async (req, res) => {
  const myMember = await prisma.groupMember.findFirst({
    where: { groupId: req.params.id, userId: req.user.id, paymentStatus: "confirmed" },
  });
  if (!myMember) return res.status(403).json({ error: "Not a confirmed member of this group" });
  if (myMember.profileId) return res.status(400).json({ error: "You already selected a profile" });

  const already = await prisma.groupMember.findFirst({ where: { profileId: req.params.profileId } });
  if (already) return res.status(409).json({ error: "That profile was just taken by someone else" });

  const updated = await prisma.groupMember.update({
    where: { id: myMember.id },
    data: { profileId: req.params.profileId, profileSelectedAt: new Date() },
    include: { profile: true },
  });
  console.log("[PROFILE] Member", req.user.id, "selected profile", req.params.profileId);
  res.json({ ok: true, myProfile: { name: updated.profile.name, pin: updated.profile.pin } });
});

// Admin manually assigns/reassigns a member to a profile (backup override)
app.patch("/api/admin/members/:id/assign-profile", requireRole("moderator", "superadmin"), async (req, res) => {
  const { profileId } = req.body;
  if (profileId) {
    await prisma.groupMember.updateMany({ where: { profileId, id: { not: req.params.id } }, data: { profileId: null, profileSelectedAt: null } });
  }
  const updated = await prisma.groupMember.update({
    where: { id: req.params.id },
    data: { profileId: profileId || null, profileSelectedAt: profileId ? new Date() : null },
  });
  console.log("[PROFILE] Admin assigned member", req.params.id, "to profile", profileId);
  res.json({ ok: true, member: updated });
});

app.patch("/api/groups/:id/renew-date", requireRole("moderator", "superadmin"), async (req, res) => {
  const { renewDate } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (req.user.role !== "superadmin" && group.organizerId !== req.user.id)
    return res.status(403).json({ error: "Only this group's organizer or an admin can update its renew date" });
  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: {
      renewDate: renewDate ? new Date(renewDate) : null,
      renewReminderSent: false, // reset so reminder can be sent again
    },
  });
  console.log("[GROUP] Renew date set for", group.serviceName, group.planName, "->", renewDate);
  res.json({ ok: true, group: updated });
});

app.patch("/api/groups/:id/subscription-cost", requireRole("moderator", "superadmin"), async (req, res) => {
  const { subscriptionCost } = req.body;
  if (subscriptionCost === undefined || subscriptionCost === null || isNaN(+subscriptionCost) || +subscriptionCost < 0)
    return res.status(400).json({ error: "subscriptionCost must be a non-negative number" });
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (req.user.role !== "superadmin" && group.organizerId !== req.user.id)
    return res.status(403).json({ error: "Only this group's organizer or an admin can update its subscription cost" });
  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: { subscriptionCost: +subscriptionCost },
  });
  console.log("[GROUP] Subscription cost set for", group.serviceName, group.planName, "->", subscriptionCost);
  res.json({ ok: true, group: updated });
});

app.patch("/api/groups/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.organizerId !== req.user.id && req.user.role !== "superadmin")
    return res.status(403).json({ error: "Forbidden" });
  // A moderator's own listing can't be flipped to open/closed before the
  // admin has reviewed it — that would let it start accepting members while
  // still bypassing the approval queue. Superadmin is exempt.
  if (req.user.role !== "superadmin" && group.reviewStatus === "pending")
    return res.status(403).json({ error: "This listing is still awaiting admin approval and can't be reopened or closed yet." });
  res.json(await prisma.group.update({ where: { id: req.params.id }, data: { status } }));
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/groups/:id/join", requireRole("customer", "moderator", "superadmin"), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open") return res.status(400).json({ error: "Group is not accepting new members" });

  // Customer picks how many months to pay upfront (1/3/6/9/12); falls back
  // to the group's billing cycle if not provided or not a recognized option.
  const requestedMonths = parseInt(req.body?.months, 10);
  const fixedMonths = ALLOWED_DURATION_MONTHS.includes(requestedMonths) ? requestedMonths : (CYCLE_MONTHS[group.billingCycle] || 1);
  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === fixedMonths) || SUBSCRIPTION_DURATIONS[0];
  const payingMembers   = group.members.filter(m => m.role !== "organizer");
  const confirmedMembers = payingMembers.filter(m => m.paymentStatus === "confirmed");

  // Only CONFIRMED payments occupy slots. Pending members don't block new joins.
  if (confirmedMembers.length >= group.maxSlots) return res.status(400).json({ error: "Group is full" });
  if (group.members.find(m => m.userId === req.user.id)) return res.status(400).json({ error: "You are already a member of this group" });
  if (group.organizerId === req.user.id) return res.status(400).json({ error: "You are the organizer of this group and do not pay for a slot" });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const fees   = await calcFee(group.pricePerSlot, fixedMonths, validDuration.discount);
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
  // Also used to change the chosen duration on a still-pending payment before
  // the customer actually pays (e.g. switching from 1 month to 6 months via
  // the duration dropdown) — recalculating fees here is harmless either way
  // since no payment has been captured yet.
  const requestedMonths = parseInt(req.body?.months, 10);
  const fixedMonths = ALLOWED_DURATION_MONTHS.includes(requestedMonths) ? requestedMonths : (CYCLE_MONTHS[group.billingCycle] || 1);
  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === fixedMonths) || SUBSCRIPTION_DURATIONS[0];
  const fees = await calcFee(group.pricePerSlot, fixedMonths, validDuration.discount);
  const updated = await prisma.groupMember.update({
    where: { id: member.id },
    data: {
      paymentStatus: "pending",
      memberPays:    fees.memberPays,
      platformFee:   fees.platformFee,
      organizerGets: fees.organizerGets,
      moderatorOwed: fees.moderatorOwed,
      months:        fixedMonths,
      durationLabel: validDuration.label,
      discount:      validDuration.discount,
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

// Bank/telco list for the moderator payout-details form — type=mobile_money
// for Kenyan M-Pesa/telcos, omitted for the full KES bank list.
app.get("/api/paystack/banks", requireAuth, async (req, res) => {
  try {
    const banks = await paystack.listBanks({ currency: "KES", type: req.query.type || undefined });
    res.json(banks);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
    const kesRate = await getPlatformKesRate();
    const { authorizationUrl } = await paystack.initializeTransaction({
      email: user.email, amount: member.memberPays,
      reference, callbackUrl, kesRate,
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
//  SPLITCOINS — rewards ledger
//  1 SplitCoin = KES 10. The ledger is append-only; a balance is always
//  SUM(amount) over a recipient's rows, never cached, so it can't drift.
//  recipientId holds either a real User.id or the reserved "platform"
//  sentinel (the platform has no own User row — distinct from the
//  "superadmin" JWT-identity sentinel used for auth elsewhere).
//  Every mint is keyed to (sourcePaymentId, reason) via a DB unique
//  constraint, using the Paystack reference (not the Payment row id) as
//  sourcePaymentId — that way even a duplicate Payment row from a raced
//  webhook can't double-mint, since both would share the same reference.
// ═══════════════════════════════════════════════════════════════════════════
const SPLITCOIN_PLATFORM_WALLET = "platform";
const PURCHASE_COINS_KES = 20; // 2 coins per confirmed purchase: 1 buyer + 0.5 owner + 0.5 platform
const REFERRAL_COINS_KES = 30; // 3 coins on a referred user's first confirmed purchase: 2 referrer + 1 platform
const OWNER_COIN_KES     = 5;  // the group owner's 0.5-coin slice of PURCHASE_COINS_KES

async function mintSplitCoin(reference, reason, sourceType, recipientId, amount, relatedUserId = null) {
  try {
    await prisma.splitCoinTransaction.create({
      data: { sourcePaymentId: reference, reason, sourceType, recipientId, amount, relatedUserId },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err; // P2002 = unique constraint hit, already minted — safe no-op
  }
}

async function awardPurchaseSplitCoins(payment) {
  // 2 SplitCoins per confirmed purchase: 1 to the buyer, 0.5 to the group
  // owner, 0.5 to the platform. If the owner IS the platform itself
  // (Group.organizerId === "superadmin"), the platform gets the full 1.0.
  const ref = payment.pesapalOrderId;
  const ownerId = payment.moderatorId;
  await mintSplitCoin(ref, "purchase_buyer", "purchase", payment.userId, 1);
  if (!ownerId || ownerId === "superadmin") {
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 1);
  } else {
    await mintSplitCoin(ref, "purchase_owner", "purchase", ownerId, 0.5);
    await mintSplitCoin(ref, "purchase_platform", "purchase", SPLITCOIN_PLATFORM_WALLET, 0.5);
  }
}

// Fires once — on the referred user's FIRST ever confirmed payment across any
// group: 2 SplitCoins to the referrer, 1 to the platform. `referrerId` is
// precomputed by determineReferralEligibility() BEFORE the Payment row is
// created (see confirmOrder) and threaded through here, rather than
// re-derived independently — so the fee deduction applied to this same
// payment and the coins actually minted can never disagree with each other.
async function awardReferralSplitCoinsIfEligible(payment, referrerId) {
  if (!referrerId) return;
  const ref = payment.pesapalOrderId;
  await mintSplitCoin(ref, "referral_referrer", "referral", referrerId, 2, payment.userId);
  await mintSplitCoin(ref, "referral_platform", "referral", SPLITCOIN_PLATFORM_WALLET, 1, payment.userId);
}

// Is the user about to receive their first-ever confirmed Payment, and do
// they have a referrer? Checked BEFORE the new Payment row is created (see
// confirmOrder) so a raced duplicate webhook/verify call for the same
// reference sees the identical answer on both concurrent attempts — neither
// has created its row yet, so both count 0 prior payments and agree. That
// keeps the fee deduction and the eventual referral mint from ever drifting
// apart, and the DB unique constraint on Payment.pesapalOrderId (migration
// 0014) plus the ledger's own unique (sourcePaymentId, reason) constraint
// are what actually prevent double-crediting if both attempts proceed.
async function determineReferralEligibility(userId) {
  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  if (!buyer?.referredBy) return null;
  const priorPayments = await prisma.payment.count({ where: { userId } });
  if (priorPayments > 0) return null;
  return buyer.referredBy;
}

// ── SplitCoins accounting: gross-vs-net revenue ─────────────────────────────
// SplitCoins are a REAL deduction, not a display estimate: their KES value
// (converted to USD at the live platform rate) is subtracted from the actual
// platformFee/moderatorOwed stored on the Payment row at confirmation time —
// see confirmOrder. The buyer's and the platform's own coin(s) always come
// out of platformFee (the platform funds its own loyalty program from its
// own cut, including the full referral cost); the group owner's 0.5 coin
// comes out of THEIR moderatorOwed specifically, since it's paid to them
// in lieu of cash. If the group is platform-owned there's no separate
// moderator, so the owner's share also comes out of platformFee instead.
// Both the Admin Dashboard and Moderator Dashboard read the resulting
// Payment.platformFee/moderatorOwed directly — there's only one real number,
// not two dashboards independently estimating a "net" figure.
function computeSplitCoinsDeduction({ moderatorId, referrerId }, kesRate) {
  const isPlatformOwned = !moderatorId || moderatorId === "superadmin";
  const platformKes = (isPlatformOwned ? PURCHASE_COINS_KES : PURCHASE_COINS_KES - OWNER_COIN_KES)
    + (referrerId ? REFERRAL_COINS_KES : 0);
  const ownerKes = isPlatformOwned ? 0 : OWNER_COIN_KES;
  const rate = kesRate || DEFAULT_KES_PER_USD;
  return {
    platformFeeDeductionUsd:   +(platformKes / rate).toFixed(4),
    moderatorOwedDeductionUsd: +(ownerKes / rate).toFixed(4),
  };
}
async function getSplitCoinsKesValue(where = {}) {
  const rows = await prisma.splitCoinTransaction.findMany({ where });
  return +(rows.reduce((sum, r) => sum + r.amount, 0) * 10).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared order-confirmation logic (used by both verify + IPN)
async function confirmOrder(reference) {
  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
  if (!order || order.status === "COMPLETED") return order;

  const txData = await paystack.verifyTransaction(reference, await getPlatformKesRate());
  const code   = txData.status;

  await prisma.paystackOrder.update({ where: { id: reference }, data: { paystackStatus: code } });

  if (code === "success") {
    const confirmedAt = new Date();
    // Renewing while still active extends from the CURRENT expiry, not from
    // today — otherwise renewing a few days early would forfeit whatever
    // time was left. A first-time join or a renewal after expiry has
    // nothing to extend from, so it starts counting from now instead.
    const existingMember = await prisma.groupMember.findUnique({ where: { id: order.memberId } });
    const base = existingMember?.expiresAt && new Date(existingMember.expiresAt) > confirmedAt
      ? new Date(existingMember.expiresAt)
      : confirmedAt;
    const exp = new Date(base);
    exp.setDate(exp.getDate() + (order.months || 1) * 31);

    await prisma.groupMember.update({ where: { id: order.memberId }, data: { paymentStatus: "confirmed", expiresAt: exp } });

    const alreadyRecorded = await prisma.payment.findFirst({ where: { pesapalOrderId: reference } });
    if (!alreadyRecorded) {
      // Decide referral eligibility and the resulting SplitCoins deduction
      // BEFORE creating the Payment row (see determineReferralEligibility /
      // computeSplitCoinsDeduction above for why) — the buyer still pays the
      // full sticker price via Paystack; this only changes how the already-
      // collected revenue is allocated between platformFee/moderatorOwed and
      // the SplitCoins ledger.
      const referrerId = await determineReferralEligibility(order.userId);
      const kesRate = await getPlatformKesRate();
      const { platformFeeDeductionUsd, moderatorOwedDeductionUsd } = computeSplitCoinsDeduction(
        { moderatorId: order.moderatorId, referrerId }, kesRate
      );
      const adjustedPlatformFee   = Math.max(0, +(order.platformFee - platformFeeDeductionUsd).toFixed(2));
      const adjustedModeratorOwed = Math.max(0, +(order.moderatorOwed - moderatorOwedDeductionUsd).toFixed(2));

      let paymentRow, justCreated = true;
      try {
        paymentRow = await prisma.payment.create({
          data: {
            groupId: order.groupId, memberId: order.memberId, userId: order.userId,
            memberName: order.memberName, months: order.months, amount: order.memberPays,
            platformFee: adjustedPlatformFee, moderatorOwed: adjustedModeratorOwed,
            grossPlatformFee: order.platformFee, grossModeratorOwed: order.moderatorOwed,
            organizerGets: adjustedModeratorOwed, moderatorId: order.moderatorId,
            method: "paystack", pesapalOrderId: reference, currency: order.currency,
            confirmedAt, payoutStatus: "pending",
          },
        });
      } catch (err) {
        if (err.code !== "P2002") throw err;
        // A concurrent duplicate webhook/verify call for this exact
        // reference won the race and already recorded it (the DB unique
        // constraint on pesapalOrderId — migration 0014 — is what actually
        // closes this, not just the alreadyRecorded check above). Don't
        // re-record, re-earn, re-mint, or re-email; just pick up the row
        // the winner created.
        paymentRow = await prisma.payment.findFirst({ where: { pesapalOrderId: reference } });
        justCreated = false;
      }

      if (justCreated && paymentRow) {
        await prisma.platformEarning.create({
          data: { orderId: reference, groupId: order.groupId, fee: adjustedPlatformFee, currency: order.currency, earnedAt: confirmedAt },
        });

        // SplitCoins — only ever runs for a confirmed, newly-recorded payment.
        await awardPurchaseSplitCoins(paymentRow);
        await awardReferralSplitCoinsIfEligible(paymentRow, referrerId);

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

// ═══════════════════════════════════════════════════════════════════════════
//  RESEND INBOUND EMAIL — OTP CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/inbound/email", async (req, res) => {
  const { Webhook } = require("svix");
  let event;
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
    event = wh.verify(req.body, {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch (err) {
    console.error("[INBOUND] Webhook signature verification failed:", err.message);
    return res.sendStatus(401);
  }
  res.sendStatus(200); // always respond quickly, after verification
  try {
    if (event.type !== "email.received") return;

    const emailId = event.data?.email_id;
    const toAddresses = event.data?.to || [];
    const subject = event.data?.subject || "";

    console.log("[INBOUND] Email received for:", toAddresses, "Subject:", subject);

    // Fetch full email content from Resend API
    const https = require("https");
    const emailContent = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.resend.com",
        path: "/emails/receiving/" + emailId,
        method: "GET",
        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY },
      };
      const req2 = https.request(options, res2 => {
        let data = "";
        res2.on("data", c => data += c);
        res2.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
      });
      req2.on("error", reject);
      req2.end();
    });

    const body = emailContent.text || emailContent.html || "";
    console.log("[INBOUND] Email body preview:", body.substring(0, 200));

    // Extract OTP — look for 4-8 digit codes
    const otpMatch = body.match(/\b(\d{4,8})\b/);
    const otp = otpMatch ? otpMatch[1] : null;

    if (!otp) {
      console.log("[INBOUND] No OTP found in email body");
      return;
    }

    console.log("[INBOUND] OTP extracted:", otp);

    // Find group by inbound email address
    for (const toAddr of toAddresses) {
      const group = await prisma.group.findFirst({
        where: { inboundEmail: { equals: toAddr, mode: "insensitive" } },
      });

      if (group) {
        await prisma.group.update({
          where: { id: group.id },
          data: {
            latestOtp:     otp,
            otpReceivedAt: new Date(),
            otpSubject:    subject,
          },
        });
        console.log("[INBOUND] OTP", otp, "saved to group:", group.serviceName, group.planName);
      } else {
        console.log("[INBOUND] No group found for email:", toAddr);
      }
    }
  } catch (err) {
    console.error("[INBOUND] Error:", err.message);
  }
});

// Get current OTP for a group (members only)
app.get("/api/groups/:id/otp", requireAuth, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });

  // Check if user is a confirmed member or organizer
  const isOrganizer = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const membership = await prisma.groupMember.findFirst({
    where: { groupId: group.id, userId: req.user.id, paymentStatus: "confirmed" },
  });

  if (!isOrganizer && !isSuperAdmin && !membership)
    return res.status(403).json({ error: "Access denied" });

  // OTP expires after 10 minutes
  const otpAge = group.otpReceivedAt
    ? (Date.now() - new Date(group.otpReceivedAt).getTime()) / 1000 / 60
    : null;
  const otpValid = otpAge !== null && otpAge < 10;

  res.json({
    otp:          otpValid ? group.latestOtp : null,
    subject:      otpValid ? group.otpSubject : null,
    receivedAt:   group.otpReceivedAt,
    expiresIn:    otpValid ? Math.round(10 - otpAge) : 0,
    inboundEmail: group.inboundEmail,
  });
});

// Set inbound email for a group (organizer/admin only)
app.patch("/api/groups/:id/inbound-email", requireRole("moderator", "superadmin"), async (req, res) => {
  const { inboundEmail } = req.body;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: { inboundEmail: inboundEmail || null },
  });
  console.log("[GROUP] Inbound email set:", inboundEmail, "for", group.serviceName);
  res.json({ ok: true, group: updated });
});

app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!paystack.verifyWebhookSignature(req.body, signature)) return res.status(400).json({ error: "Invalid signature" });
  res.sendStatus(200);
  try {
    const event = JSON.parse(req.body.toString());

    if (event.event === "charge.success") {
      const reference = event.data && event.data.reference;
      if (!reference) return;
      const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });
      if (!order || order.status === "COMPLETED") return;
      await confirmOrder(reference);
      console.log("Paystack webhook confirmed:", reference);
      return;
    }

    if (event.event === "transfer.success" || event.event === "transfer.failed" || event.event === "transfer.reversed") {
      const transferCode = event.data && event.data.transfer_code;
      if (!transferCode) return;
      const payout = await prisma.moderatorPayout.findFirst({ where: { transferCode } });
      if (!payout) return;

      const newStatus = event.event === "transfer.success" ? "success" : event.event === "transfer.failed" ? "failed" : "reversed";
      await prisma.moderatorPayout.update({
        where: { id: payout.id },
        data: { transferStatus: newStatus, transferError: newStatus === "success" ? null : (event.data.message || event.event) },
      });

      // A failed/reversed transfer means the moderator never actually got paid —
      // put those payments back in the queue so the admin can retry.
      if (newStatus !== "success" && payout.paymentIds && payout.paymentIds.length) {
        await prisma.payment.updateMany({
          where: { id: { in: payout.paymentIds }, payoutStatus: "paid" },
          data: { payoutStatus: "pending", paidAt: null, paidBy: null },
        });
      }
      console.log(`Paystack transfer webhook: ${transferCode} → ${newStatus}`);
      return;
    }
  } catch (err) { console.error("Webhook error:", err.message); }
});

// ── Resend delivery-status webhook ───────────────────────────────────────────
// Configure this URL (https://<your-domain>/api/webhooks/resend) in the Resend
// dashboard → Webhooks, subscribed to email.delivered / email.bounced /
// email.complained, then set RESEND_WEBHOOK_SECRET in .env to the "Signing
// Secret" it gives you. Until that's set up, email log rows just show
// "sent" (handed off ok) or "failed" (Resend rejected it) — the true
// delivered/bounced state only arrives via this webhook.
function verifyResendWebhook(rawBody, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const svixId = headers["svix-id"], svixTimestamp = headers["svix-timestamp"], svixSignature = headers["svix-signature"];
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;
  try {
    const secretBytes    = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent  = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected        = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    const candidates      = svixSignature.split(" ").map(s => s.split(",")[1]).filter(Boolean);
    return candidates.some(sig => {
      try { return crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64")); }
      catch { return false; }
    });
  } catch { return false; }
}

app.post("/api/webhooks/resend", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body.toString("utf8");
  if (!verifyResendWebhook(rawBody, req.headers)) return res.status(400).json({ error: "Invalid signature" });
  res.sendStatus(200);
  try {
    const event   = JSON.parse(rawBody);
    const emailId = event?.data?.email_id;
    const statusMap = {
      "email.delivered": "delivered", "email.bounced": "bounced",
      "email.complained": "complained", "email.delivery_delayed": "delayed",
    };
    const newStatus = statusMap[event.type];
    if (!emailId || !newStatus) return;
    await prisma.emailLog.updateMany({ where: { resendId: emailId }, data: { status: newStatus } });
    console.log(`📬 Resend webhook: ${event.type} → ${emailId}`);
  } catch (err) { console.error("Resend webhook error:", err.message); }
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
//  SUPER ADMIN — DASHBOARD OVERVIEW (KPIs, needs-attention, products, activity)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/dashboard", requireSuperAdmin, async (req, res) => {
  const now = new Date();
  const kesRate = await getPlatformKesRate();

  // Date range for the period-over-period counters (defaults to last 7 days).
  const to   = req.query.to   ? new Date(req.query.to)   : now;
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday   = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  // The Logs sidebar view reuses this same feed but asks for more rows.
  const activityLimit = Math.min(parseInt(req.query.limit, 10) || 8, 100);
  const perSourceTake  = Math.ceil(activityLimit / 2);

  const [
    revenuePayments,
    commissionEarnings,
    activeMemberRows,
    newCustomers,
    newConfirmedPayments,
    pendingPaymentsCount,
    expiringTodayCount,
    groupsAtCapacity,
    supportThreads,
    productGroups,
    recentGroups,
    recentPayments,
    recentApprovals,
  ] = await Promise.all([
    prisma.payment.findMany({ where: { confirmedAt: { gte: from, lte: to } }, select: { amount: true } }),
    prisma.platformEarning.findMany({ where: { earnedAt: { gte: from, lte: to } }, select: { fee: true } }),
    prisma.groupMember.findMany({
      where: { paymentStatus: "confirmed", role: { not: "organizer" }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { userId: true },
    }),
    prisma.user.count({ where: { role: "customer", createdAt: { gte: from, lte: to } } }),
    prisma.payment.count({ where: { confirmedAt: { gte: from, lte: to } } }),
    prisma.groupMember.count({ where: { paymentStatus: "pending", role: { not: "organizer" } } }),
    prisma.groupMember.count({ where: { paymentStatus: "confirmed", expiresAt: { gte: startOfToday, lt: endOfToday } } }),
    prisma.group.count({ where: { status: "full" } }),
    prisma.supportThread.findMany({ where: { unreadByAdmin: { gt: 0 } }, select: { id: true } }),
    prisma.group.findMany({ where: { status: { in: ["open", "full"] } }, include: { members: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.group.findMany({ orderBy: { createdAt: "desc" }, take: perSourceTake, select: { id: true, serviceName: true, planName: true, organizerName: true, createdAt: true } }),
    prisma.payment.findMany({ orderBy: { confirmedAt: "desc" }, take: perSourceTake, select: { id: true, memberName: true, groupId: true, confirmedAt: true, amount: true } }),
    prisma.user.findMany({ where: { approvedAt: { not: null } }, orderBy: { approvedAt: "desc" }, take: perSourceTake, select: { id: true, name: true, approvedAt: true } }),
  ]);

  // Total Revenue = Revenue + Commissions. Commissions come from PlatformEarning
  // (the same source the Platform Earnings page sums), and Revenue is what's left
  // over for moderators/organizers once the platform's cut is taken out.
  const totalRevenueUSD  = revenuePayments.reduce((a, p) => a + (p.amount || 0), 0);
  const commissionsUSD   = commissionEarnings.reduce((a, e) => a + (e.fee || 0), 0);
  const revenueUSD       = totalRevenueUSD - commissionsUSD;
  const activeCustomers  = new Set(activeMemberRows.map(m => m.userId)).size;

  // "Your Products" — each group is one product row, ranked by how full it is.
  const yourProducts = productGroups.map(g => {
    const filled = g.members.filter(m => m.role !== "organizer" && m.paymentStatus === "confirmed").length;
    const pct    = g.maxSlots > 0 ? Math.round((filled / g.maxSlots) * 100) : 0;
    const health = pct >= 100 ? "Full" : pct >= 85 ? "Healthy" : "Moderate";
    return { id: g.id, serviceName: g.serviceName, planName: g.planName, serviceIcon: g.serviceIcon, filled, maxSlots: g.maxSlots, pct, health };
  }).sort((a, b) => b.pct - a.pct).slice(0, 6);

  // Recent activity — merged from real events only (no fabricated log entries).
  const groupNameById = Object.fromEntries(productGroups.map(g => [g.id, g.serviceName + " " + g.planName]));
  const activity = [
    ...recentGroups.map(g => ({
      id: "g_" + g.id, type: "group_created", timestamp: g.createdAt,
      text: `${g.organizerName} created a new ${g.serviceName} ${g.planName} subscription`,
    })),
    ...recentPayments.map(p => ({
      id: "p_" + p.id, type: "payment_confirmed", timestamp: p.confirmedAt,
      text: `${p.memberName} confirmed a payment${groupNameById[p.groupId] ? " for " + groupNameById[p.groupId] : ""}`,
    })),
    ...recentApprovals.map(u => ({
      id: "u_" + u.id, type: "moderator_approved", timestamp: u.approvedAt,
      text: `${u.name} was approved as a moderator`,
    })),
  ].filter(e => e.timestamp).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, activityLimit);

  res.json({
    range: { from, to },
    kpis: {
      revenueUSD: +revenueUSD.toFixed(2),
      revenueKES: +(revenueUSD * kesRate).toFixed(2),
      commissionsUSD: +commissionsUSD.toFixed(2),
      commissionsKES: +(commissionsUSD * kesRate).toFixed(2),
      totalRevenueUSD: +totalRevenueUSD.toFixed(2),
      totalRevenueKES: +(totalRevenueUSD * kesRate).toFixed(2),
      activeCustomers, newCustomers,
      activeSubscriptions: activeMemberRows.length, newConfirmedPayments,
      pendingPaymentsCount,
    },
    needsAttention: {
      paymentsPending: pendingPaymentsCount,
      subscriptionsExpiringToday: expiringTodayCount,
      groupsAtCapacity,
      openSupportThreads: supportThreads.length,
    },
    yourProducts,
    recentActivity: activity,
  });
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

  // SplitCoins deduction is now REAL, not estimated: `total` above (summed
  // from PlatformEarning.fee) is already the NET figure, because
  // confirmOrder() writes the SplitCoins-adjusted platformFee into both
  // PlatformEarning.fee and Payment.platformFee at the moment a payment is
  // recorded. The pre-deduction GROSS figure is preserved separately on
  // each Payment row (grossPlatformFee) specifically so it can still be
  // shown for transparency, per Payment.grossPlatformFee. splitCoinsKesTotal
  // is read straight from the ledger (independent of the two sums below) as
  // an authoritative cross-check that gross - net ≈ coins minted × KES 10.
  const grossPayments = await prisma.payment.findMany({ select: { grossPlatformFee: true } });
  const grossEarned = grossPayments.reduce((a, p) => a + (p.grossPlatformFee ?? 0), 0);
  const netEarned = +total.toFixed(2);
  const splitCoinsKesTotal = await getSplitCoinsKesValue({});

  res.json({
    totalEarned: +grossEarned.toFixed(2), feePercent, // GROSS platform fee revenue, before SplitCoins
    netEarned, splitCoinsKesTotal, // NET (real, already fee-adjusted) and the ledger's own KES total for cross-checking
    totalPendingPayouts: +pendingPayments.reduce((a, p) => a + p.moderatorOwed, 0).toFixed(2),
    earningsCount: allEarnings.length, pendingOrders, completedOrders,
    totalGroups, totalUsers, totalCustomers, pendingModerators,
    byGroup, monthlyEarnings, recentEarnings: allEarnings.slice(-20).reverse(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — SPLITCOINS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/splitcoins", requireSuperAdmin, async (req, res) => {
  const [platformRows, allRows, history] = await Promise.all([
    prisma.splitCoinTransaction.findMany({ where: { recipientId: SPLITCOIN_PLATFORM_WALLET } }),
    prisma.splitCoinTransaction.findMany(),
    prisma.splitCoinTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const platformBalance = platformRows.reduce((sum, r) => sum + r.amount, 0);
  const totalMinted      = allRows.reduce((sum, r) => sum + r.amount, 0); // all coins ever minted, any recipient
  const totalFromPurchases = allRows.filter(r => r.sourceType === "purchase").reduce((sum, r) => sum + r.amount, 0);
  const totalFromReferrals = allRows.filter(r => r.sourceType === "referral").reduce((sum, r) => sum + r.amount, 0);
  const byReason = {};
  for (const r of allRows) byReason[r.reason] = +(byReason[r.reason] || 0) + r.amount;

  res.json({
    // "Total SplitCoins existing" / "Total KES value"
    totalExisting: totalMinted, totalKesValue: +(totalMinted * 10).toFixed(2),
    // "Total earned through purchases" / "Total earned through referrals"
    totalFromPurchases, totalFromPurchasesKes: +(totalFromPurchases * 10).toFixed(2),
    totalFromReferrals, totalFromReferralsKes: +(totalFromReferrals * 10).toFixed(2),
    // "Platform's SplitCoins"
    platformBalance, platformKesValue: +(platformBalance * 10).toFixed(2),
    // legacy alias, kept so any existing caller of totalMinted keeps working
    totalMinted,
    transactionCount: allRows.length, byReason, history,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — PLATFORM FEE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/settings", requireSuperAdmin, async (req, res) => {
  res.json({ feePercent: await getPlatformFeePercent(), kesPerUsd: await getPlatformKesRate() });
});

app.put("/api/admin/settings/fee", requireSuperAdmin, async (req, res) => {
  const { feePercent } = req.body;
  if (feePercent == null || feePercent < 1 || feePercent > 50)
    return res.status(400).json({ error: "feePercent must be between 1 and 50" });
  await prisma.platformSettings.upsert({ where: { id: 1 }, update: { feePercent: +feePercent }, create: { id: 1, feePercent: +feePercent } });
  res.json({ feePercent: +feePercent, message: "Platform fee updated." });
});

app.put("/api/admin/settings/rate", requireSuperAdmin, async (req, res) => {
  const { kesPerUsd } = req.body;
  if (kesPerUsd == null || kesPerUsd < 1 || kesPerUsd > 1000)
    return res.status(400).json({ error: "kesPerUsd must be between 1 and 1000" });
  await prisma.platformSettings.upsert({ where: { id: 1 }, update: { kesPerUsd: +kesPerUsd }, create: { id: 1, kesPerUsd: +kesPerUsd } });
  res.json({ kesPerUsd: +kesPerUsd, message: "Exchange rate updated." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — SUNDAY PAYOUT QUEUE
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/payout-queue", requireSuperAdmin, async (req, res) => {
  const kesRate = await getPlatformKesRate();
  const pendingPayments = await prisma.payment.findMany({ where: { payoutStatus: "pending" } });
  const byMod = {};
  // Payments organized by the superadmin's own account aren't owed to anyone
  // external — that revenue already sits in the platform's own wallet, so
  // there's nothing to "pay out" and no payout account to configure. Tracked
  // separately here instead of appearing as a broken payout-queue row.
  let ownAccountUSD = 0, ownAccountCount = 0;
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
        payoutMethod: modSettings?.payoutMethod || null,
        payoutDestination: modSettings?.payoutMethod === "mobile_money" ? modSettings?.payoutPhone
          : modSettings?.payoutMethod === "bank" ? `${modSettings?.payoutBankName || ""} • ${modSettings?.payoutAccountNumber || ""}`
          : null,
        paystackReady: !!modSettings?.paystackRecipientCode,
        isOwnAccount: modUser?.role === "superadmin",
        amountOwedUSD: 0, paymentCount: 0, payments: [],
      };
    }
    // Payment.amount/moderatorOwed are always stored in USD — the per-row `currency`
    // tag is unreliable (some rows say "KES" for the same USD-scale values, a legacy
    // labeling bug), so it's ignored here rather than trusted for arithmetic.
    if (byMod[p.moderatorId].isOwnAccount) {
      ownAccountUSD = +(ownAccountUSD + p.moderatorOwed).toFixed(2);
      ownAccountCount += 1;
      continue;
    }
    byMod[p.moderatorId].amountOwedUSD = +(byMod[p.moderatorId].amountOwedUSD + p.moderatorOwed).toFixed(2);
    byMod[p.moderatorId].paymentCount += 1;
    byMod[p.moderatorId].payments.push({ id: p.id, memberName: p.memberName, amount: p.amount, moderatorOwed: p.moderatorOwed, platformFee: p.platformFee, confirmedAt: p.confirmedAt });
  }
  const queue = Object.values(byMod)
    .filter(m => !m.isOwnAccount)
    .map(m => ({ ...m, amountOwedKES: +(m.amountOwedUSD * kesRate).toFixed(2) }))
    .sort((a, b) => b.amountOwedUSD - a.amountOwedUSD);
  const totalOwedUSD = +queue.reduce((a, m) => a + m.amountOwedUSD, 0).toFixed(2);
  const payoutHistory = await prisma.moderatorPayout.findMany({ orderBy: { paidAt: "desc" }, take: 50 });
  res.json({
    queue, totalOwedUSD, totalOwedKES: +(totalOwedUSD * kesRate).toFixed(2), payoutHistory,
    ownAccount: ownAccountCount > 0 ? {
      paymentCount: ownAccountCount, amountUSD: ownAccountUSD, amountKES: +(ownAccountUSD * kesRate).toFixed(2),
    } : null,
  });
});

app.post("/api/admin/payouts/mark-paid", requireSuperAdmin, async (req, res) => {
  const { moderatorId, notes = "" } = req.body;
  if (!moderatorId) return res.status(400).json({ error: "moderatorId required" });

  const pending = await prisma.payment.findMany({ where: { moderatorId, payoutStatus: "pending" } });
  if (!pending.length) return res.status(400).json({ error: "No pending payments for this moderator" });

  // Payment.moderatorOwed is always USD — see the note in /api/admin/payout-queue.
  const totalPaidUSD = +pending.reduce((a, p) => a + p.moderatorOwed, 0).toFixed(2);
  const [modUser, modSettings] = await Promise.all([
    prisma.user.findUnique({ where: { id: moderatorId } }),
    prisma.moderatorSettings.findUnique({ where: { userId: moderatorId } }),
  ]);

  if (!modSettings?.paystackRecipientCode) {
    return res.status(400).json({
      error: `${modUser?.name || "This moderator"} hasn't set up their Paystack payout details yet — ask them to complete Settings → Payout Account, then try again.`,
    });
  }

  const now     = new Date();
  const kesRate = await getPlatformKesRate();
  // Paystack transfer references: lowercase letters, digits, _ and - only, 16–50 chars.
  const transferRef = "payout-" + moderatorId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20) + "-" + now.getTime();

  let transfer;
  try {
    transfer = await paystack.initiateTransfer({
      amountUSD: totalPaidUSD, kesRate,
      recipientCode: modSettings.paystackRecipientCode,
      reference: transferRef,
      reason: `SplitSubs payout — ${pending.length} payment(s)`,
    });
  } catch (err) {
    console.error("Paystack transfer failed:", err.message);
    return res.status(502).json({ error: "Paystack transfer failed: " + err.message });
  }

  const payoutRecord = await prisma.moderatorPayout.create({
    data: {
      moderatorId, moderatorName: modUser?.name || "Unknown",
      moderatorEmail: modUser?.email || "", pesapalEmail: modSettings?.pesapalEmail || modUser?.email || "",
      amountPaid: totalPaidUSD, currency: "USD", method: "paystack",
      transferCode: transfer.transferCode, transferRef, transferStatus: transfer.status,
      paymentIds: pending.map(p => p.id), paymentCount: pending.length,
      notes, paidAt: now, weekEnding: now,
    },
  });

  // Paystack accepted the transfer and is moving the money (status "success"
  // meaning "queued/processing" at this point, not final settlement — the
  // webhook below flips it back to "pending" if it later fails or reverses).
  // If OTP confirmation is required, nothing is marked paid until finalize-otp.
  if (transfer.status !== "otp") {
    await prisma.payment.updateMany({ where: { moderatorId, payoutStatus: "pending" }, data: { payoutStatus: "paid", paidAt: now, paidBy: "superadmin" } });
  }

  res.json({
    success: true, payout: payoutRecord,
    requiresOtp: transfer.status === "otp",
    message: transfer.status === "otp"
      ? "Paystack requires an OTP to confirm this transfer — check the phone/email on your Paystack account and enter the code."
      : `Transfer of KES ${(totalPaidUSD * kesRate).toFixed(2)} initiated — Paystack is processing it now.`,
  });
});

app.post("/api/admin/payouts/finalize-otp", requireSuperAdmin, async (req, res) => {
  const { payoutId, otp } = req.body;
  if (!payoutId || !otp) return res.status(400).json({ error: "payoutId and otp are required" });
  const payout = await prisma.moderatorPayout.findUnique({ where: { id: payoutId } });
  if (!payout || !payout.transferCode) return res.status(404).json({ error: "Payout not found" });

  try {
    const result = await paystack.finalizeTransfer({ transferCode: payout.transferCode, otp });
    await prisma.moderatorPayout.update({ where: { id: payoutId }, data: { transferStatus: result.status } });
    if (result.status !== "otp") {
      await prisma.payment.updateMany({ where: { id: { in: payout.paymentIds } }, data: { payoutStatus: "paid", paidAt: new Date(), paidBy: "superadmin" } });
    }
    res.json({ success: true, status: result.status });
  } catch (err) {
    res.status(502).json({ error: "OTP verification failed: " + err.message });
  }
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
  const {
    pesapalEmail, displayName,
    payoutMethod, payoutName, payoutPhone, payoutBankCode, payoutBankName, payoutAccountNumber,
  } = req.body;
  if (!pesapalEmail) return res.status(400).json({ error: "pesapalEmail is required so we can send your weekly payout" });

  const data = { pesapalEmail: pesapalEmail.trim().toLowerCase(), displayName: displayName || "", feePercent: await getPlatformFeePercent() };

  // Payout details are optional to save (a moderator might just be updating
  // displayName), but if provided, validate + register a Paystack transfer
  // recipient before persisting anything, so we never save half-set details
  // that would silently fail at payout time.
  if (payoutMethod) {
    if (!["mobile_money", "bank"].includes(payoutMethod))
      return res.status(400).json({ error: "payoutMethod must be 'mobile_money' or 'bank'" });
    if (!payoutName || !payoutName.trim())
      return res.status(400).json({ error: "Account holder name is required" });
    if (!payoutBankCode)
      return res.status(400).json({ error: payoutMethod === "mobile_money" ? "Select M-Pesa" : "Select your bank" });

    const accountNumber = payoutMethod === "mobile_money" ? payoutPhone : payoutAccountNumber;
    if (!accountNumber || !accountNumber.trim())
      return res.status(400).json({ error: payoutMethod === "mobile_money" ? "M-Pesa phone number is required" : "Account number is required" });

    try {
      const { recipientCode } = await paystack.createTransferRecipient({
        type: payoutMethod === "mobile_money" ? "mobile_money" : "kepss",
        name: payoutName.trim(), accountNumber: accountNumber.trim(), bankCode: payoutBankCode, currency: "KES",
      });
      Object.assign(data, {
        payoutMethod, payoutName: payoutName.trim(),
        payoutPhone: payoutMethod === "mobile_money" ? accountNumber.trim() : null,
        payoutAccountNumber: payoutMethod === "bank" ? accountNumber.trim() : null,
        payoutBankCode, payoutBankName: payoutBankName || "", paystackRecipientCode: recipientCode,
      });
    } catch (err) {
      console.error("Paystack recipient creation failed:", err.message);
      return res.status(502).json({ error: "Could not register your payout details with Paystack: " + err.message });
    }
  }

  const settings = await prisma.moderatorSettings.upsert({
    where:  { userId: req.user.id },
    update: data,
    create: { userId: req.user.id, ...data },
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
    const { monthlyRevenue, profit } = computeGroupFinancials(g, feePercent);
    return { id: g.id, serviceName: g.serviceName, serviceIcon: g.serviceIcon, planName: g.planName, status: g.status, reviewStatus: g.reviewStatus, billingCycle: g.billingCycle, maxSlots: g.maxSlots, confirmedMembers: confirmed, totalSlots: g.maxSlots, totalCollected: +totalCollected.toFixed(2), platformFees: +platformFees.toFixed(2), modOwed: +modOwed.toFixed(2), modPaid: +modPaid.toFixed(2), modPending: +modPending.toFixed(2), subscriptionCost: g.subscriptionCost || 0, monthlyRevenue, profit, createdAt: g.createdAt };
  });

  const totalOwed = +groupStats.reduce((a, g) => a + g.modOwed, 0).toFixed(2);

  // SplitCoins — coin counts only, no KES value. The coin-to-KES exchange
  // rate is admin-only for now, so this response deliberately never
  // includes a kesValue/netOwed-style field for a moderator's own view
  // (the real cash payout figures below — totalOwed/totalPaid/totalPending —
  // are unaffected by SplitCoins; coins are additive, not deducted from them).
  const coinRows = await prisma.splitCoinTransaction.findMany({ where: { recipientId: uid } });
  const splitCoins = {
    balance: coinRows.reduce((sum, r) => sum + r.amount, 0),
    earnedFromPurchases: coinRows.filter(r => r.sourceType === "purchase").reduce((sum, r) => sum + r.amount, 0),
    earnedFromReferrals: coinRows.filter(r => r.sourceType === "referral").reduce((sum, r) => sum + r.amount, 0),
  };

  res.json({
    groups: groupStats,
    payoutHistory,
    splitCoins,
    summary: {
      totalGroups: myGroups.length,
      activeGroups: myGroups.filter(g => g.status === "open" || g.status === "full").length,
      pendingReview: myGroups.filter(g => g.reviewStatus === "pending").length,
      totalMembers:   groupStats.reduce((a, g) => a + g.confirmedMembers, 0),
      totalCollected: +groupStats.reduce((a, g) => a + g.totalCollected, 0).toFixed(2),
      totalOwed,
      totalPaid:      +groupStats.reduce((a, g) => a + g.modPaid, 0).toFixed(2),
      totalPending:   +groupStats.reduce((a, g) => a + g.modPending, 0).toFixed(2),
      totalProfit:    +groupStats.reduce((a, g) => a + g.profit, 0).toFixed(2),
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
    emailService.sendEmail({ to: group.organizer.email, subject, html, type: "group_review" }).catch(() => {});
  }
  res.json(updated);
});

// Let the admin edit a moderator's submitted listing — category (via
// serviceId), plan name, pricing, slots, description, etc — before (or
// after) approving it. Recomputes pricePerSlot/fees whenever price, slots,
// or the service itself changes, same as group creation.
app.patch("/api/admin/groups/:id", requireSuperAdmin, async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "Group not found" });

  const { serviceId, planName, totalPrice, maxSlots, description, billingCycle, subscriptionCost, renewDate } = req.body;

  const data = {};
  if (serviceId !== undefined) {
    const service = SERVICES.find(s => s.id === serviceId);
    if (!service) return res.status(404).json({ error: "Service not found" });
    data.serviceId = serviceId;
    data.serviceName = service.name;
    data.serviceIcon = service.icon;
  }
  if (planName !== undefined)     data.planName = planName;
  if (billingCycle !== undefined) data.billingCycle = billingCycle;
  if (description !== undefined)  data.description = description;
  if (subscriptionCost !== undefined) data.subscriptionCost = +subscriptionCost || 0;
  if (renewDate !== undefined)    data.renewDate = renewDate ? new Date(renewDate) : null;

  const newTotalPrice = totalPrice !== undefined ? +totalPrice : group.totalPrice;
  const newMaxSlots    = maxSlots   !== undefined ? +maxSlots   : group.maxSlots;
  if (totalPrice !== undefined) data.totalPrice = newTotalPrice;
  if (maxSlots   !== undefined) data.maxSlots   = newMaxSlots;

  if (totalPrice !== undefined || maxSlots !== undefined) {
    const pricePerSlot = +(newTotalPrice / newMaxSlots).toFixed(2);
    const fees = await calcFee(pricePerSlot, 1);
    data.pricePerSlot = pricePerSlot;
    data.platformFee  = fees.platformFee;
    data.memberPays   = fees.memberPays;
    data.feePercent   = fees.feePercent;
  }

  const updated = await prisma.group.update({ where: { id: req.params.id }, data });
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

// System/automatic emails sent via Resend — feeds the Automation page's email log.
app.get("/api/admin/email-logs", requireSuperAdmin, async (req, res) => {
  const { type, status, search } = req.query;
  const where = {};
  if (type && type !== "all")     where.type = type;
  if (status && status !== "all") where.status = status;
  if (search && search.trim()) {
    where.OR = [
      { to:      { contains: search.trim(), mode: "insensitive" } },
      { subject: { contains: search.trim(), mode: "insensitive" } },
    ];
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const logs = await prisma.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  res.json(logs);
});

// ═══════════════════════════════════════════════════════════════════════════
//  CURRENCY & PUBLIC STATS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/currency/rate", async (req, res) => {
  const rate = await getPlatformKesRate();
  res.json({ KES_PER_USD: rate, USD_PER_KES: +(1 / rate).toFixed(6), source: "platform_settings" });
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
      paymentStatus:        newExpiry <= new Date() ? "expired" : "confirmed",
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
    await emailService.sendEmail({ to: user.email, subject, html, type: "admin_direct" });
    console.log("[ADMIN] Email sent to user:", user.email);
    res.json({ ok: true, message: "Email sent to " + user.name + "." });
  } catch (err) {
    console.error("User email failed:", err.message);
    res.status(500).json({ error: "Could not send email" });
  }
});

app.get("/api/admin/users/:id/profile", requireSuperAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      memberships: {
        include: { group: true },
        orderBy: { joinedAt: "desc" },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Get last seen from presence
  const presence = await prisma.userPresence.findUnique({ where: { userId: req.params.id } }).catch(() => null);

  // Get Paystack payment history only
  const paystackPayments = await prisma.paystackOrder.findMany({
    where: { userId: req.params.id, status: "COMPLETED" },
    orderBy: { confirmedAt: "desc" },
    take: 20,
  });

  // SplitCoins — every user's full balance/earnings, 0 if they've never
  // earned any (empty ledger naturally reduces to 0 rows → 0 everything).
  const coinRows = await prisma.splitCoinTransaction.findMany({ where: { recipientId: user.id } });
  const coinBalance = coinRows.reduce((sum, r) => sum + r.amount, 0);
  const splitCoins = {
    balance: coinBalance,
    kesValue: +(coinBalance * 10).toFixed(2),
    earnedFromPurchases: coinRows.filter(r => r.sourceType === "purchase").reduce((sum, r) => sum + r.amount, 0),
    earnedFromReferrals: coinRows.filter(r => r.sourceType === "referral").reduce((sum, r) => sum + r.amount, 0),
    history: coinRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50),
  };

  res.json({
    id:          user.id,
    name:        user.name,
    email:       user.email,
    phone:       user.phone,
    role:        user.role,
    status:      user.status,
    joinedAt:    user.createdAt,
    approvedAt:  user.approvedAt,
    lastSeen:    presence?.lastSeen || null,
    online:      presence ? (Date.now() - new Date(presence.lastSeen).getTime()) < 5 * 60 * 1000 : false,
    // Only confirmed (active) subscriptions — pending/unpaid attempts shouldn't
    // count toward the subscriptions total or show up as if they're active.
    subscriptions: user.memberships.filter(m => m.paymentStatus === "confirmed").map(m => ({
      id:            m.id,
      groupId:       m.groupId,
      groupName:     m.group.serviceName + " " + m.group.planName,
      serviceIcon:   m.group.serviceIcon,
      serviceName:   m.group.serviceName,
      planName:      m.group.planName,
      billingCycle:  m.group.billingCycle,
      paymentStatus: m.paymentStatus,
      memberPays:    m.memberPays,
      joinedAt:      m.joinedAt,
      expiresAt:     m.expiresAt,
      expiryAdjustmentDays: m.expiryAdjustmentDays,
      expiryAdjustedAt:     m.expiryAdjustedAt,
    })),
    payments: paystackPayments.map(p => ({
      id:          p.id,
      amount:      p.memberPays,
      currency:    p.currency,
      confirmedAt: p.confirmedAt,
      months:      p.months,
    })),
    totalSpent: paystackPayments.reduce((a, p) => a + (p.memberPays || 0), 0),
    splitCoins,
  });
});

