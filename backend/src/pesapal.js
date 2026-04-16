/**
 * pesapal.js — PesaPal v3 API integration
 *
 * Flow:
 *  1. getToken()          → OAuth2 bearer token (expires every 5 min)
 *  2. registerIPN()       → Register our callback URL once at startup
 *  3. submitOrder()       → Create a payment order, get redirect URL
 *  4. getTransactionStatus() → Check a payment after IPN callback
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

// ── Token cache (reuse until near expiry) ─────────────────────────────────
let _token = null;
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

  _token = res.data.token;
  // PesaPal tokens last 5 minutes; cache for 4.5 min
  _tokenExpires = Date.now() + 4.5 * 60 * 1000;
  return _token;
}

// ── IPN Registration ──────────────────────────────────────────────────────
let _ipnId = null;

async function registerIPN() {
  if (_ipnId) return _ipnId;

  const token = await getToken();
  const ipnUrl = process.env.IPN_URL || "http://localhost:3001/api/pesapal/ipn";

  const res = await axios.post(
    `${baseUrl()}/api/URLSetup/RegisterIPN`,
    { url: ipnUrl, ipn_notification_type: "POST" },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  if (res.data.error) {
    throw new Error(`IPN registration failed: ${res.data.error.message}`);
  }

  _ipnId = res.data.ipn_id;
  console.log(`✅ PesaPal IPN registered: ${_ipnId}`);
  return _ipnId;
}

// ── Submit Order ──────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.orderId       — your internal unique order reference
 * @param {number} opts.amount        — total amount member pays (includes platform fee)
 * @param {string} opts.currency      — e.g. "KES" or "USD"
 * @param {string} opts.description   — shown on PesaPal checkout page
 * @param {string} opts.firstName
 * @param {string} opts.lastName
 * @param {string} opts.email
 * @param {string} opts.phone         — optional, e.g. "0712345678"
 * @param {string} opts.callbackUrl   — where browser returns after payment
 * @returns {{ redirectUrl: string, orderTrackingId: string }}
 */
async function submitOrder(opts) {
  const token = await getToken();
  const ipnId = await registerIPN();

  const payload = {
    id:                   opts.orderId,
    currency:             opts.currency || "KES",
    amount:               opts.amount,
    description:          opts.description,
    callback_url:         opts.callbackUrl,
    notification_id:      ipnId,
    billing_address: {
      email_address: opts.email,
      phone_number:  opts.phone  || "",
      first_name:    opts.firstName,
      last_name:     opts.lastName || "",
    },
  };

  const res = await axios.post(
    `${baseUrl()}/api/Transactions/SubmitOrderRequest`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  if (res.data.error) {
    throw new Error(`PesaPal order failed: ${res.data.error.message}`);
  }

  return {
    redirectUrl:      res.data.redirect_url,
    orderTrackingId:  res.data.order_tracking_id,
  };
}

// ── Transaction Status ────────────────────────────────────────────────────
async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();

  const res = await axios.get(
    `${baseUrl()}/api/Transactions/GetTransactionStatus`,
    {
      params: { orderTrackingId },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.data.error) {
    throw new Error(`Status check failed: ${res.data.error.message}`);
  }

  return res.data; // { payment_status_description, status_code, ... }
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };
