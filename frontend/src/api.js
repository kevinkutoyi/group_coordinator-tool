const BASE = "http://localhost:3001/api";

// ── Token storage helpers ──────────────────────────────────────────────────
// We use a module-level variable (not localStorage per environment rules)
// but also mirror to sessionStorage so it survives page refreshes.
let _token = (() => {
  try { return sessionStorage.getItem("splitpass_admin_token") || null; }
  catch { return null; }
})();

export const auth = {
  setToken(t) {
    _token = t;
    try { sessionStorage.setItem("splitpass_admin_token", t); } catch {}
  },
  clearToken() {
    _token = null;
    try { sessionStorage.removeItem("splitpass_admin_token"); } catch {}
  },
  getToken() { return _token; },
  isLoggedIn() { return !!_token; },
};

// ── Core fetch helper ─────────────────────────────────────────────────────
async function req(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // If 401, token is expired/invalid — clear it
  if (res.status === 401) {
    auth.clearToken();
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Public API ────────────────────────────────────────────────────────────
export const api = {
  getServices:       ()              => req("/services"),
  getGroups:         ()              => req("/groups"),
  getGroup:          (id)            => req(`/groups/${id}`),
  createGroup:       (body)          => req("/groups",                { method: "POST", body }),
  joinGroup:         (id, body)      => req(`/groups/${id}/join`,     { method: "POST", body }),
  updateGroupStatus: (id, status)    => req(`/groups/${id}/status`,   { method: "PATCH", body: { status } }),
  recordPayment:     (gid, body)     => req(`/groups/${gid}/payments`,{ method: "POST", body }),
  getStats:          ()              => req("/stats"),

  // PesaPal
  initiatePesapal:   (body)          => req("/pesapal/initiate",      { method: "POST", body }),
  verifyPesapal:     (orderId)       => req(`/pesapal/verify?orderId=${orderId}`),

  // Admin — requires valid token set via auth.setToken()
  adminLogin:        (body)          => req("/admin/login",           { method: "POST", body }),
  adminRefresh:      ()              => req("/admin/refresh",         { method: "POST" }),
  getEarnings:       ()              => req("/admin/earnings"),
};
