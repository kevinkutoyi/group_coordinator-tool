const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find renew date block
const renewStart = lines.findIndex(l => l.includes('{canManage && (') &&
  lines[lines.findIndex((x, i) => i > lines.indexOf(l) - 1 && x === l) + 1]?.includes('Subscription Renew Date'));

// Better approach - find by content
let rStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('{canManage && (') && lines[i+1]?.includes('marginTop: 12') && lines[i+2]?.includes('Subscription Renew Date')) {
    rStart = i; break;
  }
}
console.log('Renew block starts at:', rStart);

if (rStart !== -1) {
  // Find end - count braces
  let depth = 0;
  let rEnd = rStart;
  for (let i = rStart; i < lines.length; i++) {
    const opens = (lines[i].match(/[({]/g) || []).length;
    const closes = (lines[i].match(/[)}]/g) || []).length;
    depth += opens - closes;
    if (depth <= 0 && i > rStart) { rEnd = i; break; }
  }
  console.log('Renew block ends at:', rEnd);

  // Extract block
  const block = lines.splice(rStart, rEnd - rStart + 1);
  console.log('Extracted', block.length, 'lines');

  // Find the closing of manage-controls section - line before </div></div></div> that closes the card
  // Look for the line with manage-controls closing
  const manageEnd = lines.findIndex(l => l.includes('</div>') && 
    lines[lines.indexOf(l) - 1]?.includes('</div>') &&
    lines[lines.indexOf(l) + 1]?.trim() === '</div>' &&
    lines[lines.indexOf(l) + 2]?.includes('gd-desc'));

  console.log('Insert after line:', manageEnd);

  if (manageEnd !== -1) {
    lines.splice(manageEnd + 1, 0, ...block);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('✓ Renew date moved inside card before closing');
  } else {
    // Fallback - insert before gd-desc
    const gdDescIdx = lines.findIndex(l => l.includes('gd-desc'));
    lines.splice(gdDescIdx - 1, 0, ...block);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('✓ Renew date inserted before gd-desc');
  }
}
