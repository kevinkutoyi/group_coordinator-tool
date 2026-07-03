const fs = require('fs');
const files = [
  'frontend/src/pages/GroupDetailPage.js',
  'frontend/src/pages/MyGroupsPage.js',
  'frontend/src/components/CredentialVault.js',
];

files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8');

  // Replace payment-related text
  src = src.replace(/🔒 Pay via PesaPal/g, '🔒 Pay Now');
  src = src.replace(/Pay via PesaPal/g, 'Pay Now');
  src = src.replace(/pesapal-btn/g, 'pay-btn');
  src = src.replace(/Secured by PesaPal/g, 'Secure Payment');
  src = src.replace(/🔒 Secured by PesaPal/g, '🔒 Secure Payment');
  src = src.replace(/M-Pesa &nbsp;💳 Visa\/Mastercard &nbsp;🏦 Bank Transfer &nbsp;📲 Airtel Money/g, 'Visa · Mastercard · M-Pesa · Bank Transfer');
  src = src.replace(/Accepted: 📱 M-Pesa &nbsp;💳 Visa\/Mastercard &nbsp;🏦 Bank Transfer &nbsp;📲 Airtel Money/g, 'Accepted: Visa · Mastercard · M-Pesa · Bank Transfer');
  src = src.replace(/Complete Payment via PesaPal/g, 'Complete Payment');
  src = src.replace(/🔒 Pay via PesaPal →/g, '🔒 Pay Now →');
  src = src.replace(/Complete your payment above/g, 'Complete your payment above');

  fs.writeFileSync(file, src);
  console.log('✓ Updated:', file);
});

// Fix GroupDetailPage pesapal info card
let gdp = fs.readFileSync('frontend/src/pages/GroupDetailPage.js', 'utf8');
gdp = gdp.replace(
  `<div className="pesapal-logo">🔒 Secured by PesaPal</div>
            <p>Accepted: 📱 M-Pesa &nbsp;💳 Visa/Mastercard &nbsp;🏦 Bank Transfer &nbsp;📲 Airtel Money</p>`,
  `<div className="pesapal-logo">🔒 Secure Payment</div>
            <p>Accepted: Visa · Mastercard · M-Pesa · Bank Transfer</p>`
);
fs.writeFileSync('frontend/src/pages/GroupDetailPage.js', gdp);

console.log('\n✅ UI text updated');
