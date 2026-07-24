const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the renew date block start and end
const renewStart = lines.findIndex(l => l.includes('{canManage && (') && 
  lines[lines.indexOf(l) + 1]?.includes('Subscription Renew Date'));

// Find end of renew date block
let renewEnd = renewStart;
let depth = 0;
for (let i = renewStart; i < lines.length; i++) {
  if (lines[i].includes('{canManage && (') && i === renewStart) depth = 1;
  else {
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    depth += opens - closes;
  }
  if (depth <= 0 && i > renewStart) { renewEnd = i; break; }
}

console.log('Renew date block:', renewStart, 'to', renewEnd);

// Extract the block
const renewBlock = lines.splice(renewStart, renewEnd - renewStart + 1);
console.log('Extracted', renewBlock.length, 'lines');

// Find Admin View tag and insert renew date block after it
const adminViewIdx = lines.findIndex(l => l.includes('🛡️ Admin View'));
let adminViewBlockEnd = adminViewIdx;
// Find closing )} of the isSuperAdmin block
for (let i = adminViewIdx; i < lines.length; i++) {
  if (lines[i].trim() === ')}') { adminViewBlockEnd = i; break; }
}

console.log('Inserting after Admin View block end at line:', adminViewBlockEnd);
lines.splice(adminViewBlockEnd + 1, 0, ...renewBlock);

fs.writeFileSync(file, lines.join('\n'));
console.log('✓ Renew date moved inside card');
