const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Add admin fetch + create + reassign state/functions to signature ──
const sigAnchor = `  useEffect(() => { if (isConfirmedMember) fetchProfiles(); }, [isConfirmedMember]);`;

const sigReplacement = `  useEffect(() => { if (isConfirmedMember) fetchProfiles(); }, [isConfirmedMember]);
  useEffect(() => { if (canManage) fetchProfiles(); }, [canManage]);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfilePin, setNewProfilePin] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  async function createProfile() {
    if (!newProfileName || !newProfilePin) return;
    setCreatingProfile(true);
    try { await api.createGroupProfile(groupId2 || groupId, { name: newProfileName, pin: newProfilePin }); setNewProfileName(""); setNewProfilePin(""); await fetchProfiles(); }
    catch (err) { alert(err.message); }
    finally { setCreatingProfile(false); }
  }
  async function deleteProfile(pid) {
    if (!window.confirm("Delete this profile? Any assigned member will be unassigned.")) return;
    try { await api.deleteGroupProfile(groupId2 || groupId, pid); await fetchProfiles(); }
    catch (err) { alert(err.message); }
  }`;

if (src.includes(sigAnchor) && !src.includes('createProfile')) {
  src = src.replace(sigAnchor, sigReplacement);
  console.log('✓ Admin profile state + functions added');
} else {
  console.log('⚠ Anchor not found or already patched — aborting');
  process.exit(1);
}

// ── 2. Insert admin panel before creds.generalNote ─────────────────────────
const uiAnchor = `      {creds.generalNote && (
        <div className="cv-general-note"><span className="cv-note-icon">📌</span><span>{creds.generalNote}</span></div>
      )}`;

const uiReplacement = `      {canManage && (
        <div style={{ margin:"0 0 16px", padding:"12px 16px", background:"rgba(124,106,255,0.06)", borderRadius:10, border:"1px solid rgba(124,106,255,0.15)" }}>
          <div style={{ fontWeight:600, fontSize:"0.82rem", color:"var(--accent)", marginBottom:10 }}>🎬 Manage Profiles <span style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:400 }}>(admin only)</span></div>
          {profileData?.profiles?.length > 0 && profileData.profiles.map(p => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)", gap:10, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{p.name} <span style={{ fontFamily:"monospace", color:"var(--muted)", marginLeft:8 }}>PIN: {p.pin}</span></div>
                <div style={{ fontSize:"0.72rem", color: p.assignedTo ? "var(--success)" : "var(--muted)" }}>
                  {p.assignedTo ? "✓ " + p.assignedTo.name : "— unassigned"}
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {p.assignedTo && (
                  <button className="btn btn-sm btn-outline" onClick={async () => {
                    try { await api.assignMemberProfile(p.assignedTo.memberId, null); await fetchProfiles(); }
                    catch (err) { alert(err.message); }
                  }}>Unassign</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => deleteProfile(p.id)}>🗑️</button>
              </div>
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
            <input type="text" placeholder="Profile name (e.g. Profile 1)" value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem", flex:1, minWidth:140 }} />
            <input type="text" placeholder="PIN" value={newProfilePin} onChange={e => setNewProfilePin(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.82rem", width:100 }} />
            <button className="btn btn-sm btn-primary" disabled={creatingProfile} onClick={createProfile}>
              {creatingProfile ? <span className="spinner"/> : "+ Add"}
            </button>
          </div>
        </div>
      )}
      {creds.generalNote && (
        <div className="cv-general-note"><span className="cv-note-icon">📌</span><span>{creds.generalNote}</span></div>
      )}`;

if (src.includes(uiAnchor)) {
  src = src.replace(uiAnchor, uiReplacement);
  console.log('✓ Admin panel inserted');
} else {
  console.log('⚠ UI anchor not found — aborting before write');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log('✓ File written');
