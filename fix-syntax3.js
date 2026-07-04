const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '                  </div>\n              )}\n              {m.userId === currentUserId && m.paymentStatus === "pending"',
  '                  </div>\n                </div>\n              )}\n              {m.userId === currentUserId && m.paymentStatus === "pending"'
);

fs.writeFileSync(file, src);
console.log('✓ Fixed');
