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
  getServices:           ()         => req("/services"),
  getGroups:             ()         => req("/groups"),
  getGroup:              (id)       => req(`/groups/${id}`),
  createGroup:           (body)     => req("/groups",                  { method: "POST", body }),
  joinGroup:             (id, body) => req(`/groups/${id}/join`,       { method: "POST", body }),
  updateGroupStatus:     (id, status) => req(`/groups/${id}/status`,   { method: "PATCH", body: { status } }),
  recordPayment:         (groupId, body) => req(`/groups/${groupId}/payments`, { method: "POST", body }),
  getStats:              ()         => req("/stats"),
};
