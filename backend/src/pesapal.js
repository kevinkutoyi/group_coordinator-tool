/**
 * pesapal.js — PesaPal v3 API integration
 *
 * Flow:
 *  1. getToken()             → OAuth2 bearer token (cached 4.5 min)
 *  2. registerIPN()          → Register callback URL; treats 409 (already exists) as success
 *  3. submitOrder()          → Create payment order, get redirect URL
 *  4. getTransactionStatus() → Check payment status after IPN callback
 */

const axios = require("axios");

// ── Base URLs ──────────────────────────────────────────────────────────────
const BASE = {
  sandbox: "https://cybqa.pesapal.com/pesapalv3",
  live:    "https://pay.pesapal.com/v3",
};

function baseUrl() {
  return BASE[process.env.PESAPAL_ENV || "sandbox"];
}

// ── Token cache ────────────────────────────────────────────────────────────
let _token        = null;
let _tokenExpires = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpires - 30_000) return _token;

  const res = await axios.post(
    `${baseUrl()}/api/Auth/RequestToken`,
    {
      consumer_key:    process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    },
    { headers: { "Content-Type": "application/json", Accept: "application/json" } }
  );

  if (res.data.error) {
    throw new Error(`PesaPal auth failed: ${res.data.error.message}`);
  }

  _token        = res.data.token;
  _tokenExpires = Date.now() + 4.5 * 60 * 1000; // cache 4.5 min
  return _token;
}

// ── IPN Registration ───────────────────────────────────────────────────────
// Cached in memory — reset on process restart, but that's fine.
let _ipnId = null;

async function registerIPN() {
  if (_ipnId) return _ipnId;

  const token  = await getToken();
  const ipnUrl = process.env.IPN_URL || "http://localhost:3001/api/pesapal/ipn";

  try {
    const res = await axios.post(
      `${baseUrl()}/api/URLSetup/RegisterIPN`,
      { url: ipnUrl, ipn_notification_type: "POST" },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
      }
    );

    if (res.data.error) {
      // 409 Conflict = IPN URL already registered with PesaPal — this is fine.
      // Fetch the existing registration list to retrieve the ID.
      if (res.data.error.code === 409 || String(res.data.error).includes("409")) {
        _ipnId = await getExistingIpnId(token, ipnUrl);
        if (_ipnId) {
          console.log(`✅ PesaPal IPN already registered: ${_ipnId}`);
          return _ipnId;
        }
      }
      throw new Error(`IPN registration failed: ${JSON.stringify(res.data.error)}`);
    }

    _ipnId = res.data.ipn_id;
    console.log(`✅ PesaPal IPN registered: ${_ipnId}`);
    return _ipnId;

  } catch (err) {
    // axios throws for HTTP 4xx/5xx — check for 409 specifically
    if (err.response?.status === 409) {
      // Already registered — look up existing ID
      try {
        _ipnId = await getExistingIpnId(token, ipnUrl);
        if (_ipnId) {
          console.log(`✅ PesaPal IPN already registered (409 → found): ${_ipnId}`);
          return _ipnId;
        }
      } catch (lookupErr) {
        // Lookup failed — use a placeholder so payments still work
        // PesaPal will still fire IPN to our URL even without the ID cached here
        _ipnId = "existing";
        console.log(`ℹ️  IPN already registered with PesaPal (409). Using existing registration.`);
        return _ipnId;
      }
    }
    throw err;
  }
}

// Fetch registered IPN list and find our URL's ID
async function getExistingIpnId(token, ipnUrl) {
  try {
    const res = await axios.get(
      `${baseUrl()}/api/URLSetup/GetIpnList`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (Array.isArray(res.data)) {
      const match = res.data.find(r => r.url === ipnUrl || r.ipn_url === ipnUrl);
      return match ? (match.ipn_id || match.id) : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Submit Order ───────────────────────────────────────────────────────────
async function submitOrder(opts) {
  const token = await getToken();
  const ipnId = await registerIPN();

  const payload = {
    id:               opts.orderId,
    currency:         opts.currency || "KES",
    amount:           opts.amount,
    description:      opts.description,
    callback_url:     opts.callbackUrl,
    notification_id:  ipnId !== "existing" ? ipnId : undefined,
    billing_address: {
      email_address: opts.email,
      phone_number:  opts.phone     || "",
      first_name:    opts.firstName,
      last_name:     opts.lastName  || "",
    },
  };

  // Remove undefined fields
  if (!payload.notification_id) delete payload.notification_id;

  const res = await axios.post(
    `${baseUrl()}/api/Transactions/SubmitOrderRequest`,
    payload,
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
    }
  );

  if (res.data.error) {
    throw new Error(`PesaPal order failed: ${res.data.error.message}`);
  }

  return {
    redirectUrl:     res.data.redirect_url,
    orderTrackingId: res.data.order_tracking_id,
  };
}

// ── Transaction Status ─────────────────────────────────────────────────────
async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();

  const res = await axios.get(
    `${baseUrl()}/api/Transactions/GetTransactionStatus`,
    {
      params:  { orderTrackingId },
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }
  );

  if (res.data.error) {
    throw new Error(`Status check failed: ${res.data.error.message}`);
  }

  return res.data;
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };
