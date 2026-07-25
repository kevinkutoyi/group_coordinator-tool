const fs = require('fs');
const file = 'frontend/src/api.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const idx = lines.findIndex(l => l.includes('getGroupOtp:'));
console.log('Found getGroupOtp at line:', idx, JSON.stringify(lines[idx]));

if (idx !== -1 && !lines.some(l => l.includes('getGroupProfiles'))) {
  lines.splice(idx + 1, 0,
    '  getGroupProfiles:       (gid)        => req(`/groups/${gid}/profiles`),',
    '  createGroupProfile:     (gid, data)  => req(`/groups/${gid}/profiles`, { method: "POST", body: data }),',
    '  updateGroupProfile:     (gid, pid, data) => req(`/groups/${gid}/profiles/${pid}`, { method: "PATCH", body: data }),',
    '  deleteGroupProfile:     (gid, pid)   => req(`/groups/${gid}/profiles/${pid}`, { method: "DELETE" }),',
    '  selectGroupProfile:     (gid, pid)   => req(`/groups/${gid}/profiles/${pid}/select`, { method: "POST" }),',
    '  assignMemberProfile:    (mid, pid)   => req(`/admin/members/${mid}/assign-profile`, { method: "PATCH", body: { profileId: pid } }),'
  );
  fs.writeFileSync(file, lines.join('\n'));
  console.log('✓ Profile API methods inserted');
} else {
  console.log('⚠ Already exists or anchor not found');
}
