const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');
let ok = true;

const otpBlock = `      {inboundEmail && (isConfirmedMember || canManage) && (
        <div style={{ margin:"0 0 16px", padding:"12px 16px", background:"rgba(124,106,255,0.08)", borderRadius:10, border:"1px solid rgba(124,106,255,0.2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontWeight:600, fontSize:"0.82rem", color:"var(--accent)" }}>🔑 OTP / Verification Code</div>
            <button className="btn btn-sm btn-outline" style={{ fontSize:"0.72rem" }} onClick={fetchOtp} disabled={otpLoading}>
              {otpLoading ? <span className="spinner"/> : "↻ Check"}
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
              No active code. Click Check after requesting a login code from {serviceName}.
            </div>
          )}
        </div>
      )}
`;

if (!src.includes(otpBlock)) { console.log('⚠ OTP block text not found exactly — aborting'); process.exit(1); }

// Remove from current position
src = src.replace(otpBlock, '');
console.log('✓ OTP block removed from top');

// Rename button and copy while re-inserting
const relocatedOtpBlock = otpBlock
  .replace('{otpLoading ? <span className="spinner"/> : "↻ Check"}', '{otpLoading ? <span className="spinner"/> : "🔑 Click to Get OTP"}')
  .replace('No active code. Click Check after requesting a login code from {serviceName}.', 'No active code yet. Click "🔑 Click to Get OTP" above after requesting a login code from {serviceName}.');

// Insert right after cv-slots closing div, before confirmDelete block
const insertAnchor = `        </div>
      </div>
      {confirmDelete && (`;

if (!src.includes(insertAnchor)) { console.log('⚠ Insert anchor not found — aborting, OTP block already removed, need manual fix'); process.exit(1); }

src = src.replace(insertAnchor, `        </div>
      </div>
${relocatedOtpBlock}
      {confirmDelete && (`);
console.log('✓ OTP block re-inserted after login fields');

// Update login-guide wording from "above" to "below"
src = src.replace(
  'section above — click <em>Check</em> and then <em>Reveal</em> to see it.',
  'section below — click <em>🔑 Click to Get OTP</em> and then <em>Reveal</em> to see it.'
);
console.log('✓ Login guide wording updated to point below');

fs.writeFileSync(file, src);
console.log('\n✅ All done, file written');
