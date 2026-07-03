const fs = require('fs');
const file = 'frontend/src/pages/PaymentCallbackPage.js';
let src = fs.readFileSync(file, 'utf8');
src = src.replace('Checking with PesaPal, please wait…', 'Verifying your payment, please wait…');
fs.writeFileSync(file, src);
console.log('✓ Callback page text updated');
