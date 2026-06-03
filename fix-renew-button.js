const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Add daysLeft helper after CYCLE_MONTHS ─────────────────────────────
if (!src.includes('function daysLeft')) {
  src = src.replace(
    'const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };',
    `const CYCLE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, annually: 12 };

  function daysLeft(expiresAt) {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
  }`
  );
  console.log('✓ daysLeft helper added');
} else { console.log('⚠ daysLeft exists'); }

// ── 2. Add renew button + expiry badge after the Pay via PesaPal button ───
const payBtn = `              {m.userId === currentUserId && m.paymentStatus === "pending" && (
                <button className="btn btn-sm pesapal-btn" onClick={() => setCurrency(m)} disabled={payingId === m.id}>
                  {payingId === m.id ? <><span className="spinner" /> Redirecting…</> : "🔒 Pay via PesaPal"}
                </button>
              )}`;

const payBtnWithRenew = `              {m.userId === currentUserId && m.paymentStatus === "pending" && (
                <button className="btn btn-sm pesapal-btn" onClick={() => setCurrency(m)} disabled={payingId === m.id}>
                  {payingId === m.id ? <><span className="spinner" /> Redirecting…</> : "🔒 Pay via PesaPal"}
                </button>
              )}

              {/* Renew button — expired or expiring within 7 days */}
              {m.userId === currentUserId && (
                m.paymentStatus === "expired" ||
                (m.paymentStatus === "confirmed" && daysLeft(m.expiresAt) !== null && daysLeft(m.expiresAt) <= 7)
              ) && (
                <button
                  className="btn btn-sm btn-primary"
                  style={{ background: "linear-gradient(90deg, #f59e0b, #ef4444)", border: "none" }}
                  disabled={payingId === m.id}
                  onClick={async () => {
                    setPayingId(m.id);
                    try {
                      await api.renewSlot(id);
                      await reload();
                      setCurrency({ ...m, memberPays: group.pricePerSlot });
                    } catch (err) {
                      setMsg({ type: "err", text: err.message });
                      setPayingId(null);
                    }
                  }}
                >
                  {payingId === m.id ? <><span className="spinner" /> …</> : "🔄 Renew Subscription"}
                </button>
              )}

              {/* Expiry badge */}
              {m.userId === currentUserId && m.paymentStatus === "confirmed" && daysLeft(m.expiresAt) !== null && (
                <span style={{
                  fontSize: "0.72rem", fontWeight: 600, marginLeft: 4,
                  color: daysLeft(m.expiresAt) <= 0  ? "var(--error)"   :
                         daysLeft(m.expiresAt) <= 3  ? "var(--error)"   :
                         daysLeft(m.expiresAt) <= 7  ? "var(--warning)" : "var(--success)",
                }}>
                  {daysLeft(m.expiresAt) <= 0
                    ? "⛔ Expired"
                    : daysLeft(m.expiresAt) <= 7
                    ? \`⚠️ Expires in \${daysLeft(m.expiresAt)}d\`
                    : \`✓ \${daysLeft(m.expiresAt)}d left\`}
                </span>
              )}`;

if (!src.includes('Renew Subscription')) {
  if (src.includes(payBtn)) {
    src = src.replace(payBtn, payBtnWithRenew);
    console.log('✓ Renew button added');
  } else {
    console.log('⚠ Pay button anchor not found — searching for alternative...');
    const idx = src.indexOf('pesapal-btn');
    console.log('pesapal-btn context:', JSON.stringify(src.substring(idx - 100, idx + 200)));
  }
} else { console.log('⚠ Renew button exists'); }

// ── 3. Make sure api.renewSlot exists ─────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let apiSrc = fs.readFileSync(apiFile, 'utf8');
if (!apiSrc.includes('renewSlot')) {
  const idx = apiSrc.lastIndexOf('remindExpiredMember');
  const lineEnd = apiSrc.indexOf('\n', idx);
  apiSrc = apiSrc.slice(0, lineEnd + 1) +
    '  renewSlot:              (gid)  => req(`/groups/${gid}/renew`, { method: "POST" }),\n' +
    apiSrc.slice(lineEnd + 1);
  fs.writeFileSync(apiFile, apiSrc);
  console.log('✓ renewSlot added to api.js');
} else { console.log('⚠ renewSlot exists in api.js'); }

fs.writeFileSync(file, src);
console.log('✓ GroupDetailPage.js written');
console.log('\n✅ Done!');
