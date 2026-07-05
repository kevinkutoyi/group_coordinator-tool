const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let src = fs.readFileSync(file, 'utf8');

// Change Total Spent from USD to KES
src = src.replace(
  '{ label:"Total Spent", value: "$" + (profileData.totalSpent || 0).toFixed(2) },',
  '{ label:"Total Spent", value: "KES " + Math.round((profileData.totalSpent || 0) * 130).toLocaleString() },'
);

// Change subscription memberPays from USD to KES
src = src.replace(
  '{"$" + s.memberPays + "/mo"}',
  '{"KES " + Math.round(s.memberPays * 130) + "/mo"}'
);

fs.writeFileSync(file, src);
console.log('✓ Total spent and subscription prices converted to KES');
