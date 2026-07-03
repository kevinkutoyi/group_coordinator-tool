const fs = require('fs');
const file = 'frontend/src/components/GroupCard.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the gc-price-block and replace it entirely
const startIdx = lines.findIndex(l => l.includes('gc-price-block'));

// Find the closing </div> of the price block
let depth = 0;
let endIdx = startIdx;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('<div')) depth++;
  if (lines[i].includes('</div>')) depth--;
  if (depth === 0 && i > startIdx) { endIdx = i; break; }
}

console.log('Replacing lines', startIdx, 'to', endIdx);
console.log('Old block:');
lines.slice(startIdx, endIdx + 1).forEach((l, i) => console.log(startIdx + i, l));

const newBlock = [
  '        <div className="gc-price-block">',
  '          <div className="gc-price-main">',
  '            <span className="gc-currency">$</span>',
  '            <span className="gc-amount">{group.pricePerSlot}</span>',
  '            <span className="gc-price-sub">/{group.billingCycle === "monthly" ? "mo" : "period"}</span>',
  '          </div>',
  '          <div style={{ fontSize: "0.76rem", marginTop: 3, marginBottom: 4 }}>',
  '            <span style={{ color: "var(--text)", fontWeight: 600 }}>USD {group.pricePerSlot}</span>',
  '            <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>',
  '            <span style={{ color: "var(--accent)", fontWeight: 600 }}>KES {Math.round(group.pricePerSlot * KES_RATE)}</span>',
  '            <span style={{ color: "var(--muted)" }}> / {group.billingCycle === "monthly" ? "mo" : "period"}</span>',
  '          </div>',
  '          <div className="gc-price-meta">',
  '            <span className="gc-full-price">${group.totalPrice}/mo full plan</span>',
  '            <span className="gc-save-badge">Save ${(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>',
  '          </div>',
  '        </div>',
];

lines.splice(startIdx, endIdx - startIdx + 1, ...newBlock);
fs.writeFileSync(file, lines.join('\n'));
console.log('\n✓ Price block replaced');