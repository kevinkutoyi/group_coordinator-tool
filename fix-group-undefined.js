const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Fix useState that references group before it's loaded
src = src.replace(
  'const [inboundEmailInput, setInboundEmailInput] = useState(group?.inboundEmail || "");',
  'const [inboundEmailInput, setInboundEmailInput] = useState("");'
);

// Add useEffect to sync inboundEmailInput when group loads
src = src.replace(
  'async function fetchOtp() {',
  `useEffect(() => {
    if (group?.inboundEmail) setInboundEmailInput(group.inboundEmail);
  }, [group?.inboundEmail]);

  async function fetchOtp() {`
);

fs.writeFileSync(file, src);
console.log('✓ Fixed group undefined error');
