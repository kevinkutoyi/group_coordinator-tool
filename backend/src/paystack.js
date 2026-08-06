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

// kesRate is the platform's current admin-configurable USD→KES rate (see
// getPlatformKesRate() in server.js) — this used to be hardcoded to 130,
// which drifted from the real rate and under/over-charged customers.
async function initializeTransaction({ email, amount, reference, callbackUrl, metadata, kesRate }) {
  const rate = kesRate || 130;
  const result = await paystackRequest("POST", "/transaction/initialize", {
    email, amount: Math.round(amount * rate * 100), // USD -> KES -> cents
    reference, callback_url: callbackUrl,
    currency: "KES", metadata: metadata || {},
  });
  if (!result.status) throw new Error(result.message || "Paystack initialization failed");
  return {
    authorizationUrl: result.data.authorization_url,
    accessCode:       result.data.access_code,
    reference:        result.data.reference,
  };
}

async function verifyTransaction(reference, kesRate) {
  const rate = kesRate || 130;
  const result = await paystackRequest("GET", "/transaction/verify/" + encodeURIComponent(reference));
  if (!result.status) throw new Error(result.message || "Verification failed");
  return {
    status:    result.data.status,
    amount:    result.data.amount / 100 / rate, // KES cents -> USD
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

// ═══════════════════════════════════════════════════════════════════════════
//  TRANSFERS — paying moderators out via Paystack instead of manual PesaPal
// ═══════════════════════════════════════════════════════════════════════════

// List banks/telcos for a currency, optionally filtered to a recipient type
// (e.g. type=mobile_money for Kenya M-Pesa/telcos, omitted for bank list).
async function listBanks({ currency = "KES", type } = {}) {
  const qs = new URLSearchParams({ currency });
  if (type) qs.set("type", type);
  const result = await paystackRequest("GET", "/bank?" + qs.toString());
  if (!result.status) throw new Error(result.message || "Could not fetch bank list");
  return result.data; // [{ name, code, type, currency, ... }]
}

// type: "mobile_money" (M-Pesa number) | "kepss" (Kenyan bank account)
async function createTransferRecipient({ type, name, accountNumber, bankCode, currency = "KES" }) {
  const result = await paystackRequest("POST", "/transferrecipient", {
    type, name, account_number: accountNumber, bank_code: bankCode, currency,
  });
  if (!result.status) throw new Error(result.message || "Could not create transfer recipient");
  return { recipientCode: result.data.recipient_code, details: result.data };
}

// amountUSD is converted to KES using the live platform rate, same as
// initializeTransaction — a payout must use the same rate basis as the
// charges it's paying out, not a stale hardcoded one.
async function initiateTransfer({ amountUSD, kesRate, recipientCode, reference, reason }) {
  const rate = kesRate || 130;
  const result = await paystackRequest("POST", "/transfer", {
    source: "balance",
    amount: Math.round(amountUSD * rate * 100), // USD -> KES -> cents (Paystack transfers use the base currency's smallest unit)
    recipient: recipientCode,
    reference, reason: reason || "SplitSubs moderator payout",
  });
  if (!result.status) throw new Error(result.message || "Could not initiate transfer");
  return {
    transferCode: result.data.transfer_code,
    status:       result.data.status, // "success" | "pending" | "otp"
    reference:    result.data.reference,
  };
}

// Only needed if the Paystack account still has "Confirm transfers before
// sending" enabled (Dashboard → Settings → Preferences). Disabling that
// setting lets transfers complete without this OTP step.
async function finalizeTransfer({ transferCode, otp }) {
  const result = await paystackRequest("POST", "/transfer/finalize_transfer", {
    transfer_code: transferCode, otp,
  });
  if (!result.status) throw new Error(result.message || "Could not finalize transfer");
  return { status: result.data.status, reference: result.data.reference };
}

async function verifyTransferStatus(reference) {
  const result = await paystackRequest("GET", "/transfer/verify/" + encodeURIComponent(reference));
  if (!result.status) throw new Error(result.message || "Could not verify transfer");
  return { status: result.data.status, transferCode: result.data.transfer_code, amount: result.data.amount };
}

module.exports = {
  initializeTransaction, verifyTransaction, verifyWebhookSignature,
  listBanks, createTransferRecipient, initiateTransfer, finalizeTransfer, verifyTransferStatus,
};
