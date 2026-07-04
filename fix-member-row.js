const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the member-row div opening
const memberRowIdx = lines.findIndex(l => l.includes('key={m.id}') && l.includes('member-row'));
console.log('Member row at:', memberRowIdx);

// Find the closing of member-row (matching </div>)
let depth = 0;
let memberRowEnd = -1;
for (let i = memberRowIdx; i < lines.length; i++) {
  const opens = (lines[i].match(/<div/g) || []).length;
  const closes = (lines[i].match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (depth === 0 && i > memberRowIdx) {
    memberRowEnd = i;
    break;
  }
}
console.log('Member row ends at:', memberRowEnd);
console.log('Lines in member row:', memberRowEnd - memberRowIdx);

// Show the full member row
lines.slice(memberRowIdx, memberRowEnd + 1).forEach((l, i) => {
  console.log(memberRowIdx + i, l);
});