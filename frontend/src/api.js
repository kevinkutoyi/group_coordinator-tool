const BASE = "http://localhost:3001/api";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  getServices:       ()              => req("/services"),
  getGroups:         ()              => req("/groups"),
  getGroup:          (id)            => req(`/groups/${id}`),
  createGroup:       (body)          => req("/groups",               { method: "POST", body }),
  joinGroup:         (id, body)      => req(`/groups/${id}/join`,    { method: "POST", body }),
  updateGroupStatus: (id, status)    => req(`/groups/${id}/status`,  { method: "PATCH", body: { status } }),
  recordPayment:     (gid, body)     => req(`/groups/${gid}/payments`,{ method: "POST", body }),
  getStats:          ()              => req("/stats"),
  getEarnings:       ()              => req("/admin/earnings"),

  // PesaPal
  initiatePesapal:   (body)          => req("/pesapal/initiate",     { method: "POST", body }),
  verifyPesapal:     (orderId)       => req(`/pesapal/verify?orderId=${orderId}`),
};
