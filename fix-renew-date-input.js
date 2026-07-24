const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Replace the plain date input with a better styled one with a calendar icon
src = src.replace(
  `                    <input type="date" value={renewDate}\n                      onChange={e => setRenewDate(e.target.value)}\n                      style={{ padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem" }}\n                    />`,
  `                    <div style={{ position:"relative", display:"inline-block" }}>
                      <input type="date" value={renewDate}
                        onChange={e => setRenewDate(e.target.value)}
                        style={{
                          padding:"8px 12px", borderRadius:8,
                          border:"1px solid var(--border)",
                          background:"var(--bg2)", color:"var(--text)",
                          fontSize:"0.85rem", cursor:"pointer",
                          colorScheme:"dark", minWidth:160,
                        }}
                      />
                    </div>`
);

fs.writeFileSync(file, src);
console.log('✓ Date input styled');
