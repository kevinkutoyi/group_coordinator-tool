const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const memberRowIdx = lines.findIndex(l => l.includes('key={m.id}') && l.includes('member-row'));
let depth = 0;
let memberRowEnd = -1;
for (let i = memberRowIdx; i < lines.length; i++) {
  const opens = (lines[i].match(/<div/g) || []).length;
  const closes = (lines[i].match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (depth === 0 && i > memberRowIdx) { memberRowEnd = i; break; }
}

console.log('Replacing member row lines', memberRowIdx, 'to', memberRowEnd);

const newMemberRow = [
  `            <div key={m.id} className="member-row">`,
  `              <div className="member-avatar">{m.name?.[0]?.toUpperCase()}</div>`,
  `              <div className="member-info">`,
  `                <div className="member-name">{m.name}</div>`,
  `                {canManage && <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{m.email}</div>}`,
  `                {m.durationLabel && <div style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: 1 }}>📅 {m.durationLabel}</div>}`,
  `                {m.expiresAt && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Expires {new Date(m.expiresAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>}`,
  `                {canManage && m.expiresAt && (`,
  `                  <div style={{ marginTop: 6 }}>`,
  `                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>`,
  `                      <span style={{`,
  `                        fontSize:"0.68rem", fontWeight:700, padding:"2px 8px", borderRadius:99,`,
  `                        background: (m.expiryAdjustmentDays||0) > 0 ? "rgba(74,222,128,0.12)" : (m.expiryAdjustmentDays||0) < 0 ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)",`,
  `                        color: (m.expiryAdjustmentDays||0) > 0 ? "var(--success)" : (m.expiryAdjustmentDays||0) < 0 ? "var(--error)" : "var(--muted)",`,
  `                        border: "1px solid " + ((m.expiryAdjustmentDays||0) > 0 ? "rgba(74,222,128,0.25)" : (m.expiryAdjustmentDays||0) < 0 ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.1)"),`,
  `                      }}>`,
  `                        🛡️ Admin: {(m.expiryAdjustmentDays||0) > 0 ? "+" : ""}{m.expiryAdjustmentDays||0}d adjusted`,
  `                      </span>`,
  `                      {m.expiryAdjustedAt && (`,
  `                        <span style={{ fontSize:"0.65rem", color:"var(--muted)" }}>`,
  `                          Last adjusted: {new Date(m.expiryAdjustedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`,
  `                        </span>`,
  `                      )}`,
  `                    </div>`,
  `                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>`,
  `                      {[-30,-7,-1,1,7,30].map(d => (`,
  `                        <button key={d} className="btn btn-sm btn-outline"`,
  `                          style={{ padding:"2px 8px", fontSize:"0.7rem",`,
  `                            color: d < 0 ? "var(--error)" : "var(--success)",`,
  `                            borderColor: d < 0 ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)" }}`,
  `                          onClick={() => adjustExpiry(m.id, d)}>`,
  `                          {d > 0 ? "+" : ""}{d}d`,
  `                        </button>`,
  `                      ))}`,
  `                    </div>`,
  `                  </div>`,
  `                )}`,
  `              </div>`,
  `              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>`,
  `                <span className={\`tag tag-\${m.paymentStatus}\`}>{m.paymentStatus}</span>`,
  `                {m.userId === currentUserId && m.paymentStatus === "pending" && (`,
  `                  <button className="btn btn-sm pay-btn" onClick={() => handlePay(m)} disabled={payingId === m.id}>`,
  `                    {payingId === m.id ? <><span className="spinner" /> Redirecting…</> : \`🔒 Pay Now — KES \${Math.round((m.memberPays || group.pricePerSlot) * 130)}\`}`,
  `                  </button>`,
  `                )}`,
  `                {m.userId === currentUserId && (`,
  `                  m.paymentStatus === "expired" ||`,
  `                  (m.paymentStatus === "confirmed" && daysLeft(m.expiresAt) !== null && daysLeft(m.expiresAt) <= 7)`,
  `                ) && (`,
  `                  <button className="btn btn-sm btn-primary"`,
  `                    style={{ background: "linear-gradient(90deg, #f59e0b, #ef4444)", border: "none" }}`,
  `                    disabled={payingId === m.id}`,
  `                    onClick={async () => {`,
  `                      setPayingId(m.id);`,
  `                      try {`,
  `                        await api.renewSlot(id);`,
  `                        await reload();`,
  `                        handlePay(m);`,
  `                      } catch (err) {`,
  `                        setMsg({ type: "err", text: err.message });`,
  `                        setPayingId(null);`,
  `                      }`,
  `                    }}>`,
  `                    {payingId === m.id ? <><span className="spinner" /> …</> : "🔄 Renew"}`,
  `                  </button>`,
  `                )}`,
  `                {m.userId === currentUserId && m.paymentStatus === "confirmed" && daysLeft(m.expiresAt) !== null && (`,
  `                  <span style={{`,
  `                    fontSize: "0.72rem", fontWeight: 600,`,
  `                    color: daysLeft(m.expiresAt) <= 0 ? "var(--error)" : daysLeft(m.expiresAt) <= 3 ? "var(--error)" : daysLeft(m.expiresAt) <= 7 ? "var(--warning)" : "var(--success)",`,
  `                  }}>`,
  `                    {daysLeft(m.expiresAt) <= 0 ? "⛔ Expired" : daysLeft(m.expiresAt) <= 7 ? \`⚠️ \${daysLeft(m.expiresAt)}d left\` : \`✓ \${daysLeft(m.expiresAt)}d left\`}`,
  `                  </span>`,
  `                )}`,
  `              </div>`,
  `            </div>`,
];

lines.splice(memberRowIdx, memberRowEnd - memberRowIdx + 1, ...newMemberRow);
fs.writeFileSync(file, lines.join('\n'));
console.log('✓ Member row rewritten cleanly');