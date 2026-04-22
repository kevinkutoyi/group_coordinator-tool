const BASE = "http://localhost:3001/api";

// ── Session storage for tokens ────────────────────────────────────────────
function getStored(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function setStored(key, v) { try { sessionStorage.setItem(key, v); } catch {} }
function removeStored(key) { try { sessionStorage.removeItem(key); } catch {} }

let _token    = getStored("sp_token");
let _user     = (() => { try { const u = getStored("sp_user"); return u ? JSON.parse(u) : null; } catch { return null; } })();
let _listeners = [];

export const session = {
  set(token, user) {
    _token = token; _user = user;
    setStored("sp_token", token);
    setStored("sp_user", JSON.stringify(user));
    _listeners.forEach(fn => fn(user));
  },
  clear() {
    _token = null; _user = null;
    removeStored("sp_token"); removeStored("sp_user");
    _listeners.forEach(fn => fn(null));
  },
  getToken()   { return _token; },
  getUser()    { return _user; },
  isLoggedIn() { return !!_token; },
  getRole()    { return _user?.role || null; },
  isSuperAdmin(){ return _user?.role === "superadmin"; },
  isModerator(){ return _user?.role === "moderator"; },
  isCustomer() { return _user?.role === "customer"; },
  onChange(fn) { _listeners.push(fn); return () => { _listeners = _listeners.filter(l => l !== fn); }; },
};

// ── Core fetch ────────────────────────────────────────────────────────────
async function req(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...opts, headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) session.clear();

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── API methods ───────────────────────────────────────────────────────────
export const api = {
  // Auth
  signup:       (body)       => req("/auth/signup",        { method: "POST", body }),
  login:        (body)       => req("/auth/login",         { method: "POST", body }),
  me:           ()           => req("/auth/me"),
  refreshToken: ()           => req("/auth/refresh",       { method: "POST" }),

  // Super admin
  adminLogin:   (body)       => req("/admin/login",        { method: "POST", body }),
  adminRefresh: ()           => req("/admin/refresh"),
  getEarnings:  ()           => req("/admin/earnings"),
  getUsers:     (params="")  => req(`/admin/users${params}`),
  getPendingMods:()          => req("/admin/moderators/pending"),
  approveUser:  (id)         => req(`/admin/users/${id}/approve`, { method: "PATCH" }),
  rejectUser:   (id, reason) => req(`/admin/users/${id}/reject`,  { method: "PATCH", body: { reason } }),
  suspendUser:  (id)         => req(`/admin/users/${id}/suspend`, { method: "PATCH" }),

  // Services & durations
  getServices:  ()           => req("/services"),
  getDurations: ()           => req("/durations"),
  getStats:     ()           => req("/stats"),

  // Groups
  getGroups:    ()           => req("/groups"),
  getGroup:     (id)         => req(`/groups/${id}`),
  createGroup:  (body)       => req("/groups",             { method: "POST", body }),
  updateStatus: (id, status) => req(`/groups/${id}/status`,{ method: "PATCH", body: { status } }),

  // Membership
  joinGroup:    (id, body)   => req(`/groups/${id}/join`,  { method: "POST", body }),

  // Payments
  initiatePay:  (body)       => req("/pesapal/initiate",   { method: "POST", body }),
  verifyPay:    (orderId)    => req(`/pesapal/verify?orderId=${orderId}`),

  // Newsletter
  getSubscribers:       ()       => req("/admin/newsletter/subscribers"),
  getNewsletterHistory: ()       => req("/admin/newsletter/history"),
  sendNewsletter:       (body)   => req("/admin/newsletter/send",   { method: "POST", body }),
  footerSubscribe:      (email)  => req("/newsletter/subscribe",    { method: "POST", body: { email } }),

  // Group emails (organizer / superadmin → paying members)
  getGroupEmails:       (gid)    => req(`/groups/${gid}/emails`),
  sendGroupEmail:       (gid, b) => req(`/groups/${gid}/emails/send`,           { method: "POST", body: b }),
  sendExpiryReminder:   (gid, b) => req(`/groups/${gid}/emails/expiry-reminder`,{ method: "POST", body: b }),
  getGroupMembersAdmin: (gid)    => req(`/groups/${gid}/members`),
  runExpiryScheduler:   ()       => req("/admin/expiry-scheduler",              { method: "POST" }),

  // Currency
  getCurrencyRate: () => req("/currency/rate"),

  // Moderator dashboard & settings
  getModeratorDashboard: ()     => req("/moderator/dashboard"),
  getModeratorSettings:  ()     => req("/moderator/settings"),
  saveModeratorSettings: (body) => req("/moderator/settings", { method: "PUT", body }),

  // Admin — group review
  getPendingGroups:  ()          => req("/admin/groups/pending"),
  reviewGroup:       (id, body)  => req(`/admin/groups/${id}/review`, { method: "PATCH", body }),

  // Admin — email organizers
  emailOrganizers:        (body) => req("/admin/email-organizers",         { method: "POST", body }),
  getOrganizerEmailHistory: ()   => req("/admin/organizer-email-history"),

  // Credential Vault
  getCredentials:    (gid)  => req(`/groups/${gid}/credentials`),
  saveCredentials:   (gid, body) => req(`/groups/${gid}/credentials`, { method: "PUT", body }),
  deleteCredentials: (gid)  => req(`/groups/${gid}/credentials`, { method: "DELETE" }),
};
