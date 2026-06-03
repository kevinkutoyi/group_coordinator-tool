const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Remove misplaced lines at top until we hit the import line
let removed = [];
while (lines.length > 0 && !lines[0].startsWith('import')) {
  removed.push(lines.shift());
}

console.log('Removed', removed.length, 'misplaced lines from top');

// Find where remindAllBusy state is and insert after it
const idx = lines.findIndex(l => l.includes('remindAllBusy]   = useState'));
console.log('Inserting after line', idx + 1);
lines.splice(idx + 1, 0, ...removed);

fs.writeFileSync(file, lines.join('\n'));
console.log('✓ File saved');

// Verify
const verify = fs.readFileSync(file, 'utf8').split('\n');
console.log('Line 1 is now:', JSON.stringify(verify[0]));
console.log('Line 2 is now:', JSON.stringify(verify[1]));
