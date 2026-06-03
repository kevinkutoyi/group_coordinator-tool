const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let src = fs.readFileSync(file, 'utf8');

const before = '!["pending-payments","groups","newsletter","group-review","org-email","payouts"].includes(tab)';
const after  = '!["pending-payments","groups","newsletter","group-review","org-email","payouts","expired"].includes(tab)';

if (src.includes(before)) {
  src = src.replace(before, after);
  fs.writeFileSync(file, src);
  console.log('✓ Fixed — expired added to exclusion list');
} else {
  console.log('⚠ Pattern not found — checking what is there...');
  const idx = src.indexOf('pending-payments');
  console.log('Context:', JSON.stringify(src.substring(idx - 5, idx + 120)));
}
