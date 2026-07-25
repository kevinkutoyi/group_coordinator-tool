const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

const bad = `          )}
        </div>
      )}
      </div>
      {creds.generalNote && (`;

const good = `          )}
        </div>
      )}
      {creds.generalNote && (`;

if (src.includes(bad)) {
  src = src.replace(bad, good);
  fs.writeFileSync(file, src);
  console.log('✓ Duplicate closing div removed');
} else {
  console.log('⚠ Exact pattern not found — needs manual check');
}
