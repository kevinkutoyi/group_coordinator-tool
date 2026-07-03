const fs = require('fs');
const file = 'frontend/src/pages/PaymentCallbackPage.js';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'const { reference, groupId: gid } = p;',
  'const { reference, groupId: gid, memberId } = p;'
);

src = src.replace(
  'api.verifyPay(reference)',
  'api.verifyPay(reference, memberId, gid)'
);

fs.writeFileSync(file, src);
console.log('✓ memberId extracted and passed to verifyPay');

// Also update api.js to pass memberId and groupId
const apiFile = 'frontend/src/api.js';
let api = fs.readFileSync(apiFile, 'utf8');

api = api.replace(
  'verifyPay:    (reference)  => req(`/paystack/verify?reference=${reference}`),',
  'verifyPay:    (reference, memberId, groupId) => req(`/paystack/verify?reference=${reference}${memberId ? "&memberId=" + memberId : ""}${groupId ? "&groupId=" + groupId : ""}`  ),'
);

fs.writeFileSync(apiFile, api);
console.log('✓ api.js updated to pass memberId and groupId');
