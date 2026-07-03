const https = require("https");
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
