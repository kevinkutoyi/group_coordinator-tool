const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

const relocatedOtpBlock = `      {inboundEmail && (isConfirmedMember || canManage) && (
        <div style={{ margin:"16px 0 0", padding:"12px 16px", background:"rgba(124,106,255,0.08)", borderRadius:10, border:"1px solid rgba(124,106,255,0.2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontWeight:600, fontSize:"0.82rem", color:"var(--accent)" }}>🔑 OTP / Verification Code</div>
            <button className="btn btn-sm btn-outline" style={{ fontSize:"0.72rem" }} onClick={fetchOtp} disabled={otpLoading}>
              {otpLoading ? <span className="spinner"/> : "🔑 Click to Get OTP"}
            </button>
          </div>
          {otpData?.otp ? (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:"1.8rem", fontWeight:800, letterSpacing:6, color:"var(--text)", fontFamily:"monospace" }}>
                  {otpRevealed ? otpData.otp : "•".repeat(otpData.otp.length)}
                </span>
                {!otpRevealed ? (
                  <button className="btn btn-sm btn-outline" onClick={() => { setOtpRevealed(true); setTimeout(() => setOtpRevealed(false), 30000); }}>👁 Reveal</button>
                ) : (
                  <button className="btn btn-sm btn-outline" onClick={() => navigator.clipboard.writeText(otpData.otp)}>⊕ Copy</button>
                )}
              </div>
              <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:4 }}>
                {otpRevealed && <span style={{ color:"var(--warning)", marginRight:8 }}>⚠ Auto-hides in 30s</span>}
                <span style={{ color: otpData.expiresIn <= 2 ? "var(--error)" : "var(--warning)", fontWeight:600 }}>
                  ⏱ Code expires in {otpData.expiresIn} min
                </span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>
              No active code yet. Click "🔑 Click to Get OTP" above after requesting a login code from {serviceName}.
            </div>
          }
        </div>
      )}
`;

const anchor = `        ))}
      </div>
      {confirmDelete && (`;

const replacement = `        ))}
      </div>
${relocatedOtpBlock}
      {confirmDelete && (`;

if (src.includes(anchor)) {
  src = src.replace(anchor, replacement);
  console.log('✓ OTP block inserted after login fields');
} else {
  console.log('⚠ Anchor still not found — no changes made');
  process.exit(1);
}

if (src.includes('section above — click <em>Check</em>')) {
  src = src.replace(
    'section above — click <em>Check</em> and then <em>Reveal</em> to see it.',
    'section below — click <em>🔑 Click to Get OTP</em> and then <em>Reveal</em> to see it.'
  );
  console.log('✓ Login guide wording updated');
} else {
  console.log('⚠ Login guide wording anchor not found (may need manual check)');
}

fs.writeFileSync(file, src);
console.log('\n✅ File written');
