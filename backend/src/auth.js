/**
 * auth.js — JWT authentication middleware for admin routes
 *
 * Usage in server.js:
 *   const { requireAdmin, loginHandler } = require("./auth");
 *   app.post("/api/admin/login", loginHandler);
 *   app.get("/api/admin/earnings", requireAdmin, earningsHandler);
 */

const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");

// ── Lazy-hash the plain-text password from .env once at first use ─────────
let _hashedPassword = null;

function getHashedPassword() {
  if (_hashedPassword) return _hashedPassword;
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) throw new Error("ADMIN_PASSWORD is not set in .env");
  // bcrypt.hashSync is fine at startup (blocking, runs once)
  _hashedPassword = bcrypt.hashSync(plain, 12);
  return _hashedPassword;
}

// ── Login handler ─────────────────────────────────────────────────────────
/**
 * POST /api/admin/login
 * Body: { username, password }
 * Returns: { token, expiresIn }
 */
function loginHandler(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  // Check username
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  if (username !== expectedUsername) {
    // Deliberate vague error — don't reveal which field is wrong
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Check password (timing-safe comparison via bcrypt)
  const hash = getHashedPassword();
  const valid = bcrypt.compareSync(password, hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Issue JWT
  const secret    = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

  if (!secret || secret.length < 32) {
    console.error("JWT_SECRET is missing or too short in .env");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const token = jwt.sign(
    { sub: username, role: "admin" },
    secret,
    { expiresIn }
  );

  res.json({ token, expiresIn });
}

// ── Middleware: require a valid admin JWT ──────────────────────────────────
/**
 * Expects:  Authorization: Bearer <token>
 * On success: sets req.admin = { sub, role, iat, exp }
 * On failure: 401
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired — please log in again" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────
/**
 * POST /api/admin/refresh
 * Exchanges a still-valid token for a fresh one (resets expiry clock)
 */
function refreshHandler(req, res) {
  // requireAdmin middleware already validated the token and set req.admin
  const secret    = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

  const token = jwt.sign(
    { sub: req.admin.sub, role: "admin" },
    secret,
    { expiresIn }
  );

  res.json({ token, expiresIn });
}

module.exports = { loginHandler, requireAdmin, refreshHandler };
