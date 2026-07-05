const fs = require('fs');
const file = 'backend/src/server.js';
let src = fs.readFileSync(file, 'utf8');

const oldData = `    data: {
      expiresAt:            newExpiry,
      expiryAdjustmentDays: (member.expiryAdjustmentDays || 0) + days,
      expiryAdjustedAt:     new Date(),
      expiryAdjustedNote:   note || null,
    },`;

const newData = `    data: {
      expiresAt:            newExpiry,
      expiryAdjustmentDays: (member.expiryAdjustmentDays || 0) + days,
      expiryAdjustedAt:     new Date(),
      expiryAdjustedNote:   note || null,
      paymentStatus:        newExpiry <= new Date() ? "expired" : "confirmed",
    },`;

if (src.includes(oldData)) {
  src = src.replace(oldData, newData);
  fs.writeFileSync(file, src);
  console.log('✓ paymentStatus auto-updated on expiry adjustment');
} else {
  console.log('⚠ Pattern not found');
  const idx = src.indexOf('expiryAdjustmentDays: (member.expiryAdjustmentDays');
  console.log('Context:', src.substring(idx - 20, idx + 200));
}
