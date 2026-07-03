const fs = require('fs');

// Update GroupDetailPage — show KES amount on pay button
let gdp = fs.readFileSync('frontend/src/pages/GroupDetailPage.js', 'utf8');

// Add KES display on the pay button
gdp = gdp.replace(
  `{payingId === m.id ? <><span className="spinner" /> Redirecting…</> : "🔒 Pay Now"}`,
  `{payingId === m.id ? <><span className="spinner" /> Redirecting…</> : \`🔒 Pay Now — KES \${Math.round((m.memberPays || group.pricePerSlot) * 130)}\`}`
);

fs.writeFileSync('frontend/src/pages/GroupDetailPage.js', gdp);
console.log('✓ KES amount shown on pay button');

// Update MyGroupsPage pay button too
let myg = fs.readFileSync('frontend/src/pages/MyGroupsPage.js', 'utf8');
myg = myg.replace(
  `"🔒 Complete Payment →"`,
  `"🔒 Pay Now — KES " + Math.round((m.memberPays || 0) * 130)`
);
fs.writeFileSync('frontend/src/pages/MyGroupsPage.js', myg);
console.log('✓ KES amount shown on MyGroupsPage');

console.log('\n✅ Done!');
