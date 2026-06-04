const fs = require('fs');
const file = 'frontend/src/pages/MyGroupsPage.js';
let src = fs.readFileSync(file, 'utf8');

// Fix: if pending AND expired, show Complete Payment only, not Renew
// Change isPending check to also cover expired-but-pending state
src = src.replace(
  'const isPending   = m.paymentStatus === "pending";',
  'const isPending   = m.paymentStatus === "pending";'
);

// Fix showRenew to not show when already pending
src = src.replace(
  'const showRenew   = isExpired || isExpiring;',
  'const showRenew   = (isExpired || isExpiring) && !isPending;'
);

fs.writeFileSync(file, src);
console.log('✓ Fixed — renew button hidden when pending payment exists');
