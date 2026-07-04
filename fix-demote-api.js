const fs = require('fs');
const file = 'frontend/src/api.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

if (!lines.some(l => l.includes('demoteToCustomer'))) {
  const idx = lines.findIndex(l => l.includes('adjustMemberExpiry'));
  lines.splice(idx + 1, 0,
    '  demoteToCustomer:       (uid)  => req(`/admin/users/${uid}/demote-to-customer`, { method: "PATCH" }),'
  );
  fs.writeFileSync(file, lines.join('\n'));
  console.log('✓ demoteToCustomer added to api.js');
} else {
  console.log('⚠ Already exists');
}
