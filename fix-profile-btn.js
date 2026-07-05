const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find and remove the duplicate/broken block
// Look for the broken pattern - two consecutive profile button blocks
let firstIdx = -1;
let secondIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('loadProfile(u)') && firstIdx === -1) firstIdx = i;
  else if (lines[i].includes('loadProfile(u)') && secondIdx === -1) secondIdx = i;
}

console.log('First profile btn at:', firstIdx);
console.log('Second profile btn at:', secondIdx);

if (firstIdx !== -1 && secondIdx !== -1) {
  // Find start of broken first block (going back to find the {u.role !== "superadmin")
  let blockStart = firstIdx;
  while (blockStart > 0 && !lines[blockStart].includes('{u.role !== "superadmin"')) blockStart--;
  
  // Find end of broken first block
  let blockEnd = firstIdx;
  while (blockEnd < lines.length && !lines[blockEnd].includes(')}')) blockEnd++;
  
  console.log('Removing broken block from line', blockStart, 'to', blockEnd);
  lines.splice(blockStart, blockEnd - blockStart + 1);
  
  fs.writeFileSync(file, lines.join('\n'));
  console.log('✓ Duplicate profile button removed');
} else {
  console.log('⚠ Could not find duplicate');
}
