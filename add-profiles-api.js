const fs = require('fs');
const file = 'frontend/src/api.js';
let api = fs.readFileSync(file, 'utf8');

if (!api.includes('getGroupProfiles')) {
  api = api.replace(
    '  getGroupOtp:            (gid)  => req(`/groups/${gid}/otp`),',
    `  getGroupOtp:            (gid)  => req(\`/groups/\${gid}/otp\`),
  getGroupProfiles:       (gid)        => req(\`/groups/\${gid}/profiles\`),
  createGroupProfile:     (gid, data)  => req(\`/groups/\${gid}/profiles\`, { method: "POST", body: data }),
  updateGroupProfile:     (gid, pid, data) => req(\`/groups/\${gid}/profiles/\${pid}\`, { method: "PATCH", body: data }),
  deleteGroupProfile:     (gid, pid)   => req(\`/groups/\${gid}/profiles/\${pid}\`, { method: "DELETE" }),
  selectGroupProfile:     (gid, pid)   => req(\`/groups/\${gid}/profiles/\${pid}/select\`, { method: "POST" }),
  assignMemberProfile:    (mid, pid)   => req(\`/admin/members/\${mid}/assign-profile\`, { method: "PATCH", body: { profileId: pid } }),`
  );
  fs.writeFileSync(file, api);
  console.log('✓ Profile API methods added');
} else {
  console.log('⚠ Already exists');
}
