const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Add state + fetch/select functions to CredentialVaultInline ────────
const sigAnchor = `  isConfirmedMember, inboundEmail, groupId2,
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

const sigReplacement = `  isConfirmedMember, inboundEmail, groupId2,
}) {
  const [otpData, setOtpData] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpRevealed, setOtpRevealed] = useState(false);
  async function fetchOtp() {
    setOtpLoading(true);
    try { const data = await api.getGroupOtp(groupId2 || groupId); setOtpData(data); setOtpRevealed(false); }
    catch (err) { console.error(err); }
    finally { setOtpLoading(false); }
  }
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRevealed, setProfileRevealed] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [profileMsg, setProfileMsg] = useState(null);
  async function fetchProfiles() {
    setProfileLoading(true);
    try { const data = await api.getGroupProfiles(groupId2 || groupId); setProfileData(data); }
    catch (err) { console.error(err); }
    finally { setProfileLoading(false); }
  }
  async function selectProfile(pid) {
    setSelectingId(pid); setProfileMsg(null);
    try { await api.selectGroupProfile(groupId2 || groupId, pid); await fetchProfiles(); }
    catch (err) { setProfileMsg(err.message); }
    finally { setSelectingId(null); }
  }
  useEffect(() => { if (isConfirmedMember) fetchProfiles(); }, [isConfirmedMember]);`;

if (src.includes(sigAnchor)) {
  src = src.replace(sigAnchor, sigReplacement);
  console.log('✓ Profile state + functions added');
} else {
  console.log('⚠ Signature anchor not found — aborting, no changes made');
  process.exit(1);
}

// ── 2. Insert profile UI right after OTP box closing, before creds.generalNote ──
const uiAnchor = `          ) : (
            <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>
              No active code. Click Check after requesting a login code from {serviceName}.
            </div>
          )}
        </div>
      )}
      {creds.generalNote && (`;

const uiReplacement = `          ) : (
            <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>
              No active code. Click Check after requesting a login code from {serviceName}.
            </div>
          )}
        </div>
      )}
      {isConfirmedMember && profileData?.role === "member" && (
        <div style={{ margin:"0 0 16px", padding:"12px 16px", background:"rgba(124,106,255,0.08)", borderRadius:10, border:"1px solid rgba(124,106,255,0.2)" }}>
          <div style={{ fontWeight:600, fontSize:"0.82rem", color:"var(--accent)", marginBottom:8 }}>🎬 Your Profile</div>
          {profileData.myProfile ? (
            <div>
              <div style={{ fontSize:"0.9rem", fontWeight:700, marginBottom:6 }}>{profileData.myProfile.name}</div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:"1.6rem", fontWeight:800, letterSpacing:6, color:"var(--text)", fontFamily:"monospace" }}>
                  {profileRevealed ? profileData.myProfile.pin : "•".repeat(profileData.myProfile.pin.length)}
                </span>
                {!profileRevealed ? (
                  <button className="btn btn-sm btn-outline" onClick={() => { setProfileRevealed(true); setTimeout(() => setProfileRevealed(false), 30000); }}>👁 Reveal PIN</button>
                ) : (
                  <button className="btn btn-sm btn-outline" onClick={() => navigator.clipboard.writeText(profileData.myProfile.pin)}>⊕ Copy</button>
                )}
              </div>
              {profileRevealed && <div style={{ fontSize:"0.7rem", color:"var(--warning)", marginTop:4 }}>⚠ Auto-hides in 30s</div>}
            </div>
          ) : profileData.available?.length > 0 ? (
            <div>
              <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:8 }}>Pick your profile — this is permanent, only the admin can change it later.</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {profileData.available.map(p => (
                  <button key={p.id} className="btn btn-sm btn-primary" disabled={selectingId === p.id} onClick={() => selectProfile(p.id)}>
                    {selectingId === p.id ? <span className="spinner"/> : p.name}
                  </button>
                ))}
              </div>
              {profileMsg && <div style={{ fontSize:"0.75rem", color:"var(--error)", marginTop:8 }}>{profileMsg}</div>}
            </div>
          ) : (
            <div style={{ fontSize:"0.78rem", color:"var(--muted)" }}>No profiles available yet — ask the organizer to set them up.</div>
          )}
        </div>
      )}
      {creds.generalNote && (`;

if (src.includes(uiAnchor)) {
  src = src.replace(uiAnchor, uiReplacement);
  console.log('✓ Profile picker UI inserted');
} else {
  console.log('⚠ UI anchor not found — aborting before write');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log('✓ File written');
