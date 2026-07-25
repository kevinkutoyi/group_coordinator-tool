const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Add null check for group before inboundEmail access
src = src.replace(
  '{group.inboundEmail && (',
  '{group?.inboundEmail && ('
);

// Also fix group.serviceName reference in the OTP section
src = src.replace(
  'No active OTP. When {group.serviceName}',
  'No active OTP. When {group?.serviceName}'
);

src = src.replace(
  'it will appear here automatically.',
  'it will appear here automatically.'
);

fs.writeFileSync(file, src);
console.log('✓ Fixed null checks');
