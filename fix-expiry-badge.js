const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find line 327 (the expiry date display) and insert badge after it
const idx = lines.findIndex(l => l.includes('expiresAt && <div style={{ fontSize: "0.7rem"') && l.includes('Expires {new Date(m.expiresAt)'));

console.log('Found expiry line at:', idx, lines[idx]);

if (idx !== -1) {
  // Remove old adjust-expiry-btns block (lines 328 onwards that we added before)
  let endOfOldBlock = idx + 1;
  while (endOfOldBlock < lines.length && !lines[endOfOldBlock].includes('paymentStatus === "expired"') && !lines[endOfOldBlock].includes('isExpiringSoon') && !lines[endOfOldBlock].includes('userId === currentUserId')) {
    endOfOldBlock++;
  }
  console.log('Removing old block from line', idx + 1, 'to', endOfOldBlock - 1);
  lines.splice(idx + 1, endOfOldBlock - idx - 1);

  // Insert new badge + buttons after the expiry date line
  const newLines = [
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
  ];

  lines.splice(idx + 1, 0, ...newLines);
  console.log('✓ Badge and buttons inserted');
} else {
  console.log('⚠ Expiry line not found');
  // Show nearby lines for debugging
  const nearby = lines.findIndex(l => l.includes('Expires {new Date(m.expiresAt)'));
  console.log('Nearby at line:', nearby);
  if (nearby !== -1) console.log('Line:', lines[nearby]);
}

fs.writeFileSync(file, lines.join('\n'));
console.log('✓ Done');
