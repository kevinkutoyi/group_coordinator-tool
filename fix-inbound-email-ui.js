const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Insert inbound email UI before the Subscription Renew Date section
const renewIdx = lines.findIndex(l => l.includes('{canManage && (') && 
  lines[lines.indexOf(l) + 1]?.includes('marginTop: 12') &&
  lines[lines.indexOf(l) + 2]?.includes('Subscription Renew Date'));

console.log('Renew date section at:', renewIdx);

if (renewIdx !== -1 && !lines.some(l => l.includes('Inbound Email'))) {
  lines.splice(renewIdx, 0,
    `              {canManage && (`,
    `                <div style={{ marginTop:8, padding:"12px 14px", background:"rgba(124,106,255,0.06)", borderRadius:10, border:"1px solid rgba(124,106,255,0.15)" }}>`,
    `                  <div style={{ fontSize:"0.78rem", fontWeight:600, marginBottom:6, color:"var(--accent)" }}>📬 Inbound Email <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(for OTP capture)</span></div>`,
    `                  <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginBottom:8 }}>Set the email address used for this {group.serviceName} account. OTPs sent here appear automatically in the vault.</div>`,
    `                  {group.inboundEmail && <div style={{ fontSize:"0.72rem", color:"var(--success)", marginBottom:8, fontWeight:600 }}>✓ Current: {group.inboundEmail}</div>}`,
    `                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>`,
    `                    <input type="email" value={inboundEmailInput}`,
    `                      onChange={e => setInboundEmailInput(e.target.value)}`,
    `                      placeholder="e.g. netflix-group1@inbound.splitsubs.com"`,
    `                      style={{ flex:1, padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem", minWidth:200 }}`,
    `                    />`,
    `                    <button className="btn btn-sm btn-primary" disabled={inboundEmailBusy} onClick={saveInboundEmail}>`,
    `                      {inboundEmailBusy ? <><span className="spinner"/> Saving…</> : "💾 Save"}`,
    `                    </button>`,
    `                    {group.inboundEmail && <button className="btn btn-sm btn-outline" style={{ color:"var(--error)", borderColor:"var(--error)" }} onClick={() => { setInboundEmailInput(""); saveInboundEmail(); }}>✕ Clear</button>}`,
    `                  </div>`,
    `                </div>`,
    `              )}`
  );
  fs.writeFileSync(file, lines.join('\n'));
  console.log('✓ Inbound email UI added');
} else if (lines.some(l => l.includes('Inbound Email'))) {
  console.log('⚠ Already exists');
} else {
  console.log('⚠ Could not find renew date section');
  // Find any canManage section near admin view
  const adminIdx = lines.findIndex(l => l.includes('Admin View'));
  console.log('Admin view at line:', adminIdx);
}
