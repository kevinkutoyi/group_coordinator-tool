require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const fs         = require("fs");
const path       = require("path");
const rateLimit  = require("express-rate-limit");
const pesapal    = require("./pesapal");
const { validateEmail, generateConfirmToken, isTokenExpired } = require("./emailValidator");
const emailService = require("./emailService");

const app  = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "../data/db.json");
// Platform fee % taken from every payment — remainder owed to moderator.
// Can be overridden per-run by DB platformSettings.feePercent (set via admin dashboard).
const DEFAULT_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "8");
const JWT_SECRET  = process.env.JWT_SECRET || "dev_secret_change_in_production";

// Runtime fee (may be updated by super admin without restart)
function getPlatformFeePercent() {
  try {
    const db = loadDB();
    return db.platformSettings?.feePercent ?? DEFAULT_FEE_PERCENT;
  } catch { return DEFAULT_FEE_PERCENT; }
}

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: "Too many attempts, please wait 15 minutes." } });

// ── DB ────────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      users: [], groups: [], groupMembers: [],
      payments: [], pesapalOrders: [], platformEarnings: [],
      emailVerifications: [], footerSubscribers: [], newsletterSent: [], groupEmails: [], groupCredentials: [],
      moderatorSettings: [], organizerEarnings: [],
      // ── NEW ──────────────────────────────────────────────────────
      moderatorPayouts: [],       // Sunday payout records per moderator
      platformSettings: { feePercent: DEFAULT_FEE_PERCENT }, // live-editable
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  ["users","groups","groupMembers","payments","pesapalOrders","platformEarnings","emailVerifications",
   "footerSubscribers","newsletterSent","groupEmails","groupCredentials","moderatorSettings","organizerEarnings",
   "moderatorPayouts"]
    .forEach(k => { if (!db[k]) db[k] = []; });
  if (!db.platformSettings) db.platformSettings = { feePercent: DEFAULT_FEE_PERCENT };
  return db;
}
function saveDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// ── Helpers ───────────────────────────────────────────────────────────────
// New payment model:
//   memberPays      = base subscription cost (no extra fee on top)
//   platformFee     = memberPays × feePercent/100  (platform keeps this)
//   moderatorOwed   = memberPays − platformFee      (queued for Sunday payout)
function calcFee(amount, months = 1) {
  const feePercent    = getPlatformFeePercent();
  const memberPays    = +(amount * months).toFixed(2);
  const platformFee   = +(memberPays * feePercent / 100).toFixed(2);
  const moderatorOwed = +(memberPays - platformFee).toFixed(2);
  return { base: memberPays, memberPays, platformFee, moderatorOwed,
           feePercent, organizerGets: moderatorOwed }; // organizerGets alias kept for compat
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

// ── Services Catalogue ────────────────────────────────────────────────────
const SERVICES = [
  { id: "spotify",  name: "Spotify",          icon: "🎵",
    plans: [{ name: "Premium Duo", price: 16.99, maxSlots: 2 },
            { name: "Premium Family", price: 17.99, maxSlots: 6 }] },
  { id: "netflix",  name: "Netflix",           icon: "🎬",
    plans: [{ name: "Standard", price: 15.49, maxSlots: 2 },
            { name: "Premium",  price: 22.99, maxSlots: 4 }] },
  { id: "chatgpt",  name: "ChatGPT Plus",      icon: "🤖",
    plans: [{ name: "Family Plan", price: 30.00, maxSlots: 5 }] },
  { id: "claude",   name: "Claude AI",         icon: "✨",
    plans: [{ name: "Claude Max 5x", price: 100.00, maxSlots: 5 }] },
  { id: "youtube",  name: "YouTube Premium",   icon: "▶️",
    plans: [{ name: "Family Plan", price: 22.99, maxSlots: 6 }] },
  { id: "apple",    name: "Apple One",         icon: "🍎",
    plans: [{ name: "Family", price: 25.95, maxSlots: 6 }] },
  { id: "disney",   name: "Disney+",           icon: "🏰",
    plans: [{ name: "Standard", price: 7.99, maxSlots: 4 },
            { name: "Premium",  price: 13.99, maxSlots: 4 }] },
  { id: "hbo",      name: "Max (HBO)",         icon: "👑",
    plans: [{ name: "Ultimate", price: 20.99, maxSlots: 4 }] },
];

const SUBSCRIPTION_DURATIONS = [
  { months: 1,  label: "1 Month",   discount: 0 },
  { months: 3,  label: "3 Months",  discount: 5 },
  { months: 6,  label: "6 Months",  discount: 10 },
  { months: 12, label: "12 Months", discount: 15 },
];

// ═══════════════════════════════════════════════════════════════════════════
//  USER AUTH ROUTES  (customers & moderators)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post("/api/auth/signup", authLimiter, async (req, res) => {
  const { name, email, password, role = "customer", phone = "", newsletter = true } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email and password are required" });
  if (!["customer", "moderator"].includes(role))
    return res.status(400).json({ error: "role must be customer or moderator" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  // ── Email validation: format + disposable + DNS MX ──────────────────────
  const emailCheck = await validateEmail(email);
  if (!emailCheck.valid)
    return res.status(400).json({ error: emailCheck.reason });

  const db = loadDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id:           uuidv4(),
    name:         name.trim(),
    email:        email.toLowerCase().trim(),
    phone:        phone.trim(),
    passwordHash,
    role,                          // "customer" | "moderator" | "superadmin"
    // moderators start as pending until superadmin approves
    status:       role === "moderator" ? "pending" : "active",
    newsletter:   newsletter !== false,   // default true if not provided
    createdAt:    new Date().toISOString(),
    approvedAt:   null,
    approvedBy:   null,
  };

  db.users.push(user);
  saveDB(db);

  if (role === "moderator") {
    return res.status(201).json({
      message: "Moderator account created. Awaiting super-admin approval before you can create groups.",
      user: safeUser(user),
    });
  }

  // Customer gets a token immediately
  const token = signToken({ id: user.id, role: user.role, name: user.name });
  res.status(201).json({ token, user: safeUser(user) });
});

// POST /api/auth/login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password required" });

  const db   = loadDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  if (user.status === "pending")
    return res.status(403).json({ error: "Your moderator account is pending approval by the administrator." });
  if (user.status === "suspended")
    return res.status(403).json({ error: "Your account has been suspended. Contact support." });

  const token = signToken({ id: user.id, role: user.role, name: user.name });
  res.json({ token, user: safeUser(user) });
});

// GET /api/auth/me
app.get("/api/auth/me", requireAuth, (req, res) => {
  const db   = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(safeUser(user));
});

// POST /api/auth/refresh
app.post("/api/auth/refresh", requireAuth, (req, res) => {
  const token = signToken({ id: req.user.id, role: req.user.role, name: req.user.name });
  res.json({ token });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/admin/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });
  if (username !== (process.env.ADMIN_USERNAME || "superadmin"))
    return res.status(401).json({ error: "Invalid credentials" });

  const hash  = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin", 12);
  // Re-hash each request is slow; cache it
  const valid = await bcrypt.compare(password, bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin", 10));
  // Shortcut: direct compare since env password is plain text
  if (password !== (process.env.ADMIN_PASSWORD || "admin"))
    return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h");
  res.json({ token, role: "superadmin" });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const requireSuperAdmin = requireRole("superadmin");

// GET /api/admin/users  — list all users
app.get("/api/admin/users", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  const { role, status } = req.query;
  let users = db.users.map(safeUser);
  if (role)   users = users.filter(u => u.role === role);
  if (status) users = users.filter(u => u.status === status);
  res.json(users);
});

// GET /api/admin/moderators/pending — shortcut
app.get("/api/admin/moderators/pending", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  res.json(db.users.filter(u => u.role === "moderator" && u.status === "pending").map(safeUser));
});

// PATCH /api/admin/users/:id/approve — approve a moderator
app.patch("/api/admin/users/:id/approve", requireSuperAdmin, (req, res) => {
  const db   = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "moderator") return res.status(400).json({ error: "Only moderators need approval" });

  user.status     = "active";
  user.approvedAt = new Date().toISOString();
  user.approvedBy = "superadmin";
  saveDB(db);
  res.json(safeUser(user));
});

// PATCH /api/admin/users/:id/reject — reject / suspend
app.patch("/api/admin/users/:id/reject", requireSuperAdmin, (req, res) => {
  const { reason = "" } = req.body;
  const db   = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.status        = "suspended";
  user.rejectionNote = reason;
  saveDB(db);
  res.json(safeUser(user));
});

// PATCH /api/admin/users/:id/suspend
app.patch("/api/admin/users/:id/suspend", requireSuperAdmin, (req, res) => {
  const db   = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.status = "suspended";
  saveDB(db);
  res.json(safeUser(user));
});

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICES & DURATIONS  (public)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/services", (req, res) => res.json(SERVICES));
app.get("/api/durations", (req, res) => res.json(SUBSCRIPTION_DURATIONS));

// ═══════════════════════════════════════════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/groups — public list (only approved groups shown publicly)
app.get("/api/groups", (req, res) => {
  const db = loadDB();
  // Admins see all; public only sees approved groups
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest";
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
    viewerRole = decoded.role;
  } catch {}

  const groups = db.groups.filter(g =>
    viewerRole === "superadmin" ||
    g.reviewStatus === "approved" ||
    (viewerRole === "moderator" && g.organizerId === (() => {
      try { return jwt.verify(authHeader.replace("Bearer ",""), JWT_SECRET).id; } catch { return null; }
    })())
  );

  const enriched = groups.map(g => {
    const members        = db.groupMembers.filter(m => m.groupId === g.id);
    const payingMembers  = members.filter(m => m.role !== "organizer");
    const payments       = db.payments.filter(p => p.groupId === g.id);
    const safeMembers    = members.map(({ email, ...m }) => m);
    return { ...g, memberCount: payingMembers.length, members: safeMembers, payments };
  });
  res.json(enriched);
});

// GET /api/groups/:id — public detail
// Pending-review groups are only visible to the owning moderator and superadmin.
app.get("/api/groups/:id", (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  // Decode caller's role/id from token (if present)
  const authHeader = req.headers.authorization || "";
  let viewerRole = "guest";
  let viewerId   = null;
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
    viewerRole = decoded.role;
    viewerId   = decoded.id;
  } catch {}

  // Enforce review gate: non-approved groups are only visible to superadmin
  // or the moderator who owns them
  const isApproved   = group.reviewStatus === "approved";
  const isSuperAdmin = viewerRole === "superadmin";
  const isOwner      = viewerRole === "moderator" && viewerId === group.organizerId;

  if (!isApproved && !isSuperAdmin && !isOwner) {
    return res.status(404).json({ error: "Group not found" });
  }

  const members  = db.groupMembers.filter(m => m.groupId === group.id);
  const payments = db.payments.filter(p => p.groupId === group.id);
  res.json({ ...group, members, payments });
});

// POST /api/groups — moderators (approved) and superadmin
app.post("/api/groups", requireRole("moderator", "superadmin"), (req, res) => {
  const { serviceId, planName, totalPrice, maxSlots, description, billingCycle = 'monthly' } = req.body;
  if (!serviceId || !planName || !totalPrice || !maxSlots)
    return res.status(400).json({ error: "serviceId, planName, totalPrice, maxSlots required" });

  const db = loadDB();

  // Superadmin uses env credentials — no DB record needed
  const isSuperAdmin = req.user.role === "superadmin";
  let creatorName, creatorEmail;

  if (isSuperAdmin) {
    creatorName  = process.env.ADMIN_USERNAME || "Super Admin";
    creatorEmail = process.env.ADMIN_EMAIL    || "admin@splitpass.com";
  } else {
    const creator = db.users.find(u => u.id === req.user.id);
    if (!creator)
      return res.status(404).json({ error: "User not found" });
    if (creator.status !== "active")
      return res.status(403).json({ error: "Your account is not yet approved to create groups" });
    creatorName  = creator.name;
    creatorEmail = creator.email;
  }

  const service = SERVICES.find(s => s.id === serviceId);
  if (!service) return res.status(404).json({ error: "Service not found" });

  // All maxSlots are paying-customer slots — organizer is NOT counted
  const pricePerSlot = +(totalPrice / maxSlots).toFixed(2);
  const { platformFee, memberPays } = calcFee(pricePerSlot, 1);

  const group = {
    id:             uuidv4(),
    serviceId,
    serviceName:    service.name,
    serviceIcon:    service.icon,
    planName,
    totalPrice:     +totalPrice,
    maxSlots:       +maxSlots,   // all slots are for paying customers
    pricePerSlot,
    platformFee,
    memberPays,
    feePercent:     getPlatformFeePercent(),
    organizerId:    req.user.id,
    organizerName:  creatorName,
    organizerEmail: creatorEmail,
    description:    description || "",
    billingCycle:   billingCycle,
    // Groups created by moderators start as "pending_review" — superadmin must approve
    // Groups created by superadmin are live immediately
    status:         isSuperAdmin ? "open" : "pending_review",
    reviewStatus:   isSuperAdmin ? "approved" : "pending",
    reviewNote:     "",
    createdAt:      new Date().toISOString(),
  };

  // Organizer is NOT added as a groupMember — they coordinate only, pay nothing
  db.groups.push(group);
  saveDB(db);
  res.status(201).json(group);
});

// PATCH /api/groups/:id/status  (moderator who owns it, or superadmin)
app.patch("/api/groups/:id/status", requireAuth, (req, res) => {
  const { status } = req.body;
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOwner = group.organizerId === req.user.id;
  const isAdmin = req.user.role === "superadmin";
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  group.status = status;
  saveDB(db);
  res.json(group);
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP MEMBERSHIP  (authenticated customers)
// ═══════════════════════════════════════════════════════════════════════════

// ── billingCycle → months mapper ─────────────────────────────────────────
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };

// POST /api/groups/:id/join
app.post("/api/groups/:id/join", requireRole("customer", "superadmin"), (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group)                   return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open")  return res.status(400).json({ error: "Group is not accepting new members" });

  // Duration is FIXED by the group's billingCycle — customers cannot override it
  const fixedMonths = CYCLE_MONTHS[group.billingCycle] || 1;
  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === fixedMonths) || SUBSCRIPTION_DURATIONS[0];
  const months = fixedMonths;

  const allMembers     = db.groupMembers.filter(m => m.groupId === group.id);
  const payingMembers  = allMembers.filter(m => m.role !== "organizer");
  if (payingMembers.length >= group.maxSlots)
    return res.status(400).json({ error: "Group is full" });
  if (allMembers.find(m => m.userId === req.user.id))
    return res.status(400).json({ error: "You are already a member of this group" });
  // Organizer cannot join their own group as a paying member
  if (group.organizerId === req.user.id)
    return res.status(400).json({ error: "You are the organizer of this group and do not pay for a slot" });

  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { platformFee, memberPays, organizerGets, base } = calcFee(group.pricePerSlot, parseInt(months));

  const member = {
    id:            uuidv4(),
    groupId:       group.id,
    userId:        req.user.id,
    name:          user.name,
    email:         user.email,
    role:          "member",
    months:        parseInt(months),
    durationLabel: validDuration.label,
    discount:      validDuration.discount,
    baseAmount:    base,
    platformFee,
    memberPays,
    organizerGets,
    paymentStatus: "pending",
    joinedAt:      new Date().toISOString(),
    expiresAt:     null,   // set after payment confirmed
  };

  db.groupMembers.push(member);
  if (payingMembers.length + 1 >= group.maxSlots) group.status = "full";
  saveDB(db);
  res.status(201).json(member);
});

// ═══════════════════════════════════════════════════════════════════════════
//  PESAPAL PAYMENT
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/pesapal/initiate", requireRole("customer", "superadmin"), async (req, res) => {
  const { groupId, memberId, currency = "KES" } = req.body;
  if (!groupId || !memberId)
    return res.status(400).json({ error: "groupId and memberId required" });

  const db     = loadDB();
  const group  = db.groups.find(g => g.id === groupId);
  const member = db.groupMembers.find(m => m.id === memberId && m.userId === req.user.id);

  if (!group)  return res.status(404).json({ error: "Group not found" });
  if (!member) return res.status(404).json({ error: "Membership not found" });
  if (member.paymentStatus === "confirmed")
    return res.status(400).json({ error: "Already paid" });

  // ── Currency conversion ───────────────────────────────────────────────────
  // All prices are stored in USD. We use a single fixed rate (KES_PER_USD from .env)
  // to derive BOTH the KES and USD charge amounts so they are equivalent regardless
  // of PesaPal's own live market rate on the day.
  //
  // Without this fix:
  //   KES path → memberPays * 130 = 432.9 → KES 433
  //   USD path → memberPays = $3.33 → PesaPal converts at live rate ~129.5 → KES 431
  //   Result: customer pays different amounts depending on currency choice.
  //
  // With this fix:
  //   kesAmount = round(3.33 * 130) = 433 KES  (whole shillings)
  //   usdAmount = 433 / 130 = 3.33 USD          (back-derived — same purchasing power)
  //   Both paths now represent identical value at our fixed rate.
  const KES_PER_USD  = parseFloat(process.env.KES_PER_USD || "130");
  const amountInUSD  = member.memberPays;
  const kesAmount    = Math.round(amountInUSD * KES_PER_USD);   // whole shillings
  const usdAmount    = +(kesAmount / KES_PER_USD).toFixed(2);   // back-derived USD
  const amountForPesapal = currency === "KES" ? kesAmount : usdAmount;

  const orderId    = `SP-${Date.now()}-${uuidv4().slice(0,8).toUpperCase()}`;
  const callbackUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-callback?orderId=${orderId}&groupId=${groupId}&memberId=${memberId}`;

  try {
    const nameParts = member.name.split(" ");
    const { redirectUrl, orderTrackingId } = await pesapal.submitOrder({
      orderId, amount: amountForPesapal, currency,
      description: `SplitPass: ${group.serviceName} ${group.planName} × ${member.months}mo — ${member.name}`,
      firstName: nameParts[0], lastName: nameParts.slice(1).join(" ") || "",
      email: member.email, phone: "", callbackUrl,
    });

    db.pesapalOrders.push({
      id: orderId, orderTrackingId, groupId, memberId,
      userId:        req.user.id,
      memberName:    member.name,
      memberEmail:   member.email,
      months:        member.months,
      baseAmount:    member.baseAmount,
      platformFee:   member.platformFee,
      moderatorOwed: member.moderatorOwed,
      organizerGets: member.moderatorOwed, // compat alias
      moderatorId:   group.organizerId,
      memberPays:    member.memberPays,       // always USD — used for earnings calc
      chargedAmount: amountForPesapal,        // actual amount sent to PesaPal (KES or USD)
      currency, status: "PENDING",
      createdAt: new Date().toISOString(), confirmedAt: null,
    });
    saveDB(db);
    res.json({
      redirectUrl, orderId,
      memberPays:    member.memberPays,       // USD base
      chargedAmount: amountForPesapal,        // what PesaPal will charge
      currency,
      platformFee:   member.platformFee,
    });
  } catch (err) {
    console.error("PesaPal initiate:", err.message);
    res.status(502).json({ error: `Payment gateway error: ${err.message}` });
  }
});

app.get("/api/pesapal/verify", async (req, res) => {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  const db    = loadDB();
  const order = db.pesapalOrders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "COMPLETED")
    return res.json({ status: "COMPLETED", memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets, pesapalStatus: "Completed" });

  try {
    const statusData = await pesapal.getTransactionStatus(order.orderTrackingId);
    const code       = statusData.payment_status_description;
    order.pesapalStatus = code;

    if (code === "Completed") {
      order.status      = "COMPLETED";
      order.confirmedAt = new Date().toISOString();
      const member = db.groupMembers.find(m => m.id === order.memberId);
      if (member) {
        member.paymentStatus = "confirmed";
        const exp = new Date();
        exp.setMonth(exp.getMonth() + (order.months || 1));
        member.expiresAt = exp.toISOString();
      }
      if (!db.payments.find(p => p.pesapalOrderId === orderId)) {
        // ── Record payment with moderator payout tracking ───────────────
        db.payments.push({
          id: uuidv4(), groupId: order.groupId, memberId: order.memberId,
          userId: order.userId, memberName: order.memberName,
          months: order.months, amount: order.memberPays,
          platformFee:   order.platformFee,
          moderatorOwed: order.moderatorOwed ?? order.organizerGets,
          moderatorId:   order.moderatorId,
          organizerGets: order.moderatorOwed ?? order.organizerGets, // compat
          method: "pesapal", pesapalOrderId: orderId, confirmedAt: order.confirmedAt,
          payoutStatus: "pending", // "pending" until super admin marks paid on Sunday
          currency: order.currency || "KES",
        });
        db.platformEarnings.push({
          id: uuidv4(), orderId, groupId: order.groupId,
          fee: order.platformFee, currency: order.currency, earnedAt: order.confirmedAt,
        });

        // ── Send welcome/confirmation email ──────────────────────────────
        const grpForEmail = db.groups.find(g => g.id === order.groupId);
        const memForEmail = db.groupMembers.find(m => m.id === order.memberId);
        if (grpForEmail && memForEmail) {
          const existingCreds = db.groupCredentials.find(c => c.groupId === order.groupId);
          if (existingCreds && memForEmail) {
            emailService.sendCredentialsUpdated({
              to:          memForEmail.email,
              memberName:  memForEmail.name,
              groupName:   `${grpForEmail.serviceName} ${grpForEmail.planName}`,
              serviceName: grpForEmail.serviceName,
            }).catch(e => console.error("Creds email error:", e.message));
          }

          emailService.sendWelcome({
            to:          memForEmail.email,
            memberName:  memForEmail.name,
            groupName:   `${grpForEmail.serviceName} ${grpForEmail.planName}`,
            serviceName: grpForEmail.serviceName,
            planName:    grpForEmail.planName,
            billingCycle: grpForEmail.billingCycle,
            pricePerSlot: grpForEmail.pricePerSlot,
            memberPays:  order.memberPays,
            currency:    order.currency || "KES",
            expiresAt:   memForEmail.expiresAt,
            organizerName: grpForEmail.organizerName,
          }).catch(e => console.error("Welcome email error:", e.message));
        }
      }
      const group = db.groups.find(g => g.id === order.groupId);
      if (group) {
        const confirmedPaying = db.groupMembers.filter(
          m => m.groupId === group.id && m.paymentStatus === "confirmed" && m.role !== "organizer"
        ).length;
        if (confirmedPaying >= group.maxSlots) group.status = "full";
      }
    } else if (["Failed","Invalid"].includes(code)) { order.status = "FAILED"; }
    saveDB(db);
    res.json({ status: order.status, memberPays: order.memberPays, platformFee: order.platformFee, organizerGets: order.organizerGets, pesapalStatus: code });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/pesapal/ipn", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.body;
  res.sendStatus(200);
  if (!OrderTrackingId) return;
  try {
    const db    = loadDB();
    const order = db.pesapalOrders.find(o => o.id === OrderMerchantReference);
    if (!order || order.status === "COMPLETED") return;
    const statusData = await pesapal.getTransactionStatus(OrderTrackingId);
    const code = statusData.payment_status_description;
    order.pesapalStatus   = code;
    order.orderTrackingId = OrderTrackingId;
    if (code === "Completed") {
      order.status = "COMPLETED"; order.confirmedAt = new Date().toISOString();
      const member = db.groupMembers.find(m => m.id === order.memberId);
      if (member) {
        member.paymentStatus = "confirmed";
        const exp = new Date(); exp.setMonth(exp.getMonth() + (order.months || 1));
        member.expiresAt = exp.toISOString();
      }
      if (!db.payments.find(p => p.pesapalOrderId === order.id)) {
        db.payments.push({
          id: uuidv4(), groupId: order.groupId, memberId: order.memberId,
          userId: order.userId, memberName: order.memberName,
          months: order.months, amount: order.memberPays,
          platformFee:   order.platformFee,
          moderatorOwed: order.moderatorOwed ?? order.organizerGets,
          moderatorId:   order.moderatorId,
          organizerGets: order.moderatorOwed ?? order.organizerGets,
          method: "pesapal", pesapalOrderId: order.id, confirmedAt: order.confirmedAt,
          payoutStatus: "pending",
          currency: order.currency || "KES",
        });
        db.platformEarnings.push({ id: uuidv4(), orderId: order.id, groupId: order.groupId, fee: order.platformFee, currency: order.currency, earnedAt: order.confirmedAt });
      }
      const group = db.groups.find(g => g.id === order.groupId);
      if (group) {
        const confirmedPaying = db.groupMembers.filter(
          m => m.groupId === group.id && m.paymentStatus === "confirmed" && m.role !== "organizer"
        ).length;
        if (confirmedPaying >= group.maxSlots) group.status = "full";
      }
    }
    saveDB(db);
  } catch (err) { console.error("IPN error:", err.message); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — EARNINGS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/earnings", requireSuperAdmin, (req, res) => {
  const db    = loadDB();
  const total = db.platformEarnings.reduce((acc, e) => acc + (e.fee || 0), 0);
  const now   = new Date();
  const feePercent = getPlatformFeePercent();

  const monthlyEarnings = Array.from({ length: 12 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const tot   = db.platformEarnings
      .filter(e => { const ed = new Date(e.earnedAt); return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth(); })
      .reduce((acc, e) => acc + (e.fee || 0), 0);
    return { label, total: +tot.toFixed(2) };
  });

  const byGroup = db.groups.map(g => {
    const fees = db.platformEarnings.filter(e => e.groupId === g.id).reduce((a, e) => a + e.fee, 0);
    return { groupId: g.id, serviceName: g.serviceName, planName: g.planName, fees: +fees.toFixed(2) };
  }).filter(g => g.fees > 0);

  // Total pending moderator payouts
  const totalPendingPayouts = db.payments
    .filter(p => p.payoutStatus === "pending")
    .reduce((a, p) => a + (p.moderatorOwed || 0), 0);

  res.json({
    totalEarned:        +total.toFixed(2),
    feePercent,
    totalPendingPayouts: +totalPendingPayouts.toFixed(2),
    earningsCount:      db.platformEarnings.length,
    pendingOrders:      db.pesapalOrders.filter(o => o.status === "PENDING").length,
    completedOrders:    db.pesapalOrders.filter(o => o.status === "COMPLETED").length,
    totalGroups:        db.groups.length,
    totalUsers:         db.users.length,
    totalCustomers:     db.users.filter(u => u.role === "customer").length,
    pendingModerators:  db.users.filter(u => u.role === "moderator" && u.status === "pending").length,
    byGroup,
    monthlyEarnings,
    recentEarnings:     db.platformEarnings.slice(-20).reverse(),
  });
});

app.get("/api/admin/refresh", requireSuperAdmin, (req, res) => {
  const token = signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h");
  res.json({ token });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — PLATFORM FEE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/settings  — current platform fee
app.get("/api/admin/settings", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  res.json({ feePercent: db.platformSettings?.feePercent ?? DEFAULT_FEE_PERCENT });
});

// PUT /api/admin/settings/fee  — update platform fee %
app.put("/api/admin/settings/fee", requireSuperAdmin, (req, res) => {
  const { feePercent } = req.body;
  if (feePercent == null || feePercent < 1 || feePercent > 50)
    return res.status(400).json({ error: "feePercent must be between 1 and 50" });
  const db = loadDB();
  db.platformSettings = { ...(db.platformSettings || {}), feePercent: +feePercent };
  saveDB(db);
  res.json({ feePercent: +feePercent, message: "Platform fee updated." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN — SUNDAY PAYOUT QUEUE
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/payout-queue
// Returns one row per moderator with pending (unpaid) payments
app.get("/api/admin/payout-queue", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  const pendingPayments = db.payments.filter(p => p.payoutStatus === "pending");

  // Group by moderatorId
  const byMod = {};
  for (const p of pendingPayments) {
    const modId = p.moderatorId;
    if (!modId) continue;
    if (!byMod[modId]) {
      const modUser = db.users.find(u => u.id === modId);
      const modSettings = db.moderatorSettings.find(s => s.userId === modId);
      byMod[modId] = {
        moderatorId:    modId,
        moderatorName:  modUser?.name  || "Unknown",
        moderatorEmail: modUser?.email || "",
        pesapalEmail:   modSettings?.pesapalEmail || modUser?.email || "",
        currency:       p.currency || "KES",
        amountOwed:     0,
        paymentCount:   0,
        payments:       [],
      };
    }
    byMod[modId].amountOwed   = +(byMod[modId].amountOwed + (p.moderatorOwed || 0)).toFixed(2);
    byMod[modId].paymentCount += 1;
    byMod[modId].payments.push({
      id: p.id, memberName: p.memberName, amount: p.amount,
      moderatorOwed: p.moderatorOwed, platformFee: p.platformFee,
      confirmedAt: p.confirmedAt, currency: p.currency,
    });
  }

  // Also include history of past payouts
  const payoutHistory = (db.moderatorPayouts || []).slice().reverse().slice(0, 50);

  res.json({
    queue: Object.values(byMod).sort((a, b) => b.amountOwed - a.amountOwed),
    totalOwed: +Object.values(byMod).reduce((a, m) => a + m.amountOwed, 0).toFixed(2),
    payoutHistory,
  });
});

// POST /api/admin/payouts/mark-paid
// Marks all pending payments for a moderator as paid and logs the payout
app.post("/api/admin/payouts/mark-paid", requireSuperAdmin, (req, res) => {
  const { moderatorId, notes = "" } = req.body;
  if (!moderatorId) return res.status(400).json({ error: "moderatorId required" });

  const db = loadDB();
  const pending = db.payments.filter(
    p => p.moderatorId === moderatorId && p.payoutStatus === "pending"
  );
  if (!pending.length)
    return res.status(400).json({ error: "No pending payments for this moderator" });

  const totalPaid = pending.reduce((a, p) => a + (p.moderatorOwed || 0), 0);
  const modUser   = db.users.find(u => u.id === moderatorId);
  const modSettings = db.moderatorSettings.find(s => s.userId === moderatorId);
  const now       = new Date().toISOString();

  // Mark each payment
  for (const p of pending) {
    p.payoutStatus = "paid";
    p.paidAt       = now;
    p.paidBy       = "superadmin";
  }

  // Log payout record
  const payoutRecord = {
    id:             uuidv4(),
    moderatorId,
    moderatorName:  modUser?.name  || "Unknown",
    moderatorEmail: modUser?.email || "",
    pesapalEmail:   modSettings?.pesapalEmail || modUser?.email || "",
    amountPaid:     +totalPaid.toFixed(2),
    currency:       pending[0]?.currency || "KES",
    paymentIds:     pending.map(p => p.id),
    paymentCount:   pending.length,
    notes,
    paidAt: now,
    paidBy: "superadmin",
    weekEnding: new Date().toISOString(),
  };
  db.moderatorPayouts.push(payoutRecord);
  saveDB(db);

  res.json({ success: true, payout: payoutRecord });
});

// GET /api/admin/payouts/history  — all past payout records
app.get("/api/admin/payouts/history", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  res.json((db.moderatorPayouts || []).slice().reverse());
});


// ═══════════════════════════════════════════════════════════════════════════
//  MODERATOR SETTINGS  (payout email only — no PesaPal credentials needed)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/moderator/settings
app.get("/api/moderator/settings", requireRole("moderator"), (req, res) => {
  const db = loadDB();
  const settings = db.moderatorSettings.find(s => s.userId === req.user.id);
  if (!settings) return res.json({ configured: false });
  res.json({ ...settings, configured: true });
});

// PUT /api/moderator/settings
// Moderators only need to save their PesaPal email (for receiving Sunday payouts)
app.put("/api/moderator/settings", requireRole("moderator"), (req, res) => {
  const { pesapalEmail, displayName } = req.body;
  if (!pesapalEmail)
    return res.status(400).json({ error: "pesapalEmail is required so we can send your weekly payout" });

  const db  = loadDB();
  const idx = db.moderatorSettings.findIndex(s => s.userId === req.user.id);
  const feePercent = getPlatformFeePercent();

  const settings = {
    userId:       req.user.id,
    pesapalEmail: pesapalEmail.trim().toLowerCase(),
    displayName:  displayName || "",
    feePercent,
    updatedAt:    new Date().toISOString(),
  };

  if (idx >= 0) db.moderatorSettings[idx] = settings;
  else          db.moderatorSettings.push(settings);
  saveDB(db);

  res.json({ ...settings, configured: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MODERATOR DASHBOARD  (earnings, groups, payout status)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/moderator/dashboard
app.get("/api/moderator/dashboard", requireRole("moderator"), (req, res) => {
  const db       = loadDB();
  const uid      = req.user.id;
  const myGroups = db.groups.filter(g => g.organizerId === uid);
  const settings = db.moderatorSettings.find(s => s.userId === uid);
  const feePercent = getPlatformFeePercent();

  const groupStats = myGroups.map(g => {
    const members   = db.groupMembers.filter(m => m.groupId === g.id && m.role !== "organizer");
    const confirmed = members.filter(m => m.paymentStatus === "confirmed").length;
    const payments  = db.payments.filter(p => p.groupId === g.id);
    const totalCollected = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const platformFees   = payments.reduce((acc, p) => acc + (p.platformFee || 0), 0);
    const modOwed        = payments.reduce((acc, p) => acc + (p.moderatorOwed || p.organizerGets || 0), 0);
    const modPaid        = payments.filter(p => p.payoutStatus === "paid").reduce((acc, p) => acc + (p.moderatorOwed || 0), 0);
    const modPending     = payments.filter(p => p.payoutStatus === "pending").reduce((acc, p) => acc + (p.moderatorOwed || 0), 0);
    return {
      id: g.id, serviceName: g.serviceName, serviceIcon: g.serviceIcon,
      planName: g.planName, status: g.status, reviewStatus: g.reviewStatus,
      billingCycle: g.billingCycle, maxSlots: g.maxSlots,
      confirmedMembers: confirmed, totalSlots: g.maxSlots,
      totalCollected:  +totalCollected.toFixed(2),
      platformFees:    +platformFees.toFixed(2),
      modOwed:         +modOwed.toFixed(2),
      modPaid:         +modPaid.toFixed(2),
      modPending:      +modPending.toFixed(2),
      createdAt: g.createdAt,
    };
  });

  const totalCollected = groupStats.reduce((a, g) => a + g.totalCollected, 0);
  const totalOwed      = groupStats.reduce((a, g) => a + g.modOwed, 0);
  const totalPaid      = groupStats.reduce((a, g) => a + g.modPaid, 0);
  const totalPending   = groupStats.reduce((a, g) => a + g.modPending, 0);
  const totalMembers   = groupStats.reduce((a, g) => a + g.confirmedMembers, 0);
  const pendingReview  = myGroups.filter(g => g.reviewStatus === "pending").length;
  const activeGroups   = myGroups.filter(g => g.status === "open" || g.status === "full").length;

  const payoutHistory = (db.moderatorPayouts || [])
    .filter(p => p.moderatorId === uid)
    .slice().reverse().slice(0, 10);

  res.json({
    groups: groupStats,
    summary: {
      totalGroups: myGroups.length, activeGroups, pendingReview, totalMembers,
      totalCollected: +totalCollected.toFixed(2),
      totalOwed:      +totalOwed.toFixed(2),
      totalPaid:      +totalPaid.toFixed(2),
      totalPending:   +totalPending.toFixed(2),
      feePercent,
      pesapalEmail:   settings?.pesapalEmail || "",
      configured:     !!settings,
    },
    payoutHistory,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — GROUP REVIEW
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/groups/pending
app.get("/api/admin/groups/pending", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  res.json(db.groups.filter(g => g.reviewStatus === "pending").map(g => {
    const organizer = db.users.find(u => u.id === g.organizerId);
    return { ...g, organizerDetails: organizer ? { name: organizer.name, email: organizer.email, phone: organizer.phone } : null };
  }));
});

// PATCH /api/admin/groups/:id/review
app.patch("/api/admin/groups/:id/review", requireSuperAdmin, (req, res) => {
  const { decision, note = "" } = req.body; // decision: "approved" | "rejected"
  if (!["approved","rejected"].includes(decision))
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });

  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  group.reviewStatus = decision;
  group.reviewNote   = note;
  group.reviewedAt   = new Date().toISOString();
  group.reviewedBy   = "superadmin";

  if (decision === "approved") {
    group.status = "open";
    // Notify organizer
    const organizer = db.users.find(u => u.id === group.organizerId);
    if (organizer) {
      emailService.sendEmail({
        to: organizer.email,
        subject: `✅ Your group "${group.serviceName} ${group.planName}" is now live!`,
        html: require("./emailService").sendEmail && `<p>Hi ${organizer.name},<br/><br/>Your group has been approved by the admin and is now live on SplitPass. Members can now discover and join it.<br/><br/>Log in to your dashboard to manage it.<br/><br/>— SplitPass Team</p>`,
      }).catch(() => {});
    }
  } else {
    group.status = "closed";
    const organizer = db.users.find(u => u.id === group.organizerId);
    if (organizer) {
      emailService.sendEmail({
        to: organizer.email,
        subject: `❌ Your group "${group.serviceName} ${group.planName}" was not approved`,
        html: `<p>Hi ${organizer.name},<br/><br/>Unfortunately your group listing was not approved.<br/><br/><b>Reason:</b> ${note || "Not specified"}<br/><br/>You may revise and resubmit.<br/><br/>— SplitPass Team</p>`,
      }).catch(() => {});
    }
  }

  saveDB(db);
  res.json(group);
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — EMAIL ORGANIZERS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/email-organizers
app.post("/api/admin/email-organizers", requireSuperAdmin, async (req, res) => {
  const { subject, body: msgBody, senderEmail, targetIds } = req.body;
  if (!subject || !msgBody) return res.status(400).json({ error: "subject and body required" });

  const db = loadDB();
  let targets = db.users.filter(u => u.role === "moderator" && u.status === "active");
  if (Array.isArray(targetIds) && targetIds.length > 0)
    targets = targets.filter(u => targetIds.includes(u.id));

  if (!targets.length) return res.status(400).json({ error: "No active organizers to email" });

  const from = senderEmail || process.env.ADMIN_EMAIL || "admin@splitpass.com";
  let sent = 0, failed = 0;

  await Promise.allSettled(targets.map(async u => {
    try {
      await emailService.sendGroupMessage({
        to:          u.email,
        memberName:  u.name,
        groupName:   "SplitPass Platform",
        serviceName: "SplitPass",
        senderName:  "SplitPass Admin",
        senderEmail: from,
        subject,
        messageBody: msgBody,
      });
      sent++;
    } catch { failed++; }
  }));

  // Log it
  const db2 = loadDB();
  if (!db2.newsletterSent) db2.newsletterSent = [];
  db2.newsletterSent.push({
    id: uuidv4(), type: "organizer-email",
    subject, body: msgBody, senderEmail: from,
    recipientCount: sent, sentAt: new Date().toISOString(), status: "sent",
  });
  saveDB(db2);

  res.json({
    message: `Email sent to ${sent} organizer${sent !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed.` : ""}`,
    sent, failed,
    note: process.env.EMAIL_ENABLED !== "true" ? "Set EMAIL_ENABLED=true to deliver real emails." : undefined,
  });
});

// GET /api/admin/organizer-email-history
app.get("/api/admin/organizer-email-history", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  const history = (db.newsletterSent || [])
    .filter(e => e.type === "organizer-email")
    .slice().reverse();
  res.json(history);
});

// ═══════════════════════════════════════════════════════════════════════════
//  NEWSLETTER  (super admin compose + subscriber list)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/newsletter/subscribers — list all newsletter subscribers
app.get("/api/admin/newsletter/subscribers", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  const subscribers = db.users
    .filter(u => u.newsletter === true)
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, joinedAt: u.createdAt }));
  // Also include footer sign-ups (stored separately)
  const footerSubs = (db.footerSubscribers || []);
  res.json({ subscribers, footerSubs, total: subscribers.length + footerSubs.length });
});

// POST /api/admin/newsletter/subscribe — footer subscribe (no account needed)
app.post("/api/newsletter/subscribe", async (req, res) => {
  const { email } = req.body;

  // ── Validate: format + disposable + DNS MX ──────────────────────────────
  const emailCheck = await validateEmail(email);
  if (!emailCheck.valid)
    return res.status(400).json({ error: emailCheck.reason });

  const db = loadDB();
  const already = db.footerSubscribers.find(s => s.email.toLowerCase() === email.toLowerCase())
    || db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.newsletter);
  if (already) return res.json({ message: "Already subscribed!" });

  db.footerSubscribers.push({ id: uuidv4(), email: email.toLowerCase().trim(), subscribedAt: new Date().toISOString() });
  saveDB(db);
  res.json({ message: "Subscribed successfully!" });
});

// POST /api/admin/newsletter/send — compose + log a newsletter send
// In production: integrate Resend / Mailgun / SendGrid here.
app.post("/api/admin/newsletter/send", requireSuperAdmin, (req, res) => {
  const { subject, body, senderName, senderEmail } = req.body;
  if (!subject || !body) return res.status(400).json({ error: "subject and body required" });

  const db = loadDB();
  if (!db.newsletterSent) db.newsletterSent = [];
  if (!db.footerSubscribers) db.footerSubscribers = [];

  const recipients = [
    ...db.users.filter(u => u.newsletter).map(u => u.email),
    ...db.footerSubscribers.map(s => s.email),
  ];
  const uniqueRecipients = [...new Set(recipients)];

  const campaign = {
    id:           uuidv4(),
    subject,
    body,
    senderName:   senderName  || process.env.ADMIN_USERNAME || "SplitPass Team",
    senderEmail:  senderEmail || process.env.ADMIN_EMAIL    || "newsletter@splitpass.com",
    recipientCount: uniqueRecipients.length,
    recipients:   uniqueRecipients,
    sentAt:       new Date().toISOString(),
    // TODO: replace this stub with real email delivery:
    // await resend.emails.send({ from: senderEmail, to: uniqueRecipients, subject, html: body });
    status:       "logged", // change to "sent" after integrating email provider
  };

  db.newsletterSent.push(campaign);
  saveDB(db);

  res.json({
    message:    `Newsletter logged. ${uniqueRecipients.length} recipient(s) queued.`,
    campaignId: campaign.id,
    recipientCount: uniqueRecipients.length,
    note: "Connect Resend/Mailgun in server.js to actually send emails.",
  });
});

// GET /api/admin/newsletter/history — sent campaigns
app.get("/api/admin/newsletter/history", requireSuperAdmin, (req, res) => {
  const db = loadDB();
  const history = (db.newsletterSent || []).slice().reverse();
  res.json(history);
});

// ═══════════════════════════════════════════════════════════════════════════
//  CREDENTIAL VAULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/groups/:id/credentials
 * Returns credentials ONLY to confirmed paying members of this group.
 * Organizer and superadmin can always view.
 */
app.get("/api/groups/:id/credentials", requireAuth, (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";

  // Paying member check — must be confirmed
  const membership = db.groupMembers.find(
    m => m.groupId === group.id && m.userId === req.user.id && m.role !== "organizer"
  );
  const isConfirmedMember = membership && membership.paymentStatus === "confirmed";

  // Superadmin, moderators, and the group organizer can always view credentials
  if (!isOrganizer && !isSuperAdmin && !isModerator && !isConfirmedMember) {
    return res.status(403).json({
      error: "Access denied. Complete payment to view credentials.",
      requiresPayment: !membership || membership.paymentStatus !== "confirmed",
    });
  }

  const creds = db.groupCredentials.find(c => c.groupId === req.params.id);
  if (!creds) return res.json({ exists: false, slots: [] });

  res.json({ exists: true, ...creds, canEdit: isOrganizer || isSuperAdmin || isModerator });
});

/**
 * PUT /api/groups/:id/credentials
 * Organizer or superadmin sets/updates credentials.
 * On update, notifies all confirmed paying members via email.
 * Body: { slots: [{ label, username, password, note }], generalNote }
 */
app.put("/api/groups/:id/credentials", requireAuth, async (req, res) => {
  const { slots = [], generalNote = "" } = req.body;
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";
  if (!isOrganizer && !isSuperAdmin && !isModerator) return res.status(403).json({ error: "Forbidden" });

  // Validate slots
  if (!Array.isArray(slots) || slots.length === 0)
    return res.status(400).json({ error: "At least one credential slot is required" });

  const isUpdate = !!db.groupCredentials.find(c => c.groupId === group.id);

  // Upsert credentials
  const idx = db.groupCredentials.findIndex(c => c.groupId === group.id);
  const credRecord = {
    groupId:     group.id,
    slots:       slots.map((s, i) => ({
      slotNumber: i + 1,
      label:      s.label || `Slot ${i + 1}`,
      username:   s.username || "",
      password:   s.password || "",
      note:       s.note    || "",
    })),
    generalNote,
    updatedAt:   new Date().toISOString(),
    updatedBy:   req.user.id,
  };

  if (idx >= 0) db.groupCredentials[idx] = credRecord;
  else          db.groupCredentials.push(credRecord);

  saveDB(db);

  // Notify confirmed paying members if this is an update
  if (isUpdate) {
    const confirmedMembers = db.groupMembers.filter(
      m => m.groupId === group.id && m.role !== "organizer" && m.paymentStatus === "confirmed"
    );
    confirmedMembers.forEach(m => {
      emailService.sendCredentialsUpdated({
        to:          m.email,
        memberName:  m.name,
        groupName:   `${group.serviceName} ${group.planName}`,
        serviceName: group.serviceName,
      }).catch(e => console.error("Cred update email error:", e.message));
    });
  }

  res.json({ message: isUpdate ? "Credentials updated." : "Credentials saved.", ...credRecord });
});

/**
 * DELETE /api/groups/:id/credentials
 * Organizer or superadmin clears all credentials.
 */
app.delete("/api/groups/:id/credentials", requireAuth, (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  const isModerator  = req.user.role === "moderator";
  if (!isOrganizer && !isSuperAdmin && !isModerator) return res.status(403).json({ error: "Forbidden" });

  db.groupCredentials = db.groupCredentials.filter(c => c.groupId !== group.id);
  saveDB(db);
  res.json({ message: "Credentials cleared." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GROUP EMAILS  (organizer + superadmin → paying members)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/groups/:id/emails
 * List all emails sent to this group's members.
 * Accessible by: organizer of the group OR superadmin.
 */
app.get("/api/groups/:id/emails", requireAuth, (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  if (!isOrganizer && !isSuperAdmin) return res.status(403).json({ error: "Forbidden" });

  const emails = (db.groupEmails || [])
    .filter(e => e.groupId === req.params.id)
    .slice().reverse();
  res.json(emails);
});

/**
 * POST /api/groups/:id/emails/send
 * Send a custom message to ALL paying confirmed members of this group.
 * Accessible by: organizer of the group OR superadmin.
 * Body: { subject, body, senderEmail? }
 */
app.post("/api/groups/:id/emails/send", requireAuth, async (req, res) => {
  const { subject, body: msgBody, senderEmail } = req.body;
  if (!subject || !msgBody) return res.status(400).json({ error: "subject and body required" });

  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  if (!isOrganizer && !isSuperAdmin) return res.status(403).json({ error: "Forbidden" });

  // Confirmed paying members only
  const members = db.groupMembers.filter(
    m => m.groupId === group.id && m.role !== "organizer" && m.paymentStatus === "confirmed"
  );

  if (members.length === 0)
    return res.status(400).json({ error: "No confirmed paying members to message yet." });

  // Determine sender name + email
  let senderName = group.organizerName;
  let fromEmail  = senderEmail || group.organizerEmail || process.env.ADMIN_EMAIL || "noreply@splitpass.com";
  if (isSuperAdmin && !isOrganizer) {
    senderName = process.env.ADMIN_USERNAME || "Super Admin";
    fromEmail  = senderEmail || process.env.ADMIN_EMAIL || "noreply@splitpass.com";
  }

  // Log campaign
  const campaign = {
    id:           uuidv4(),
    groupId:      group.id,
    groupName:    `${group.serviceName} ${group.planName}`,
    subject,
    body:         msgBody,
    senderName,
    senderEmail:  fromEmail,
    recipientCount: members.length,
    recipients:   members.map(m => m.email),
    sentAt:       new Date().toISOString(),
    sentBy:       req.user.id,
    status:       "sending",
  };
  if (!db.groupEmails) db.groupEmails = [];
  db.groupEmails.push(campaign);
  saveDB(db);

  // Send to each member individually (personalised greeting)
  let sent = 0, failed = 0;
  await Promise.allSettled(members.map(async m => {
    try {
      await emailService.sendGroupMessage({
        to:          m.email,
        memberName:  m.name,
        groupName:   `${group.serviceName} ${group.planName}`,
        serviceName: group.serviceName,
        senderName,
        senderEmail: fromEmail,
        subject,
        messageBody: msgBody,
      });
      sent++;
    } catch { failed++; }
  }));

  // Update campaign status
  const c = db.groupEmails.find(e => e.id === campaign.id);
  if (c) { c.status = failed === members.length ? "failed" : "sent"; c.sent = sent; c.failed = failed; }
  saveDB(db);

  res.json({
    message:  `Email sent to ${sent} member${sent !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed.` : ""}`,
    sent, failed, campaignId: campaign.id,
    note: process.env.EMAIL_ENABLED !== "true"
      ? "Set EMAIL_ENABLED=true and RESEND_API_KEY in .env to actually deliver emails."
      : undefined,
  });
});

/**
 * POST /api/groups/:id/emails/expiry-reminder
 * Manually trigger expiry reminder for a specific member (or all expiring within N days).
 * Accessible by: organizer OR superadmin.
 * Body: { memberId? , daysThreshold? }   — omit memberId to send to all expiring members
 */
app.post("/api/groups/:id/emails/expiry-reminder", requireAuth, async (req, res) => {
  const { memberId, daysThreshold = 7 } = req.body;
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  if (!isOrganizer && !isSuperAdmin) return res.status(403).json({ error: "Forbidden" });

  const now    = new Date();
  const thresh = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

  let targets = db.groupMembers.filter(
    m => m.groupId === group.id && m.role !== "organizer" && m.paymentStatus === "confirmed" && m.expiresAt
  );
  if (memberId) targets = targets.filter(m => m.id === memberId);
  else          targets = targets.filter(m => new Date(m.expiresAt) <= thresh);

  if (targets.length === 0)
    return res.json({ message: "No members match the expiry criteria.", sent: 0 });

  let sent = 0;
  await Promise.allSettled(targets.map(async m => {
    const expiry   = new Date(m.expiresAt);
    const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    try {
      if (daysLeft <= 0) {
        await emailService.sendExpiryToday({
          to: m.email, memberName: m.name,
          groupName:   `${group.serviceName} ${group.planName}`,
          serviceName: group.serviceName,
          renewUrl:    process.env.FRONTEND_URL,
          currency:    "KES", memberPays: group.memberPays,
        });
      } else {
        await emailService.sendExpiryWarning({
          to: m.email, memberName: m.name,
          groupName:   `${group.serviceName} ${group.planName}`,
          serviceName: group.serviceName,
          expiresAt:   m.expiresAt,
          renewUrl:    process.env.FRONTEND_URL,
          daysLeft,
          currency: "KES", memberPays: group.memberPays,
        });
      }
      sent++;
    } catch (e) { console.error("Expiry reminder error:", e.message); }
  }));

  res.json({ message: `Expiry reminder sent to ${sent} member${sent !== 1 ? "s" : ""}.`, sent });
});

/**
 * GET /api/groups/:id/members  — full member list for organizer dashboard
 * Returns confirmed members with expiry info.
 */
app.get("/api/groups/:id/members", requireAuth, (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const isOrganizer  = group.organizerId === req.user.id;
  const isSuperAdmin = req.user.role === "superadmin";
  if (!isOrganizer && !isSuperAdmin) return res.status(403).json({ error: "Forbidden" });

  const members = db.groupMembers
    .filter(m => m.groupId === group.id && m.role !== "organizer")
    .map(m => {
      const expiry   = m.expiresAt ? new Date(m.expiresAt) : null;
      const daysLeft = expiry ? Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)) : null;
      return { ...m, daysLeft };
    });
  res.json(members);
});

/**
 * POST /api/admin/expiry-scheduler
 * Manually trigger the global expiry scheduler (normally run by a cron).
 * Superadmin only.
 */
app.post("/api/admin/expiry-scheduler", requireSuperAdmin, async (req, res) => {
  try {
    await emailService.runExpiryScheduler(loadDB, saveDB);
    res.json({ message: "Expiry scheduler completed." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CURRENCY RATE  (display only — PesaPal handles actual conversion)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/currency/rate", (req, res) => {
  // KES per 1 USD — update RESEND_API_KEY in .env for live rates
  // For production, replace with a live forex API call
  const rate = parseFloat(process.env.KES_PER_USD || "130");
  res.json({ KES_PER_USD: rate, USD_PER_KES: +(1 / rate).toFixed(6), source: "env", note: "Update KES_PER_USD in .env to reflect current exchange rate." });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC STATS
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/stats", (req, res) => {
  const db = loadDB();
  const totalSaved = db.groups.reduce((acc, g) => {
    const mCount = db.groupMembers.filter(m => m.groupId === g.id).length;
    return acc + (mCount > 0 ? (g.totalPrice - g.pricePerSlot) * mCount : 0);
  }, 0);
  res.json({
    openGroups:     db.groups.filter(g => g.status === "open").length,
    fullGroups:     db.groups.filter(g => g.status === "full").length,
    totalMembers:   db.users.filter(u => u.role === "customer").length,
    totalOrganizers: db.users.filter(u => u.role === "moderator" && u.status === "active").length,
    totalSaved:     +totalSaved.toFixed(2),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 SplitPass API  →  http://localhost:${PORT}`);
  console.log(`💰 Platform fee   →  ${getPlatformFeePercent()}%`);
  console.log(`🌍 PesaPal env    →  ${process.env.PESAPAL_ENV || "sandbox"}`);
  console.log(`📧 Email enabled  →  ${process.env.EMAIL_ENABLED === "true" ? "YES" : "NO (stub mode)"}\n`);
  try { await pesapal.registerIPN(); }
  catch (e) { console.warn("⚠️  IPN pre-reg skipped:", e.message); }

  // ── Daily expiry scheduler — runs once at startup then every 24 hours ──
  async function runScheduler() {
    try { await emailService.runExpiryScheduler(loadDB, saveDB); }
    catch (e) { console.error("Scheduler error:", e.message); }
  }
  runScheduler(); // run immediately on boot
  setInterval(runScheduler, 24 * 60 * 60 * 1000); // then every 24h
});
