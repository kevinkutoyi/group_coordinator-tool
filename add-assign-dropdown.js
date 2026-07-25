const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');
let ok = true;

// 1. Pass allMembers prop from parent call site
const callAnchor = `            inboundEmail={group.inboundEmail}
            groupId2={id}`;
const callReplacement = `            inboundEmail={group.inboundEmail}
            groupId2={id}
            allMembers={payingMembers}`;

if (src.includes(callAnchor) && !src.includes('allMembers={payingMembers}')) {
  src = src.replace(callAnchor, callReplacement);
  console.log('✓ allMembers prop passed from parent');
} else if (src.includes('allMembers={payingMembers}')) {
  console.log('⚠ allMembers prop already passed');
} else {
  console.log('⚠ call anchor not found'); ok = false;
}

// 2. Accept allMembers in CredentialVaultInline signature
const sigAnchor = `  isConfirmedMember, inboundEmail, groupId2,
}) {`;
const sigReplacement = `  isConfirmedMember, inboundEmail, groupId2, allMembers,
}) {`;

if (src.includes(sigAnchor)) {
  src = src.replace(sigAnchor, sigReplacement);
  console.log('✓ allMembers accepted in component signature');
} else if (src.includes('isConfirmedMember, inboundEmail, groupId2, allMembers,')) {
  console.log('⚠ signature already updated');
} else {
  console.log('⚠ signature anchor not found'); ok = false;
}

// 3. Add dropdown next to Unassign button
const rowAnchor = `              <div style={{ display:"flex", gap:6 }}>
                {p.assignedTo && (
                  <button className="btn btn-sm btn-outline" onClick={async () => {
                    try { await api.assignMemberProfile(p.assignedTo.memberId, null); await fetchProfiles(); }
                    catch (err) { alert(err.message); }
                  }}>Unassign</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => deleteProfile(p.id)}>🗑️</button>
              </div>`;

const rowReplacement = `              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                <select
                  value={p.assignedTo?.memberId || ""}
                  onChange={async (e) => {
                    const memberId = e.target.value;
                    if (!memberId) return;
                    try { await api.assignMemberProfile(memberId, p.id); await fetchProfiles(); }
                    catch (err) { alert(err.message); }
                  }}
                  style={{ padding:"5px 8px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.78rem" }}
                >
                  <option value="">Assign to…</option>
                  {(allMembers || []).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {p.assignedTo && (
                  <button className="btn btn-sm btn-outline" onClick={async () => {
                    try { await api.assignMemberProfile(p.assignedTo.memberId, null); await fetchProfiles(); }
                    catch (err) { alert(err.message); }
                  }}>Unassign</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => deleteProfile(p.id)}>🗑️</button>
              </div>`;

if (src.includes(rowAnchor)) {
  src = src.replace(rowAnchor, rowReplacement);
  console.log('✓ Assign dropdown added');
} else if (src.includes('Assign to…')) {
  console.log('⚠ Dropdown already added');
} else {
  console.log('⚠ row anchor not found'); ok = false;
}

if (ok) {
  fs.writeFileSync(file, src);
  console.log('\n✅ All patches applied, file written');
} else {
  console.log('\n❌ One or more anchors missing — check above, NO FILE WRITE if any critical anchor failed');
  // still write partial successes if any succeeded, to avoid losing progress
  fs.writeFileSync(file, src);
  console.log('(partial changes, if any, were still saved — review before deploying)');
}
