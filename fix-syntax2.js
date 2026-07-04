const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Fix the malformed fragment opener
src = src.replace(
  '{canManage && m.expiresAt && <> (\n                  <div style={{ marginTop: 6 }}>',
  '{canManage && m.expiresAt && (\n                  <div style={{ marginTop: 6 }}>'
);

// Fix the malformed fragment closer
src = src.replace(
  '                <>\n              )}',
  '                </div>\n              )}'
);

// Remove the stray </> 
src = src.replace('                </>\n              )}', '              )}');

fs.writeFileSync(file, src);
console.log('✓ Fixed');
