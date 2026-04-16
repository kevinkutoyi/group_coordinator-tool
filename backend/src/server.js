const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "../data/db.json");

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { groups: [], members: [], payments: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Subscription Catalogue ───────────────────────────────────────────────────
const SERVICES = [
  {
    id: "spotify",
    name: "Spotify",
    icon: "🎵",
    plans: [
      { name: "Premium Duo",    price: 16.99, maxSlots: 2 },
      { name: "Premium Family", price: 17.99, maxSlots: 6 },
    ],
  },
  {
    id: "netflix",
    name: "Netflix",
    icon: "🎬",
    plans: [
      { name: "Standard",  price: 15.49, maxSlots: 2 },
      { name: "Premium",   price: 22.99, maxSlots: 4 },
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    icon: "🤖",
    plans: [
      { name: "Family Plan", price: 30.00, maxSlots: 5 },
    ],
  },
  {
    id: "claude",
    name: "Claude AI",
    icon: "✨",
    plans: [
      { name: "Claude Max 5x", price: 100.00, maxSlots: 5 },
    ],
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    icon: "▶️",
    plans: [
      { name: "Family Plan", price: 22.99, maxSlots: 6 },
    ],
  },
  {
    id: "apple",
    name: "Apple One",
    icon: "🍎",
    plans: [
      { name: "Family", price: 25.95, maxSlots: 6 },
    ],
  },
  {
    id: "disney",
    name: "Disney+",
    icon: "🏰",
    plans: [
      { name: "Standard",  price: 7.99,  maxSlots: 4 },
      { name: "Premium",   price: 13.99, maxSlots: 4 },
    ],
  },
  {
    id: "hbo",
    name: "Max (HBO)",
    icon: "👑",
    plans: [
      { name: "Ultimate", price: 20.99, maxSlots: 4 },
    ],
  },
];

// ── Routes: Services ─────────────────────────────────────────────────────────
app.get("/api/services", (req, res) => res.json(SERVICES));

// ── Routes: Groups ───────────────────────────────────────────────────────────
app.get("/api/groups", (req, res) => {
  const db = loadDB();
  const enriched = db.groups.map((g) => {
    const members = db.members.filter((m) => m.groupId === g.id);
    const payments = db.payments.filter((p) => p.groupId === g.id);
    return { ...g, memberCount: members.length, members, payments };
  });
  res.json(enriched);
});

app.post("/api/groups", (req, res) => {
  const { serviceId, planName, totalPrice, maxSlots, organizerName, organizerEmail, description } = req.body;
  if (!serviceId || !planName || !totalPrice || !maxSlots || !organizerName || !organizerEmail) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const db = loadDB();
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) return res.status(404).json({ error: "Service not found" });

  const pricePerSlot = +(totalPrice / maxSlots).toFixed(2);
  const group = {
    id: uuidv4(),
    serviceId,
    serviceName: service.name,
    serviceIcon: service.icon,
    planName,
    totalPrice: +totalPrice,
    maxSlots: +maxSlots,
    pricePerSlot,
    organizerName,
    organizerEmail,
    description: description || "",
    status: "open",
    createdAt: new Date().toISOString(),
  };

  // Auto-add organizer as first member
  const organizerMember = {
    id: uuidv4(),
    groupId: group.id,
    name: organizerName,
    email: organizerEmail,
    role: "organizer",
    joinedAt: new Date().toISOString(),
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
  const members = db.members.filter((m) => m.groupId === group.id);
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

// ── Routes: Members ──────────────────────────────────────────────────────────
app.post("/api/groups/:id/join", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });

  const db = loadDB();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.status !== "open") return res.status(400).json({ error: "Group is not open for new members" });

  const members = db.members.filter((m) => m.groupId === group.id);
  if (members.length >= group.maxSlots) return res.status(400).json({ error: "Group is full" });
  if (members.find((m) => m.email === email)) return res.status(400).json({ error: "Email already in group" });

  const member = {
    id: uuidv4(),
    groupId: group.id,
    name,
    email,
    role: "member",
    joinedAt: new Date().toISOString(),
    paymentStatus: "pending",
  };
  db.members.push(member);

  // Auto-fill group when at max
  if (members.length + 1 >= group.maxSlots) {
    group.status = "full";
  }

  saveDB(db);
  res.status(201).json(member);
});

// ── Routes: Payments ─────────────────────────────────────────────────────────
app.post("/api/groups/:groupId/payments", (req, res) => {
  const { memberId, amount, method, note } = req.body;
  if (!memberId || !amount || !method) return res.status(400).json({ error: "Missing fields" });

  const db = loadDB();
  const group = db.groups.find((g) => g.id === req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ error: "Member not found" });

  const payment = {
    id: uuidv4(),
    groupId: group.id,
    memberId,
    memberName: member.name,
    amount: +amount,
    method,
    note: note || "",
    confirmedAt: new Date().toISOString(),
  };

  member.paymentStatus = "confirmed";
  db.payments.push(payment);
  saveDB(db);
  res.status(201).json(payment);
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const db = loadDB();
  const openGroups   = db.groups.filter((g) => g.status === "open").length;
  const fullGroups   = db.groups.filter((g) => g.status === "full").length;
  const totalMembers = db.members.length;
  const totalSaved   = db.groups.reduce((acc, g) => {
    const members = db.members.filter((m) => m.groupId === g.id).length;
    const saved = members > 0 ? (g.totalPrice - g.pricePerSlot) * members : 0;
    return acc + saved;
  }, 0);
  res.json({ openGroups, fullGroups, totalMembers, totalSaved: +totalSaved.toFixed(2) });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 GroupBuy API running on http://localhost:${PORT}`));
