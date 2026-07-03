const fs = require('fs');
const file = 'frontend/src/components/GroupCard.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('gc-price-block'));
let depth = 0;
let endIdx = startIdx;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('<div')) depth++;
  if (lines[i].includes('</div>')) depth--;
  if (depth === 0 && i > startIdx) { endIdx = i; break; }
}

const newBlock = [
  '        <div className="gc-price-block">',
  '          <div style={{ marginBottom: 8 }}>',
  '            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>',
  '              <span style={{ color: "var(--accent)" }}>USD {group.pricePerSlot}</span>',
  '              <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--muted)", margin: "0 8px" }}>·</span>',
  '              <span style={{ color: "var(--accent2)" }}>KES {Math.round(group.pricePerSlot * KES_RATE)}</span>',
  '            </div>',
  '            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 3 }}>',
  '              per {group.billingCycle === "monthly" ? "month" : "period"} per slot',
  '            </div>',
  '          </div>',
  '          <div className="gc-price-meta">',
  '            <span className="gc-full-price">${group.totalPrice}/mo full plan</span>',
  '            <span className="gc-save-badge">Save ${(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>',
  '          </div>',
  '        </div>',
];

lines.splice(startIdx, endIdx - startIdx + 1, ...newBlock);
fs.writeFileSync(file, lines.join('\n'));
console.log('✓ Price block replaced');