const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');
let ok = true;

const adminAnchor = `<div className="form-group">
  <label>🔗 Invite Link <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.75rem"}}>— customer clicks Accept Invite</span></label>
  <input value={slot.inviteLink || ""} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, inviteLink: e.target.value } : x))} placeholder="https://www.spotify.com/family/invite/abc123" autoComplete="off" spellCheck={false} />
</div>

<div className="form-group">
  <label>📍 Account Address <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.75rem"}}>— login URL or shared email</span></label>
  <input value={slot.address || ""} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} placeholder="e.g. netflix.com/login or shared@email.com" autoComplete="off" spellCheck={false} />
</div>`;

const adminReplacement = `<div className="form-group">
  <label>📧 Email Address <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.75rem"}}>— used to log in to the account</span></label>
  <input value={slot.inviteLink || ""} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, inviteLink: e.target.value } : x))} placeholder="e.g. account@gmail.com" autoComplete="off" spellCheck={false} />
</div>

<div className="form-group">
  <label>🔒 Password <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.75rem"}}>— shown masked to members, reveal on tap</span></label>
  <input value={slot.address || ""} onChange={e => onSetEditSlots(s => s.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} placeholder="Enter the account password" autoComplete="off" spellCheck={false} />
</div>`;

if (src.includes(adminAnchor)) { src = src.replace(adminAnchor, adminReplacement); console.log('✓ Admin form labels updated'); }
else { console.log('⚠ Admin form anchor not found'); ok = false; }

const viewAnchor = `      <div className="cv-slots">
        {creds.slots?.map((slot, i) => (
          <div key={i} className="cv-slot">
            <div className="cv-slot-header">
              <span className="cv-slot-badge">#{slot.slotNumber || i + 1}</span>
              <span className="cv-slot-label">{slot.label}</span>
              <button className="cv-copy-all-btn" onClick={() => copy(\`slot-all-\${i}\`, [slot.label, slot.inviteLink && \`Invite link: \${slot.inviteLink}\`, slot.address && \`Address: \${slot.address}\`, slot.note && \`Note: \${slot.note}\`, ...(Array.isArray(slot.extras) ? slot.extras.filter(e => e && (e.label || e.value)).map(e => \`\${e.label || "Extra"}: \${e.value || ""}\`) : [])].filter(Boolean).join("\\n"))}>
                {copied[\`slot-all-\${i}\`] ? "✓ Copied!" : "⎘ Copy All"}
              </button>
            </div>
            {slot.inviteLink && (
              <div className="cv-field">
                <div className="cv-field-label">🔗 Invite Link</div>
                <div className="cv-field-row">
                  <a href={slot.inviteLink} target="_blank" rel="noopener noreferrer" className="cv-field-value" style={{ color:"var(--accent)", textDecoration:"none", wordBreak:"break-all" }}>{slot.inviteLink}</a>
                  <div className="cv-field-actions">
                    <a href={slot.inviteLink} target="_blank" rel="noopener noreferrer" className="cv-copy-btn" style={{ background:"linear-gradient(90deg, var(--accent), var(--accent2))", color:"#fff", fontWeight:600 }}>✅ Accept Invite</a>
                    <button className={\`cv-copy-btn \${copied[\`inv-\${i}\`] ? "copied" : ""}\`} onClick={() => copy(\`inv-\${i}\`, slot.inviteLink)}>{copied[\`inv-\${i}\`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}</button>
                  </div>
                </div>
              </div>
            )}

            {slot.address && (
              <div className="cv-field">
                <div className="cv-field-label">📍 Account Address</div>
                <div className="cv-field-row">
                  <span className="cv-field-value" style={{ wordBreak:"break-all" }}>{slot.address}</span>
                  <div className="cv-field-actions">
                    <button className={\`cv-copy-btn \${copied[\`addr-\${i}\`] ? "copied" : ""}\`} onClick={() => copy(\`addr-\${i}\`, slot.address)}>{copied[\`addr-\${i}\`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}</button>
                  </div>
                </div>
              </div>
            )}`;

const viewReplacement = `      <div style={{ margin:"0 0 16px", padding:"12px 16px", background:"rgba(124,106,255,0.06)", borderRadius:10, border:"1px solid rgba(124,106,255,0.15)" }}>
        <div style={{ fontWeight:700, fontSize:"0.88rem", marginBottom:6 }}>📺 How to log in to your {serviceName} account</div>
        <div style={{ fontSize:"0.78rem", color:"var(--muted)", lineHeight:1.6 }}>
          Use the email and password below to sign in on {serviceName}. If it asks for a verification code, check the <strong style={{ color:"var(--accent)" }}>🔑 OTP / Verification Code</strong> section above — click <em>Check</em> and then <em>Reveal</em> to see it.
        </div>
      </div>
      <div className="cv-slots">
        {creds.slots?.map((slot, i) => (
          <div key={i} className="cv-slot">
            <div className="cv-slot-header">
              <span className="cv-slot-badge">#{slot.slotNumber || i + 1}</span>
              <span className="cv-slot-label">{slot.label}</span>
              <button className="cv-copy-all-btn" onClick={() => copy(\`slot-all-\${i}\`, [slot.label, slot.inviteLink && \`Email: \${slot.inviteLink}\`, slot.address && \`Password: \${slot.address}\`, slot.note && \`Note: \${slot.note}\`, ...(Array.isArray(slot.extras) ? slot.extras.filter(e => e && (e.label || e.value)).map(e => \`\${e.label || "Extra"}: \${e.value || ""}\`) : [])].filter(Boolean).join("\\n"))}>
                {copied[\`slot-all-\${i}\`] ? "✓ Copied!" : "⎘ Copy All"}
              </button>
            </div>
            {slot.inviteLink && (
              <div className="cv-field">
                <div className="cv-field-label">📧 Email address</div>
                <div className="cv-field-row">
                  <span className="cv-field-value" style={{ wordBreak:"break-all" }}>{slot.inviteLink}</span>
                  <div className="cv-field-actions">
                    <button className={\`cv-copy-btn \${copied[\`inv-\${i}\`] ? "copied" : ""}\`} onClick={() => copy(\`inv-\${i}\`, slot.inviteLink)}>{copied[\`inv-\${i}\`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}</button>
                  </div>
                </div>
              </div>
            )}

            {slot.address && (
              <div className="cv-field">
                <div className="cv-field-label">🔒 Password</div>
                <div className="cv-field-row">
                  <span className="cv-field-value" style={{ wordBreak:"break-all", fontFamily:"monospace" }}>
                    {revealedPw[i] ? slot.address : "•".repeat(Math.min(slot.address.length, 12))}
                  </span>
                  <div className="cv-field-actions">
                    {!revealedPw[i] ? (
                      <button className="cv-copy-btn" onClick={() => { setRevealedPw(r => ({ ...r, [i]: true })); setTimeout(() => setRevealedPw(r => ({ ...r, [i]: false })), 30000); }}>👁 Reveal</button>
                    ) : (
                      <button className={\`cv-copy-btn \${copied[\`addr-\${i}\`] ? "copied" : ""}\`} onClick={() => copy(\`addr-\${i}\`, slot.address)}>{copied[\`addr-\${i}\`] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}</button>
                    )}
                  </div>
                </div>
              </div>
            )}`;

if (src.includes(viewAnchor)) { src = src.replace(viewAnchor, viewReplacement); console.log('✓ View mode fields updated'); }
else { console.log('⚠ View mode anchor not found'); ok = false; }

const stateAnchor = `  const [copied, setCopied] = useState({});`;
const stateReplacement = `  const [copied, setCopied] = useState({});
  const [revealedPw, setRevealedPw] = useState({});`;
if (src.includes(stateAnchor) && !src.includes('revealedPw')) { src = src.replace(stateAnchor, stateReplacement); console.log('✓ revealedPw state added'); }
else if (src.includes('revealedPw')) { console.log('⚠ revealedPw already exists'); }
else { console.log('⚠ copied-state anchor not found'); ok = false; }

if (ok) {
  fs.writeFileSync(file, src);
  console.log('\n✅ All patches applied, file written');
} else {
  console.log('\n❌ One or more anchors missing — NO CHANGES WRITTEN');
}
