const fs = require('fs');
const file = 'backend/src/paystack.js';
let src = fs.readFileSync(file, 'utf8');

// Change currency from USD to KES and convert amount accordingly
src = src.replace(
  `    email, amount: Math.round(amount * 100),
    reference, callback_url: callbackUrl,
    currency: "USD", metadata: metadata || {},`,
  `    email, amount: Math.round(amount * 130 * 100), // Convert USD to KES (1 USD = 130 KES), then to cents
    reference, callback_url: callbackUrl,
    currency: "KES", metadata: metadata || {},`
);

// Update verify to convert back from KES cents to USD
src = src.replace(
  `    amount:    result.data.amount / 100,`,
  `    amount:    result.data.amount / 100 / 130, // Convert from KES cents back to USD`
);

fs.writeFileSync(file, src);
console.log('✓ Currency changed to KES');
