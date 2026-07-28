const fs = require('fs');
const file = 'frontend/public/index.html';
let src = fs.readFileSync(file, 'utf8');

const anchor = `    <meta charset="utf-8" />
<meta name="facebook-domain-verification" content="qgrvg0nz5e7t3dm7h14yh8u7ueoswq" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SplitSubs — Group Buy Coordination</title>`;

const replacement = `    <meta charset="utf-8" />
<meta name="facebook-domain-verification" content="qgrvg0nz5e7t3dm7h14yh8u7ueoswq" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SplitSubs — Split Netflix, Spotify & Subscription Costs</title>
    <meta name="description" content="Split the cost of Netflix, Spotify, YouTube Premium and more with trusted group members. Join or create a subscription group, pay your share securely, and save up to 80% every month." />
    <link rel="canonical" href="https://splitsubs.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SplitSubs" />
    <meta property="og:title" content="SplitSubs — Split Netflix, Spotify & Subscription Costs" />
    <meta property="og:description" content="Split the cost of Netflix, Spotify, YouTube Premium and more with trusted group members. Save up to 80% every month." />
    <meta property="og:url" content="https://splitsubs.com/" />
    <meta property="og:image" content="https://splitsubs.com/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SplitSubs — Split Netflix, Spotify & Subscription Costs" />
    <meta name="twitter:description" content="Split the cost of Netflix, Spotify, YouTube Premium and more with trusted group members." />`;

if (src.includes(anchor)) {
  src = src.replace(anchor, replacement);
  fs.writeFileSync(file, src);
  console.log('✓ index.html updated with meta description + Open Graph tags');
} else {
  console.log('⚠ Anchor not found');
}
