const fs = require('fs');

// ── 1. server.js — add user profile endpoint ──────────────────────────────
const serverFile = 'backend/src/server.js';
let lines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!lines.some(l => l.includes('/api/admin/users/:id/profile'))) {
  const idx = lines.findIndex(l => l.includes('app.delete("/api/admin/members/:id"'));
  const route = [
    `app.get("/api/admin/users/:id/profile", requireSuperAdmin, async (req, res) => {`,
    `  const user = await prisma.user.findUnique({`,
    `    where: { id: req.params.id },`,
    `    include: {`,
    `      memberships: {`,
    `        include: { group: true },`,
    `        orderBy: { joinedAt: "desc" },`,
    `      },`,
    `    },`,
    `  });`,
    `  if (!user) return res.status(404).json({ error: "User not found" });`,
    ``,
    `  // Get last seen from presence`,
    `  const presence = await prisma.userPresence.findUnique({ where: { userId: req.params.id } }).catch(() => null);`,
    ``,
    `  // Get payment history`,
    `  const payments = await prisma.payment.findMany({`,
    `    where: { userId: req.params.id },`,
    `    orderBy: { confirmedAt: "desc" },`,
    `    take: 20,`,
    `  });`,
    ``,
    `  res.json({`,
    `    id:          user.id,`,
    `    name:        user.name,`,
    `    email:       user.email,`,
    `    phone:       user.phone,`,
    `    role:        user.role,`,
    `    status:      user.status,`,
    `    joinedAt:    user.createdAt,`,
    `    approvedAt:  user.approvedAt,`,
    `    lastSeen:    presence?.lastSeen || null,`,
    `    online:      presence ? (Date.now() - new Date(presence.lastSeen).getTime()) < 5 * 60 * 1000 : false,`,
    `    subscriptions: user.memberships.map(m => ({`,
    `      id:            m.id,`,
    `      groupId:       m.groupId,`,
    `      groupName:     m.group.serviceName + " " + m.group.planName,`,
    `      serviceIcon:   m.group.serviceIcon,`,
    `      serviceName:   m.group.serviceName,`,
    `      planName:      m.group.planName,`,
    `      billingCycle:  m.group.billingCycle,`,
    `      paymentStatus: m.paymentStatus,`,
    `      memberPays:    m.memberPays,`,
    `      joinedAt:      m.joinedAt,`,
    `      expiresAt:     m.expiresAt,`,
    `      expiryAdjustmentDays: m.expiryAdjustmentDays,`,
    `      expiryAdjustedAt:     m.expiryAdjustedAt,`,
    `    })),`,
    `    payments: payments.map(p => ({`,
    `      id:          p.id,`,
    `      amount:      p.memberPays || p.amount,`,
    `      currency:    p.currency,`,
    `      confirmedAt: p.confirmedAt,`,
    `      months:      p.months,`,
    `    })),`,
    `    totalSpent: payments.reduce((a, p) => a + (p.memberPays || p.amount || 0), 0),`,
    `  });`,
    `});`,
    ``,
  ];
  lines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, lines.join('\n'));
  console.log('✓ User profile endpoint added');
} else {
  console.log('⚠ Already exists');
}

// ── 2. api.js — add getUserProfile ───────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

if (!api.includes('getUserProfile')) {
  api = api.replace(
    '  demoteToCustomer:       (uid)  => req(`/admin/users/${uid}/demote-to-customer`, { method: "PATCH" }),',
    `  demoteToCustomer:       (uid)  => req(\`/admin/users/\${uid}/demote-to-customer\`, { method: "PATCH" }),\n  getUserProfile:         (uid)  => req(\`/admin/users/\${uid}/profile\`),`
  );
  fs.writeFileSync(apiFile, api);
  console.log('✓ getUserProfile added to api.js');
} else {
  console.log('⚠ Already exists');
}

// ── 3. AdminDashboardPage.js — add profile modal ──────────────────────────
const adpFile = 'frontend/src/pages/AdminDashboardPage.js';
let adpLines = fs.readFileSync(adpFile, 'utf8').split('\n');

// Add state
if (!adpLines.some(l => l.includes('profileTarget'))) {
  const idx = adpLines.findIndex(l => l.includes('emailTarget') && l.includes('useState'));
  adpLines.splice(idx, 0,
    `  const [profileTarget, setProfileTarget] = useState(null);`,
    `  const [profileData, setProfileData]     = useState(null);`,
    `  const [profileLoading, setProfileLoading] = useState(false);`,
    ``
  );
  console.log('✓ Profile state added');
} else { console.log('⚠ State exists'); }

// Add loadProfile function
if (!adpLines.some(l => l.includes('loadProfile'))) {
  const idx = adpLines.findIndex(l => l.includes('async function sendEmailToUser'));
  adpLines.splice(idx, 0,
    `  async function loadProfile(user) {`,
    `    setProfileTarget(user);`,
    `    setProfileData(null);`,
    `    setProfileLoading(true);`,
    `    try {`,
    `      const data = await api.getUserProfile(user.id);`,
    `      setProfileData(data);`,
    `    } catch (err) { console.error(err); }`,
    `    finally { setProfileLoading(false); }`,
    `  }`,
    ``
  );
  console.log('✓ loadProfile function added');
} else { console.log('⚠ loadProfile exists'); }

// Add 👤 Profile button to user cards
if (!adpLines.some(l => l.includes('loadProfile(u)'))) {
  const idx = adpLines.findIndex(l => l.includes('setEmailTarget(u)') && l.includes('onClick'));
  if (idx !== -1) {
    adpLines.splice(idx, 0,
      `                {u.role !== "superadmin" && (`,
      `                  <button className="btn btn-sm btn-outline"`,
      `                    style={{ borderColor:"rgba(124,106,255,0.3)", color:"var(--accent)" }}`,
      `                    onClick={() => loadProfile(u)}>`,
      `                    👤 Profile`,
      `                  </button>`,
      `                )}`
    );
    console.log('✓ Profile button added to user cards');
  }
} else { console.log('⚠ Profile button exists'); }

// Add profile modal before reject modal
if (!adpLines.some(l => l.includes('profileTarget &&'))) {
  const idx = adpLines.findIndex(l => l.includes('{/* Reject modal */}'));
  adpLines.splice(idx, 0,
    `      {/* ── User Profile Modal ── */}`,
    `      {profileTarget && (`,
    `        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setProfileTarget(null)}>`,
    `          <div className="modal" style={{ maxWidth:620, maxHeight:"85vh", overflowY:"auto" }}>`,
    `            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>`,
    `              <div>`,
    `                <h3 style={{ margin:0 }}>👤 {profileTarget.name}</h3>`,
    `                <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:4 }}>{profileTarget.email}</div>`,
    `              </div>`,
    `              <button className="btn btn-sm btn-outline" onClick={() => setProfileTarget(null)}>✕</button>`,
    `            </div>`,
    ``,
    `            {profileLoading ? (`,
    `              <div style={{ textAlign:"center", padding:40 }}><span className="spinner"/></div>`,
    `            ) : profileData ? (`,
    `              <div>`,
    `                {/* Basic info */}`,
    `                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>`,
    `                  {[`,
    `                    { label:"Role", value: profileData.role },`,
    `                    { label:"Status", value: profileData.status },`,
    `                    { label:"Phone", value: profileData.phone || "—" },`,
    `                    { label:"Joined", value: new Date(profileData.joinedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) },`,
    `                    { label:"Last Active", value: profileData.lastSeen ? new Date(profileData.lastSeen).toLocaleString("en-GB", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "Never" },`,
    `                    { label:"Online Now", value: profileData.online ? "🟢 Yes" : "⚫ No" },`,
    `                    { label:"Total Spent", value: "$" + (profileData.totalSpent || 0).toFixed(2) },`,
    `                    { label:"Subscriptions", value: profileData.subscriptions.length },`,
    `                  ].map(item => (`,
    `                    <div key={item.label} style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 14px" }}>`,
    `                      <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginBottom:3 }}>{item.label}</div>`,
    `                      <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{item.value}</div>`,
    `                    </div>`,
    `                  ))}`,
    `                </div>`,
    ``,
    `                {/* Subscriptions */}`,
    `                <h4 style={{ margin:"0 0 10px", fontSize:"0.88rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>Subscriptions</h4>`,
    `                {profileData.subscriptions.length === 0 ? (`,
    `                  <div style={{ color:"var(--muted)", fontSize:"0.82rem", marginBottom:16 }}>No subscriptions yet.</div>`,
    `                ) : profileData.subscriptions.map(s => {`,
    `                  const days = s.expiresAt ? Math.ceil((new Date(s.expiresAt) - new Date()) / (1000*60*60*24)) : null;`,
    `                  return (`,
    `                    <div key={s.id} style={{ background:"var(--bg3)", borderRadius:10, padding:"12px 14px", marginBottom:8,`,
    `                      borderLeft: s.paymentStatus === "confirmed" ? "3px solid var(--success)" : s.paymentStatus === "expired" ? "3px solid var(--error)" : "3px solid var(--border)" }}>`,
    `                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>`,
    `                        <span style={{ fontSize:"1.4rem" }}>{s.serviceIcon}</span>`,
    `                        <div style={{ flex:1 }}>`,
    `                          <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{s.groupName}</div>`,
   '                          <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{s.billingCycle} · {"$" + s.memberPays + "/mo"}</div>',
    `                          {s.expiresAt && (`,
    `                            <div style={{ fontSize:"0.72rem", marginTop:3 }}>`,
    `                              <span style={{ color: days !== null && days <= 0 ? "var(--error)" : days !== null && days <= 7 ? "var(--warning)" : "var(--muted)" }}>`,
    `                                {days !== null && days <= 0 ? "⛔ Expired " + Math.abs(days) + "d ago" : days !== null && days <= 7 ? "⚠️ Expires in " + days + "d" : "Expires " + new Date(s.expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`,
    `                              </span>`,
    `                              {s.expiryAdjustmentDays !== 0 && (`,
    `                                <span style={{ marginLeft:8, fontSize:"0.68rem", color: s.expiryAdjustmentDays > 0 ? "var(--success)" : "var(--error)" }}>`,
    `                                  🛡️ {s.expiryAdjustmentDays > 0 ? "+" : ""}{s.expiryAdjustmentDays}d admin adj.`,
    `                                </span>`,
    `                              )}`,
    `                            </div>`,
    `                          )}`,
    `                          <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginTop:2 }}>Joined {new Date(s.joinedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>`,
    `                        </div>`,
    `                        <span className={"tag tag-" + s.paymentStatus} style={{ fontSize:"0.68rem" }}>{s.paymentStatus}</span>`,
    `                      </div>`,
    `                    </div>`,
    `                  );`,
    `                })}`,
    ``,
    `                {/* Payment history */}`,
    `                {profileData.payments.length > 0 && (`,
    `                  <>`,
    `                    <h4 style={{ margin:"16px 0 10px", fontSize:"0.88rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>Payment History</h4>`,
    `                    {profileData.payments.map(p => (`,
    `                      <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:"0.82rem" }}>`,
    `                        <span style={{ color:"var(--muted)" }}>{p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—"}</span>`,
    `                        <span>{p.months} month{p.months !== 1 ? "s" : ""}</span>`,
    `                        <span style={{ color:"var(--success)", fontWeight:600 }}>{"$" + (p.amount || 0).toFixed(2)}</span>`,
    `                      </div>`,
    `                    ))}`,
    `                  </>`,
    `                )}`,
    `              </div>`,
    `            ) : null}`,
    ``,
    `            <div className="modal-actions" style={{ marginTop:20 }}>`,
    `              <button className="btn btn-outline" onClick={() => setProfileTarget(null)}>Close</button>`,
    `              <button className="btn btn-primary" onClick={() => { setProfileTarget(null); setEmailTarget(profileTarget); setEmailForm({ subject:"", body:"" }); setEmailModalMsg(null); }}>`,
    `                ✉️ Send Email`,
    `              </button>`,
    `            </div>`,
    `          </div>`,
    `        </div>`,
    `      )}`,
    ``
  );
  console.log('✓ Profile modal added');
} else { console.log('⚠ Modal exists'); }

fs.writeFileSync(adpFile, adpLines.join('\n'));
console.log('✓ AdminDashboardPage.js written');
console.log('\n✅ All done!');
