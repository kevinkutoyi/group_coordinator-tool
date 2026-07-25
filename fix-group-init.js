const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Fix renewDate state initialization that uses group before it loads
src = src.replace(
  'const [renewDate, setRenewDate]     = useState(group?.renewDate ? new Date(group.renewDate).toISOString().split(\'T\')[0] : "");',
  'const [renewDate, setRenewDate]     = useState("");'
);

fs.writeFileSync(file, src);
console.log('✓ Fixed renewDate useState initialization');
