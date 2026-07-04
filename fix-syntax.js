const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the closing )} of the badge block that's adjacent to the pay button
let fixIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === ')}' &&
      lines[i+1] && lines[i+1].includes('m.userId === currentUserId && m.paymentStatus === "pending"')) {
    fixIdx = i;
    break;
  }
}

console.log('Fix needed at line:', fixIdx);
if (fixIdx !== -1) {
  // The issue: badge block closes with )} then pay button starts
  // Wrap both in a fragment - add <> before badge, </> after last button block
  
  // Find start of badge block
  let badgeStart = -1;
  for (let i = fixIdx; i >= 0; i--) {
    if (lines[i].includes('{canManage && m.expiresAt &&')) {
      badgeStart = i;
      break;
    }
  }
  console.log('Badge starts at line:', badgeStart);

  // Find end of renew button block
  let renewEnd = -1;
  for (let i = fixIdx + 1; i < lines.length; i++) {
    if (lines[i].includes('"🔄 Renew Subscription"')) {
      // Find the closing of this block
      for (let j = i; j < lines.length; j++) {
        if (lines[j].trim() === ')}' && lines[j+1] && 
            (lines[j+1].includes('expiry badge') || lines[j+1].trim() === '' || lines[j+1].includes('Expiry badge'))) {
          renewEnd = j;
          break;
        }
        if (lines[j].includes('Expiry badge') || (lines[j].trim() === ')}' && j > i + 5)) {
          renewEnd = j;
          break;
        }
      }
      break;
    }
  }
  console.log('Renew ends around line:', renewEnd);

  if (badgeStart !== -1) {
    // Simply add a wrapping div around the badge + buttons block
    lines[badgeStart] = lines[badgeStart].replace(
      '{canManage && m.expiresAt &&',
      '{canManage && m.expiresAt && <>'
    );
    // Close the fragment right before the pay button
    lines[fixIdx] = '                </>\n              )}';
    console.log('✓ Fragment wrapper added');
  }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('✓ File saved');
