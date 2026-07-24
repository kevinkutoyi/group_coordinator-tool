const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the created date line in groups tab
const idx = lines.findIndex(l => l.includes('/member/mo') && l.includes('Created'));
console.log('Found at line:', idx, lines[idx]);

if (idx !== -1 && !lines[idx + 1]?.includes('renewDate')) {
  lines.splice(idx + 1, 0,
    `                  {g.renewDate && (() => {`,
    `                    const days = Math.ceil((new Date(g.renewDate) - new Date()) / (1000*60*60*24));`,
    `                    const color = days <= 0 ? "var(--error)" : days <= 3 ? "var(--error)" : days <= 7 ? "var(--warning)" : "var(--success)";`,
    `                    const bg = days <= 0 ? "rgba(248,113,113,0.1)" : days <= 7 ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)";`,
    `                    return <div style={{ marginTop:4, display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:99, background:bg, border:"1px solid " + color }}>`,
    `                      <span style={{ fontSize:"0.7rem", fontWeight:700, color }}>`,
    `                        {"📅 Renew: " + new Date(g.renewDate).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) + (days <= 0 ? " · ⛔ OVERDUE " + Math.abs(days) + "d" : " · " + (days <= 7 ? "⚠️ " : "✓ ") + days + "d left")}`,
    `                      </span>`,
    `                    </div>;`,
    `                  })()}`
  );
  fs.writeFileSync(file, lines.join('\n'));
  console.log('✓ Renew date badge added');
} else {
  console.log('⚠ Already exists or line not found');
}
