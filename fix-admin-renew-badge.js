const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let src = fs.readFileSync(file, 'utf8');

// Add renewDate badge after the created date line in groups tab
const oldLine = `                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                    $\{g.pricePerSlot}/member/mo · Created $\{new Date(g.createdAt).toLocaleDateString()}
                  </div>`;

const newLine = `                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:2}}>
                    $\{g.pricePerSlot}/member/mo · Created $\{new Date(g.createdAt).toLocaleDateString()}
                  </div>
                  {g.renewDate && (() => {
                    const days = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));
                    const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";
                    const bg = days <= 0 ? "rgba(248,113,113,0.1)" : days <= 7 ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)";
                    return (
                      <div style={{ marginTop:4, display:"inline-flex", alignItems:"center", gap:6,
                        padding:"3px 10px", borderRadius:99, background:bg, border:"1px solid " + color }}>
                        <span style={{ fontSize:"0.7rem", fontWeight:700, color }}>
                          📅 Renew: {new Date(g.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                          {days <= 0 ? " · ⛔ OVERDUE " + Math.abs(days) + "d" : " · " + (days <= 7 ? "⚠️ " : "✓ ") + days + "d left"}
                        </span>
                      </div>
                    );
                  })()}`;

if (src.includes('$/member/mo')) {
  // Use line-based approach since template literals cause issues
  const lines = src.split('\n');
  const idx = lines.findIndex(l => l.includes('/member/mo') && l.includes('Created'));
  if (idx !== -1) {
    lines.splice(idx + 1, 0,
      `                  {g.renewDate && (() => {`,
      `                    const days = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));`,
      `                    const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";`,
      `                    const bg = days <= 0 ? "rgba(248,113,113,0.1)" : days <= 7 ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)";`,
      `                    return (`,
      `                      <div style={{ marginTop:4, display:"inline-flex", alignItems:"center", gap:6, padding:"3px 10px", borderRadius:99, background:bg, border:"1px solid " + color }}>`,
      `                        <span style={{ fontSize:"0.7rem", fontWeight:700, color }}>`,
      `                          {"📅 Renew: " + new Date(g.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) + (days <= 0 ? " · ⛔ OVERDUE " + Math.abs(days) + "d" : " · " + (days <= 7 ? "⚠️ " : "✓ ") + days + "d left")}`,
      `                        </span>`,
      `                      </div>`,
      `                    );`,
      `                  })()}`
    );
    fs.writeFileSync(file, lines.join('\n'));
    console.log('✓ Renew date badge added to Groups tab');
  } else {
    console.log('⚠ Line not found');
  }
} else {
  console.log('⚠ Pattern not found');
}
