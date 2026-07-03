const fs = require('fs');

console.log('Starting Paystack migration...\n');

// ── 1. Create paystack.js ─────────────────────────────────────────────────
fs.writeFileSync('backend/src/paystack.js', `const https = require("https");
const crypto = require("crypto");

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.paystack.co",
      path, method,
      headers: {
        Authorization: "Bearer " + SECRET_KEY,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve({ status: false }); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function initializeTransaction({ email, amount, reference, callbackUrl, metadata }) {
  const result = await paystackRequest("POST", "/transaction/initialize", {
    email, amount: Math.round(amount * 100),
    reference, callback_url: callbackUrl,
    currency: "USD", metadata: metadata || {},
  });
  if (!result.status) throw new Error(result.message || "Paystack initialization failed");
  return {
    authorizationUrl: result.data.authorization_url,
    accessCode:       result.data.access_code,
    reference:        result.data.reference,
  };
}

async function verifyTransaction(reference) {
  const result = await paystackRequest("GET", "/transaction/verify/" + encodeURIComponent(reference));
  if (!result.status) throw new Error(result.message || "Verification failed");
  return {
    status:    result.data.status,
    amount:    result.data.amount / 100,
    currency:  result.data.currency,
    reference: result.data.reference,
    email:     result.data.customer && result.data.customer.email,
    paidAt:    result.data.paid_at,
  };
}

function verifyWebhookSignature(rawBody, signature) {
  const hash = crypto.createHmac("sha512", SECRET_KEY).update(rawBody).digest("hex");
  return hash === signature;
}

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature };
`);
console.log('✓ paystack.js created');

// ── 2. Update server.js ───────────────────────────────────────────────────
let server = fs.readFileSync('backend/src/server.js', 'utf8');
const lines = server.split('\n');

// Replace pesapal require
server = server.replace(
  'const pesapal    = require("./pesapal");',
  'const paystack   = require("./paystack");'
);

// Add public key constant
if (!server.includes('PAYSTACK_PUBLIC_KEY')) {
  server = server.replace(
    'const JWT_SECRET = process.env.JWT_SECRET',
    'const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";\nconst JWT_SECRET = process.env.JWT_SECRET'
  );
}

// Replace PesaPal payment section header and initiate endpoint
if (!server.includes('/api/paystack/initiate')) {
  const pesapalHeader = '//  PESAPAL PAYMENT';
  const idx = server.indexOf(pesapalHeader);
  if (idx !== -1) {
    // Find the end of pesapal initiate endpoint (before confirmOrder)
    const confirmOrderIdx = server.indexOf('// Shared order-confirmation logic');
    const before = server.slice(0, idx - 80); // remove the === line before
    const after  = server.slice(confirmOrderIdx);

    const paystackSection = `//  PAYSTACK PAYMENT
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
`;
    server = before + '// ═══════════════════════════════════════════════════════════════════════════\n' + paystackSection + after;
    console.log('✓ Paystack initiate endpoint added');
  }
}

// Update confirmOrder to use paystackOrder
server = server.replace(
  'async function confirmOrder(orderId) {\n  const order = await prisma.pesapalOrder.findUnique({ where: { id: orderId } });',
  'async function confirmOrder(reference) {\n  const order = await prisma.paystackOrder.findUnique({ where: { id: reference } });'
);
server = server.replace(
  'if (!order || order.status === "COMPLETED") return order;\n\n  const statusData = await pesapal.getTransactionStatus(order.orderTrackingId);\n  const code       = statusData.payment_status_description;\n\n  await prisma.pesapalOrder.update({ where: { id: orderId }, data: { pesapalStatus: code } });',
  'if (!order || order.status === "COMPLETED") return order;\n\n  const txData = await paystack.verifyTransaction(reference);\n  const code   = txData.status;\n\n  await prisma.paystackOrder.update({ where: { id: reference }, data: { paystackStatus: code } });'
);
server = server.replace(/\bcode === "Completed"\b/g, 'code === "success"');
server = server.replace(/\["Failed", "Invalid"\]\.includes\(code\)/g, '["failed", "abandoned"].includes(code)');
server = server.replace(/prisma\.pesapalOrder\.update\({ where: { id: orderId }/g, 'prisma.paystackOrder.update({ where: { id: reference }');
server = server.replace(/prisma\.pesapalOrder\.findUnique\({ where: { id: orderId/g, 'prisma.paystackOrder.findUnique({ where: { id: reference');
server = server.replace('return prisma.pesapalOrder.findUnique({ where: { id: orderId } });', 'return prisma.paystackOrder.findUnique({ where: { id: reference } });');

// Replace verify endpoint
if (server.includes('/api/pesapal/verify')) {
  const oldVerify = server.slice(server.indexOf('app.get("/api/pesapal/verify"'), server.indexOf('\n\napp.post("/api/pesapal/ipn"'));
  server = server.replace(oldVerify, `app.get("/api/paystack/verify", async (req, res) => {
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
})`);
  console.log('✓ Verify endpoint updated');
}

// Replace IPN with webhook
if (server.includes('/api/pesapal/ipn')) {
  const oldIpnStart = server.indexOf('app.post("/api/pesapal/ipn"');
  const oldIpnEnd   = server.indexOf('\n\n// ═', oldIpnStart);
  server = server.slice(0, oldIpnStart) +
    `app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req, res) => {
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
});` +
    server.slice(oldIpnEnd);
  console.log('✓ IPN replaced with Paystack webhook');
}

// Replace startup IPN registration
server = server.replace(
  'try { await pesapal.registerIPN(); } catch (e) { console.warn("⚠️  IPN pre-reg skipped:", e.message); }',
  'console.log("✅ Paystack webhook ready at /api/paystack/webhook");'
);

fs.writeFileSync('backend/src/server.js', server);
console.log('✓ server.js updated');

// ── 3. Update Prisma schema ───────────────────────────────────────────────
let schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');

if (!schema.includes('PaystackOrder')) {
  schema += `
model PaystackOrder {
  id             String    @id
  reference      String    @unique
  groupId        String
  memberId       String
  userId         String
  memberName     String
  memberEmail    String
  months         Int
  baseAmount     Float
  platformFee    Float
  moderatorOwed  Float
  organizerGets  Float
  moderatorId    String
  memberPays     Float
  currency       String    @default("USD")
  paystackStatus String?
  status         String    @default("PENDING")
  confirmedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
`;
  fs.writeFileSync('backend/prisma/schema.prisma', schema);
  console.log('✓ PaystackOrder model added to schema');
} else {
  console.log('⚠ PaystackOrder already in schema');
}

// ── 4. Update api.js ──────────────────────────────────────────────────────
let api = fs.readFileSync('frontend/src/api.js', 'utf8');

api = api.replace(
  'initiatePay:  (body)       => req("/pesapal/initiate",   { method: "POST", body }),',
  'initiatePay:  (body)       => req("/paystack/initiate",  { method: "POST", body }),'
);
api = api.replace(
  'verifyPay:    (orderId)    => req(`/pesapal/verify?orderId=${orderId}`),',
  'verifyPay:    (reference)  => req(`/paystack/verify?reference=${reference}`),'
);
if (!api.includes('getPaystackConfig')) {
  api = api.replace(
    'getCurrencyRate: () => req("/currency/rate"),',
    'getCurrencyRate:   () => req("/currency/rate"),\n  getPaystackConfig: () => req("/paystack/config"),'
  );
}
fs.writeFileSync('frontend/src/api.js', api);
console.log('✓ api.js updated');

// ── 5. Update GroupDetailPage.js ──────────────────────────────────────────
let gdp = fs.readFileSync('frontend/src/pages/GroupDetailPage.js', 'utf8');

// Remove showCurrency and kesToUsd state
gdp = gdp.replace(`  const [showCurrency, setCurrency] = useState(null);\n`, '');
gdp = gdp.replace(`  const [kesToUsd, setKesToUsd]   = useState(130);\n`, '');

// Replace getCurrencyRate call
gdp = gdp.replace(`    api.getCurrencyRate().then(r => setKesToUsd(r.KES_PER_USD)).catch(() => {});\n`, '');

// Replace handleCurrencyConfirm with handlePay
if (!gdp.includes('async function handlePay')) {
  gdp = gdp.replace(
    `  async function handleCurrencyConfirm(member, currency) {
    setCurrency(null);
    setPayingId(member.id);
    try {
      const res = await api.initiatePay({ groupId: id, memberId: member.id, currency });
      window.location.href = res.redirectUrl;
    } catch (err) { setMsg({ type: "err", text: err.message }); setPayingId(null); }
  }`,
    `  async function handlePay(member) {
    setPayingId(member.id);
    try {
      const res = await api.initiatePay({ groupId: id, memberId: member.id });
      window.location.href = res.redirectUrl;
    } catch (err) { setMsg({ type: "err", text: err.message }); setPayingId(null); }
  }`
  );
  console.log('✓ handlePay added to GroupDetailPage');
}

// Replace setCurrency(m) with handlePay(m) on Pay button
gdp = gdp.replace('onClick={() => setCurrency(m)}', 'onClick={() => handlePay(m)}');

// Replace setCurrency in renew button  
gdp = gdp.replace('setCurrency({ ...m, memberPays: group.pricePerSlot });', 'handlePay(m);');

// Remove currency picker modal
const currencyModalIdx = gdp.indexOf('{/* ── Currency picker modal ── */}');
if (currencyModalIdx !== -1) {
  const endPattern = "})()}";
  const endIdx = gdp.indexOf(endPattern, currencyModalIdx);
  if (endIdx !== -1) {
    gdp = gdp.slice(0, currencyModalIdx) + gdp.slice(endIdx + endPattern.length);
    console.log('✓ Currency picker modal removed');
  }
}

fs.writeFileSync('frontend/src/pages/GroupDetailPage.js', gdp);
console.log('✓ GroupDetailPage.js updated');

// ── 6. Update PaymentCallbackPage.js ─────────────────────────────────────
let callback = fs.readFileSync('frontend/src/pages/PaymentCallbackPage.js', 'utf8');
callback = callback.replace(/orderId/g, 'reference');
fs.writeFileSync('frontend/src/pages/PaymentCallbackPage.js', callback);
console.log('✓ PaymentCallbackPage.js updated');

// ── 7. Update .env files ──────────────────────────────────────────────────
let envExample = fs.readFileSync('backend/.env.example', 'utf8');
envExample = envExample.replace(
  `# ── PesaPal Payments ──────────────────────────────────────────────────────
PESAPAL_ENV=sandbox
PESAPAL_CONSUMER_KEY=your_pesapal_consumer_key
PESAPAL_CONSUMER_SECRET=your_pesapal_consumer_secret
PESAPAL_IPN_ID=your_pesapal_ipn_id`,
  `# ── Paystack Payments ─────────────────────────────────────────────────────
PAYSTACK_SECRET_KEY=sk_live_your_secret_key
PAYSTACK_PUBLIC_KEY=pk_live_your_public_key`
);
fs.writeFileSync('backend/.env.example', envExample);
console.log('✓ .env.example updated');

console.log('\n✅ Migration complete!');
console.log('\nNext steps:');
console.log('  1. Add Paystack keys to backend/.env on server');
console.log('  2. Run: cd backend && npx prisma migrate dev --name add_paystack');
console.log('  3. Deploy to server');