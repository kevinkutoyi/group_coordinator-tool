const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

const bad = `        </div>
      )}
      <div style={{ display:"none" }}>`;

if (src.includes(bad)) {
  src = src.replace(bad, `        </div>
      )}`);
  fs.writeFileSync(file, src);
  console.log('✓ Stray div removed');
} else {
  console.log('⚠ Pattern not found — showing context instead');
  const idx = src.indexOf('No active code. Click Check');
  console.log(src.substring(idx, idx + 300));
}
