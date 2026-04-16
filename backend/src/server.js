require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs   = require("fs");
const path = require("path");
const pesapal = require("./pesapal");

const app  = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "../data/db.json");

// ── Platform fee config ───────────────────────────────────────────────────
const FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "2");

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// ── DB helpers ────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { groups: [], members: [], payments: [], pesapalOrders: [], platformEarnings: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!db.pesapalOrders)    db.pesapalOrders    = [];
  if (!db.platformEarnings) db.platformEarnings = [];
  return db;
}

function saveDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Fee calculator ────────────────────────────────────────────────────────
function calcFee(shareAmount) {
  const platformFee   = +(shareAmount * FEE_PERCENT / 100).toFixed(2);
  const memberPays    = +(shareAmount + platformFee).toFixed(2);
  const organizerGets = +shareAmount.toFixed(2);
  return { platformFee, memberPays, organizerGets };
}

// ── Subscription Catalogue ────────────────────────────────────────────────
const SERVICES = [
  { id: "spotify", name: "Spotify", icon: "🎵",
    plans: [
      { name: "Premium Duo",    price: 16.99, maxSlots: 2 },
      { name: "Premium Family", price: 17.99, maxSlots: 6 },
    ],
  },
  { id: "netflix", name: "Netflix", icon: "🎬",
    plans: [
      { name: "Standard", price: 15.49, maxSlots: 2 },
      { name: "Premium",  price: 22.99, maxSlots: 4 },
    ],
  },
  { id: "chatgpt", name: "ChatGPT Plus", icon: "🤖",
    plans: [{ name: "Family Plan", price: 30.00, maxSlots: 5 }],
  },
  { id: "claude", name: "Claude AI", icon: "✨",
    plans: [{ name: "Claude Max 5x", price: 100.00, maxSlots: 5 }],
  },
  { id: "youtube", name: "YouTube Premium", icon: "▶️",
    plans: [{ name: "Family Plan", price: 22.99, maxSlots: 6 }],
  },
  { id: "apple", name: "Apple One", icon: "🍎",
    plans: [{ name: "Family", price: 25.95, maxSlots: 6 }],
  },
  { id: "disney", name: "Disney+", icon: "🏰",
    plans: [
      { name: "Standard", price: 7.99,  maxSlots: 4 },
      { name: "Premium",  price: 13.99, maxSlots: 4 },
    ],
  },
  { id: "hbo", name: "Max (HBO)", icon: "👑",
    plans: [{ name: "Ultimate", price: 20.99, maxSlots: 4 }],
  },
];

// ─────────────────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────────────────

app.get("/api/services", (req, res) => res.json(SERVICES));

// Groups
app.get("/api/groups", (req, res) => {
  const db = loadDB();
  const enriched = db.groups.map((g) => {
    const members  = db.members.filter((m) => m.groupId === g.id);
    const payments = db.payments.filter((p) => p.groupId === g.id);
    return { ...g, memberCount: members.length, members, payments };
  });
  res.json(enriched);
});

app.post("/api/groups", (req, res) => {
  const { serviceId, planName, totalPrice, maxSlots, organizerName, organizerEmail, description } = req.body;
  if (!serviceId || !planName || !totalPrice || !maxSlots || !organizerName || !organizerEmail)
    return res.status(400).json({ error: "Missing required fields" });

  const db = loadDB();
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) return res.status(404).json({ error: "Service not found" });

  const pricePerSlot = +(totalPrice / maxSlots).toFixed(2);
  const { platformFee, memberPays } = calcFee(pricePerSlot);

  const group = {
    id: uuidv4(), serviceId,
    serviceName: service.name, serviceIcon: service.icon,
    planName, totalPrice: +totalPrice, maxSlots: +maxSlots,
    pricePerSlot, platformFee, memberPays, feePercent: FEE_PERCENT,
    organizerName, organizerEmail, description: description || "",
    status: "open", createdAt: new Date().toISOString(),
  };

  const organizerMember = {
    id: uuidv4(), groupId: group.id,
    name: organizerName, email: organizerEmail,
    role: "organizer", joinedAt: new Date().toISOString(),
    paymentStatus: "confirmed",
  };

  db.groups.push(group);
  db.members.push(organizerMember);
  saveDB(db);
  res.status(201).json({ ...group, members: [organizerMember], payments: [] });
});

app.get("/api/groups/:id", (req, res) => {
  const db = loadDB();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });
  const members  = db.members.filter((m) => m.groupId === group.id);
  const payments = db.payments.filter((p) => p.groupId === group.id);
  res.json({ ...group, members, payments });
});

app.patch("/api/groups/:id/status", (req, res) => {
  const { status } = req.body;
  const db = loadDB();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });
  group.status = status;
  saveDB(db);
  res.json(group);
});

// Members
app.post("/api/groups/:id/join", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });

  const db = loadDB();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group)                  return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open") return res.status(400).json({ error: "Group is not open for new members" });

  const members = db.members.filter((m) => m.groupId === group.id);
  if (members.length >= group.maxSlots)       return res.status(400).json({ error: "Group is full" });
  if (members.find((m) => m.email === email)) return res.status(400).json({ error: "Email already in group" });

  const member = {
    id: uuidv4(), groupId: group.id, name, email,
    role: "member", joinedAt: new Date().toISOString(), paymentStatus: "pending",
  };
  db.members.push(member);
  if (members.length + 1 >= group.maxSlots) group.status = "full";
  saveDB(db);
  res.status(201).json(member);
});

// ─────────────────────────────────────────────────────────────────────────
//  PESAPAL ROUTES
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/pesapal/initiate
 * Start a PesaPal checkout for a member paying their share + 2% fee
 */
app.post("/api/pesapal/initiate", async (req, res) => {
  const { groupId, memberId, currency = "KES" } = req.body;
  if (!groupId || !memberId)
    return res.status(400).json({ error: "groupId and memberId required" });

  const db     = loadDB();
  const group  = db.groups.find((g) => g.id === groupId);
  const member = db.members.find((m) => m.id === memberId);

  if (!group)  return res.status(404).json({ error: "Group not found" });
  if (!member) return res.status(404).json({ error: "Member not found" });
  if (member.paymentStatus === "confirmed")
    return res.status(400).json({ error: "Member has already paid" });

  const { platformFee, memberPays, organizerGets } = calcFee(group.pricePerSlot);
  const internalOrderId = `SP-${Date.now()}-${uuidv4().slice(0,8).toUpperCase()}`;
  const callbackUrl =
    `${process.env.FRONTEND_URL || "http://localhost:3000"}` +
    `/payment-callback?orderId=${internalOrderId}&groupId=${groupId}&memberId=${memberId}`;

  try {
    const nameParts = (member.name || "Member").split(" ");
    const { redirectUrl, orderTrackingId } = await pesapal.submitOrder({
      orderId:     internalOrderId,
      amount:      memberPays,
      currency,
      description: `SplitPass: ${group.serviceName} ${group.planName} — ${member.name}`,
      firstName:   nameParts[0],
      lastName:    nameParts.slice(1).join(" ") || "",
      email:       member.email,
      phone:       member.phone || "",
      callbackUrl,
    });

    db.pesapalOrders.push({
      id: internalOrderId, orderTrackingId,
      groupId, memberId, memberName: member.name, memberEmail: member.email,
      shareAmount: group.pricePerSlot, platformFee, organizerGets, memberPays,
      currency, status: "PENDING",
      createdAt: new Date().toISOString(), confirmedAt: null,
    });
    saveDB(db);

    res.json({ redirectUrl, orderId: internalOrderId, memberPays, platformFee, organizerGets });
  } catch (err) {
    console.error("PesaPal initiate error:", err.message);
    res.status(502).json({ error: `Payment gateway error: ${err.message}` });
  }
});

/**
 * GET /api/pesapal/verify?orderId=SP-xxx
 * Frontend calls this after PesaPal redirects back to verify the payment
 */
app.get("/api/pesapal/verify", async (req, res) => {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  const db    = loadDB();
  const order = db.pesapalOrders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  // If already confirmed, return cached result
  if (order.status === "COMPLETED") {
    return res.json({
      status: "COMPLETED", memberPays: order.memberPays,
      platformFee: order.platformFee, organizerGets: order.organizerGets,
      pesapalStatus: "Completed",
    });
  }

  try {
    const statusData = await pesapal.getTransactionStatus(order.orderTrackingId);
    const statusCode = statusData.payment_status_description;

    order.pesapalStatus = statusCode;
    order.rawStatus     = statusData;

    if (statusCode === "Completed") {
      order.status      = "COMPLETED";
      order.confirmedAt = new Date().toISOString();

      const member = db.members.find((m) => m.id === order.memberId);
      if (member) member.paymentStatus = "confirmed";

      if (!db.payments.find((p) => p.pesapalOrderId === orderId)) {
        db.payments.push({
          id: uuidv4(), groupId: order.groupId, memberId: order.memberId,
          memberName: order.memberName, amount: order.memberPays,
          organizerGets: order.organizerGets, platformFee: order.platformFee,
          method: "pesapal", pesapalOrderId: orderId, confirmedAt: order.confirmedAt,
        });
        db.platformEarnings.push({
          id: uuidv4(), orderId, groupId: order.groupId, memberId: order.memberId,
          fee: order.platformFee, currency: order.currency, earnedAt: order.confirmedAt,
        });
      }

      // Auto-close group if fully paid
      const group = db.groups.find((g) => g.id === order.groupId);
      if (group) {
        const confirmed = db.members.filter(
          (m) => m.groupId === group.id && m.paymentStatus === "confirmed"
        ).length;
        if (confirmed >= group.maxSlots) group.status = "full";
      }
    } else if (["Failed", "Invalid"].includes(statusCode)) {
      order.status = "FAILED";
    }

    saveDB(db);
    res.json({
      status: order.status, memberPays: order.memberPays,
      platformFee: order.platformFee, organizerGets: order.organizerGets,
      pesapalStatus: statusCode,
    });
  } catch (err) {
    console.error("PesaPal verify error:", err.message);
    res.status(502).json({ error: `Verification error: ${err.message}` });
  }
});

/**
 * POST /api/pesapal/ipn
 * PesaPal calls this automatically when payment status changes
 */
app.post("/api/pesapal/ipn", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.body;
  console.log(`📩 IPN | Ref: ${OrderMerchantReference} | Track: ${OrderTrackingId}`);
  res.sendStatus(200); // Always respond 200 first

  if (!OrderTrackingId) return;

  try {
    const db    = loadDB();
    const order = db.pesapalOrders.find((o) => o.id === OrderMerchantReference);
    if (!order || order.status === "COMPLETED") return;

    const statusData = await pesapal.getTransactionStatus(OrderTrackingId);
    const statusCode = statusData.payment_status_description;

    order.pesapalStatus   = statusCode;
    order.orderTrackingId = OrderTrackingId;

    if (statusCode === "Completed") {
      order.status      = "COMPLETED";
      order.confirmedAt = new Date().toISOString();

      const member = db.members.find((m) => m.id === order.memberId);
      if (member) member.paymentStatus = "confirmed";

      if (!db.payments.find((p) => p.pesapalOrderId === order.id)) {
        db.payments.push({
          id: uuidv4(), groupId: order.groupId, memberId: order.memberId,
          memberName: order.memberName, amount: order.memberPays,
          organizerGets: order.organizerGets, platformFee: order.platformFee,
          method: "pesapal", pesapalOrderId: order.id, confirmedAt: order.confirmedAt,
        });
        db.platformEarnings.push({
          id: uuidv4(), orderId: order.id, groupId: order.groupId,
          memberId: order.memberId, fee: order.platformFee,
          currency: order.currency, earnedAt: order.confirmedAt,
        });
      }

      const group = db.groups.find((g) => g.id === order.groupId);
      if (group) {
        const confirmed = db.members.filter(
          (m) => m.groupId === group.id && m.paymentStatus === "confirmed"
        ).length;
        if (confirmed >= group.maxSlots) group.status = "full";
      }
    }
    saveDB(db);
  } catch (err) {
    console.error("IPN processing error:", err.message);
  }
});

/**
 * GET /api/admin/earnings
 * Platform earnings dashboard — protect this with auth in production!
 */
app.get("/api/admin/earnings", (req, res) => {
  const db = loadDB();
  const total = db.platformEarnings.reduce((acc, e) => acc + (e.fee || 0), 0);
  const byGroup = db.groups.map((g) => {
    const fees = db.platformEarnings
      .filter((e) => e.groupId === g.id)
      .reduce((acc, e) => acc + e.fee, 0);
    return { groupId: g.id, serviceName: g.serviceName, planName: g.planName, fees: +fees.toFixed(2) };
  }).filter((g) => g.fees > 0);

  res.json({
    totalEarned:    +total.toFixed(2),
    feePercent:     FEE_PERCENT,
    earningsCount:  db.platformEarnings.length,
    pendingOrders:  db.pesapalOrders.filter((o) => o.status === "PENDING").length,
    byGroup,
    recentEarnings: db.platformEarnings.slice(-20).reverse(),
  });
});

// Stats
app.get("/api/stats", (req, res) => {
  const db = loadDB();
  const openGroups   = db.groups.filter((g) => g.status === "open").length;
  const fullGroups   = db.groups.filter((g) => g.status === "full").length;
  const totalMembers = db.members.length;
  const totalSaved   = db.groups.reduce((acc, g) => {
    const mCount = db.members.filter((m) => m.groupId === g.id).length;
    return acc + (mCount > 0 ? (g.totalPrice - g.pricePerSlot) * mCount : 0);
  }, 0);
  const platformEarned = db.platformEarnings.reduce((acc, e) => acc + (e.fee || 0), 0);
  res.json({ openGroups, fullGroups, totalMembers, totalSaved: +totalSaved.toFixed(2), platformEarned: +platformEarned.toFixed(2) });
});

// Legacy manual payment (kept for backward compat)
app.post("/api/groups/:groupId/payments", (req, res) => {
  const { memberId, amount, method, note } = req.body;
  if (!memberId || !amount || !method)
    return res.status(400).json({ error: "Missing fields" });
  const db = loadDB();
  const group  = db.groups.find((g) => g.id === req.params.groupId);
  const member = db.members.find((m) => m.id === memberId);
  if (!group)  return res.status(404).json({ error: "Group not found" });
  if (!member) return res.status(404).json({ error: "Member not found" });
  const payment = {
    id: uuidv4(), groupId: group.id, memberId,
    memberName: member.name, amount: +amount, method, note: note || "",
    confirmedAt: new Date().toISOString(),
  };
  member.paymentStatus = "confirmed";
  db.payments.push(payment);
  saveDB(db);
  res.status(201).json(payment);
});

// Start
app.listen(PORT, async () => {
  console.log(`\n🚀 SplitPass API  →  http://localhost:${PORT}`);
  console.log(`💰 Platform fee   →  ${FEE_PERCENT}%`);
  console.log(`🌍 PesaPal env    →  ${process.env.PESAPAL_ENV || "sandbox"}\n`);
  try {
    await pesapal.registerIPN();
  } catch (e) {
    console.warn("⚠️  IPN pre-registration skipped (add real keys to .env):", e.message);
  }
});
