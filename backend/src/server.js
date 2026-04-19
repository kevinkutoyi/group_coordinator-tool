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

const app  = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "../data/db.json");
const FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "2");
const JWT_SECRET  = process.env.JWT_SECRET || "dev_secret_change_in_production";

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
      emailVerifications: [], footerSubscribers: [], newsletterSent: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  // Ensure all collections exist in older DB files
  ["users","groups","groupMembers","payments","pesapalOrders","platformEarnings","emailVerifications","footerSubscribers","newsletterSent"]
    .forEach(k => { if (!db[k]) db[k] = []; });
  return db;
}
function saveDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// ── Helpers ───────────────────────────────────────────────────────────────
function calcFee(amount, months = 1) {
  const base         = +(amount * months).toFixed(2);
  const platformFee  = +(base * FEE_PERCENT / 100).toFixed(2);
  const memberPays   = +(base + platformFee).toFixed(2);
  const organizerGets = base;
  return { base, platformFee, memberPays, organizerGets };
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

// GET /api/groups — public list
app.get("/api/groups", (req, res) => {
  const db = loadDB();
  const enriched = db.groups.map(g => {
    const members  = db.groupMembers.filter(m => m.groupId === g.id);
    const payments = db.payments.filter(p => p.groupId === g.id);
    // Don't expose member emails publicly
    const safeMembers = members.map(({ email, ...m }) => m);
    return { ...g, memberCount: members.length, members: safeMembers, payments };
  });
  res.json(enriched);
});

// GET /api/groups/:id — public detail
app.get("/api/groups/:id", (req, res) => {
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });
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

  const pricePerSlot = +(totalPrice / maxSlots).toFixed(2);
  const { platformFee, memberPays } = calcFee(pricePerSlot, 1);

  const group = {
    id:            uuidv4(),
    serviceId,
    serviceName:   service.name,
    serviceIcon:   service.icon,
    planName,
    totalPrice:    +totalPrice,
    maxSlots:      +maxSlots,
    pricePerSlot,
    platformFee,
    memberPays,
    feePercent:    FEE_PERCENT,
    organizerId:   req.user.id,
    organizerName: creatorName,
    organizerEmail: creatorEmail,
    description:   description || "",
    billingCycle:  billingCycle,
    status:        "open",
    createdAt:     new Date().toISOString(),
  };

  // Organizer is auto-added as confirmed member (they own the plan)
  db.groupMembers.push({
    id:            uuidv4(),
    groupId:       group.id,
    userId:        req.user.id,
    name:          creatorName,
    email:         creatorEmail,
    role:          "organizer",
    months:        1,
    totalPaid:     0,
    paymentStatus: "confirmed",
    joinedAt:      new Date().toISOString(),
  });

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

// POST /api/groups/:id/join
app.post("/api/groups/:id/join", requireRole("customer", "superadmin"), (req, res) => {
  const { months = 1 } = req.body;
  const db    = loadDB();
  const group = db.groups.find(g => g.id === req.params.id);
  if (!group)                   return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open")  return res.status(400).json({ error: "Group is not accepting new members" });

  const validDuration = SUBSCRIPTION_DURATIONS.find(d => d.months === parseInt(months));
  if (!validDuration) return res.status(400).json({ error: "Invalid subscription duration" });

  const allMembers = db.groupMembers.filter(m => m.groupId === group.id);
  if (allMembers.length >= group.maxSlots) return res.status(400).json({ error: "Group is full" });
  if (allMembers.find(m => m.userId === req.user.id))
    return res.status(400).json({ error: "You are already a member of this group" });

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
  if (allMembers.length + 1 >= group.maxSlots) group.status = "full";
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

  const orderId    = `SP-${Date.now()}-${uuidv4().slice(0,8).toUpperCase()}`;
  const callbackUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-callback?orderId=${orderId}&groupId=${groupId}&memberId=${memberId}`;

  try {
    const nameParts = member.name.split(" ");
    const { redirectUrl, orderTrackingId } = await pesapal.submitOrder({
      orderId, amount: member.memberPays, currency,
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
      organizerGets: member.organizerGets,
      memberPays:    member.memberPays,
      currency, status: "PENDING",
      createdAt: new Date().toISOString(), confirmedAt: null,
    });
    saveDB(db);
    res.json({ redirectUrl, orderId, memberPays: member.memberPays, platformFee: member.platformFee });
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
        // Set expiry from today + months
        const exp = new Date();
        exp.setMonth(exp.getMonth() + (order.months || 1));
        member.expiresAt = exp.toISOString();
      }
      if (!db.payments.find(p => p.pesapalOrderId === orderId)) {
        db.payments.push({
          id: uuidv4(), groupId: order.groupId, memberId: order.memberId,
          userId: order.userId, memberName: order.memberName,
          months: order.months, amount: order.memberPays,
          organizerGets: order.organizerGets, platformFee: order.platformFee,
          method: "pesapal", pesapalOrderId: orderId, confirmedAt: order.confirmedAt,
        });
        db.platformEarnings.push({
          id: uuidv4(), orderId, groupId: order.groupId,
          fee: order.platformFee, currency: order.currency, earnedAt: order.confirmedAt,
        });
      }
      const group = db.groups.find(g => g.id === order.groupId);
      if (group) {
        const confirmed = db.groupMembers.filter(m => m.groupId === group.id && m.paymentStatus === "confirmed").length;
        if (confirmed >= group.maxSlots) group.status = "full";
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
          organizerGets: order.organizerGets, platformFee: order.platformFee,
          method: "pesapal", pesapalOrderId: order.id, confirmedAt: order.confirmedAt,
        });
        db.platformEarnings.push({ id: uuidv4(), orderId: order.id, groupId: order.groupId, fee: order.platformFee, currency: order.currency, earnedAt: order.confirmedAt });
      }
      const group = db.groups.find(g => g.id === order.groupId);
      if (group) {
        const confirmed = db.groupMembers.filter(m => m.groupId === group.id && m.paymentStatus === "confirmed").length;
        if (confirmed >= group.maxSlots) group.status = "full";
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

  res.json({
    totalEarned:     +total.toFixed(2),
    feePercent:      FEE_PERCENT,
    earningsCount:   db.platformEarnings.length,
    pendingOrders:   db.pesapalOrders.filter(o => o.status === "PENDING").length,
    completedOrders: db.pesapalOrders.filter(o => o.status === "COMPLETED").length,
    totalGroups:     db.groups.length,
    totalUsers:      db.users.length,
    pendingModerators: db.users.filter(u => u.role === "moderator" && u.status === "pending").length,
    byGroup,
    monthlyEarnings,
    recentEarnings:  db.platformEarnings.slice(-20).reverse(),
  });
});

app.get("/api/admin/refresh", requireSuperAdmin, (req, res) => {
  const token = signToken({ id: "superadmin", role: "superadmin", name: "Super Admin" }, "24h");
  res.json({ token });
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
    totalSaved:     +totalSaved.toFixed(2),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 SplitPass API  →  http://localhost:${PORT}`);
  console.log(`💰 Platform fee   →  ${FEE_PERCENT}%`);
  console.log(`🌍 PesaPal env    →  ${process.env.PESAPAL_ENV || "sandbox"}\n`);
  try { await pesapal.registerIPN(); }
  catch (e) { console.warn("⚠️  IPN pre-reg skipped:", e.message); }
});
