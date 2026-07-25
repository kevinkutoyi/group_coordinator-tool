const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. api.js already has getGroupOtp / setGroupInboundEmail — verify ─────
const apiSrc = fs.readFileSync('frontend/src/api.js', 'utf8');
if (!apiSrc.includes('getGroupOtp')) {
  console.log('⚠ api.js missing getGroupOtp — re-add manually');
} else {
  console.log('✓ api.js already has OTP methods');
}

// ── 2. Add inbound email admin setting near renew date (proven pattern) ──
if (!src.includes('📬 Inbound Email')) {
  const anchor = `              {canManage && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(124,106,255,0.06)", borderRadius: 10, border: "1px solid rgba(124,106,255,0.15)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>📅 Subscription Renew Date <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(admin only)</span></div>`;

  const replacement = `              {canManage && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(124,106,255,0.06)", borderRadius: 10, border: "1px solid rgba(124,106,255,0.15)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>📬 Inbound Email <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(for OTP capture)</span></div>
                  <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginBottom:8 }}>OTPs sent here appear automatically for confirmed members.</div>
                  {group.inboundEmail && <div style={{ fontSize:"0.72rem", color:"var(--success)", marginBottom:8, fontWeight:600 }}>✓ Current: {group.inboundEmail}</div>}
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <input type="email" defaultValue={group.inboundEmail || ""} id="inboundEmailInput"
                      placeholder="e.g. netflix-group1@inbound.splitsubs.com"
                      style={{ flex:1, padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem", minWidth:200 }}
                    />
                    <button className="btn btn-sm btn-primary" onClick={async () => {
                      const val = document.getElementById("inboundEmailInput").value;
                      try { await api.setGroupInboundEmail(id, val || null); setMsg({ type:"ok", text:"Inbound email saved." }); reload(); }
                      catch (err) { setMsg({ type:"err", text: err.message }); }
                    }}>💾 Save</button>
                  </div>
                </div>
              )}
              {canManage && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(124,106,255,0.06)", borderRadius: 10, border: "1px solid rgba(124,106,255,0.15)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>📅 Subscription Renew Date <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(admin only)</span></div>`;

  if (src.includes(anchor)) {
    src = src.replace(anchor, replacement);
    console.log('✓ Inbound email admin setting added');
  } else {
    console.log('⚠ Renew date anchor not found — skipped');
  }
} else {
  console.log('⚠ Inbound email section already exists');
}

// ── 3. Pass new props into CredentialVaultInline call site ────────────────
const callAnchor = `            isMyMember={!!myMember}
            isOrganizer={isOrganizer}
            canManage={canManage}`;
const callReplacement = `            isMyMember={!!myMember}
            isConfirmedMember={myMember?.paymentStatus === "confirmed"}
            isOrganizer={isOrganizer}
            canManage={canManage}
            inboundEmail={group.inboundEmail}
            groupId2={id}`;

if (src.includes(callAnchor) && !src.includes('isConfirmedMember=')) {
  src = src.replace(callAnchor, callReplacement);
  console.log('✓ Props passed to CredentialVaultInline');
} else {
  console.log('⚠ Call site anchor not found or already patched');
}

// ── 4. Update CredentialVaultInline signature to accept new props ─────────
const sigAnchor = `  groupId, groupName, serviceName, serviceIcon, maxSlots,
  onJoin, onLogin, groupStatus, isLoggedIn, isCustomer, isMyMember, isOrganizer,
  canManage, creds, loading, editing, editSlots, editNote, saving, saveMsg,
  onStartEdit, onSetEditSlots, onSetEditNote, onSave, onCancelEdit, onDelete, onSaveMsgClear,
}) {`;
const sigReplacement = `  groupId, groupName, serviceName, serviceIcon, maxSlots,
  onJoin, onLogin, groupStatus, isLoggedIn, isCustomer, isMyMember, isOrganizer,
  canManage, creds, loading, editing, editSlots, editNote, saving, saveMsg,
  onStartEdit, onSetEditSlots, onSetEditNote, onSave, onCancelEdit, onDelete, onSaveMsgClear,
  isConfirmedMember, inboundEmail, groupId2,
}) {
  const [otpData, setOtpData] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpRevealed, setOtpRevealed] = useState(false);
  async function fetchOtp() {
    setOtpLoading(true);
    try { const data = await api.getGroupOtp(groupId2 || groupId); setOtpData(data); setOtpRevealed(false); }
    catch (err) { console.error(err); }
    finally { setOtpLoading(false); }
  }`;

if (src.includes(sigAnchor)) {
  src = src.replace(sigAnchor, sigReplacement);
  console.log('✓ CredentialVaultInline signature updated with OTP state');
} else {
  console.log('⚠ Signature anchor not found');
}

// ── 5. Insert OTP display box right after the vault title block ───────────
const titleAnchor = `        <div className="cv-vault-title-block">
          <h3 className="cv-vault-title">🔓 Access Credentials Unlocked</h3>
          <p className="cv-vault-subtitle">
            {creds.slots?.length} slot{creds.slots?.length !== 1 ? "s" : ""} · Updated {new Date(creds.updatedAt).toLocaleDateString()}
          </p>
        </div>`;

const titleReplacement = `        <div className="cv-vault-title-block">
          <h3 className="cv-vault-title">🔓 Access Credentials Unlocked</h3>
          <p className="cv-vault-subtitle">
            {creds.slots?.length} slot{creds.slots?.length !== 1 ? "s" : ""} · Updated {new Date(creds.updatedAt).toLocaleDateString()}
          </p>
        </div>`;

if (src.includes(titleAnchor)) {
  src = src.replace(titleAnchor, titleReplacement);
  console.log('✓ Title block located (no change needed there)');
} else {
  console.log('⚠ Title anchor not found');
}

// Insert OTP box after the manage-btns closing, before final </div> of cv-vault-header
const headerCloseAnchor = `        {canManage && (
          <div className="cv-manage-btns">
            <button className="btn btn-sm btn-outline" onClick={onStartEdit}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>
        )}`;

const headerCloseReplacement = `        {canManage && (
          <div className="cv-manage-btns">
            <button className="btn btn-sm btn-outline" onClick={onStartEdit}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>
        )}
      </div>

      {inboundEmail && (isConfirmedMember || canManage) && (
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
      <div style={{ display:"none" }}>`;

if (src.includes(headerCloseAnchor)) {
  src = src.replace(headerCloseAnchor, headerCloseReplacement);
  console.log('✓ OTP box inserted after vault header');
} else {
  console.log('⚠ Header close anchor not found — OTP box NOT inserted');
}

fs.writeFileSync(file, src);
console.log('\n✅ Script complete — check for warnings above');
