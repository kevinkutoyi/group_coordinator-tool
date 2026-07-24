const fs = require('fs');
const file = 'frontend/src/pages/CreateGroupPage.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find and remove the misplaced date picker block (lines inserted in wrong place)
const startIdx = lines.findIndex(l => l.includes('<div className="form-group" style={{ marginTop: 16 }}') && 
  lines[lines.indexOf(l) - 1]?.includes('<button'));

if (startIdx !== -1) {
  // Remove the 7 lines of the misplaced date picker
  let endIdx = startIdx;
  while (endIdx < lines.length && !lines[endIdx].includes('</div>') || endIdx === startIdx) endIdx++;
  // Find the closing </div> of the form-group
  let depth = 0;
  let closeIdx = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].includes('<div')) depth++;
    if (lines[i].includes('</div>')) depth--;
    if (depth === 0 && i > startIdx) { closeIdx = i; break; }
  }
  console.log('Removing misplaced block from line', startIdx, 'to', closeIdx);
  lines.splice(startIdx, closeIdx - startIdx + 1);
  console.log('✓ Misplaced block removed');
}

// Now find the correct place to insert - after billing cycle section closes
// Find end of billing-grid div
const billingGridIdx = lines.findIndex(l => l.includes('className="billing-grid"'));
let depth = 0;
let billingGridEnd = billingGridIdx;
for (let i = billingGridIdx; i < lines.length; i++) {
  if (lines[i].includes('<div')) depth++;
  if (lines[i].includes('</div>')) depth--;
  if (depth === 0 && i > billingGridIdx) { billingGridEnd = i; break; }
}

// Find the parent form-group that wraps billing-grid
let billingFormGroupEnd = billingGridEnd + 1;
while (billingFormGroupEnd < lines.length && !lines[billingFormGroupEnd].includes('</div>')) billingFormGroupEnd++;

console.log('Inserting after line:', billingFormGroupEnd);

lines.splice(billingFormGroupEnd + 1, 0,
  `            <div className="form-group" style={{ marginTop: 16 }}>`,
  `              <label>📅 Subscription Renew Date <span style={{ fontSize:"0.75rem", color:"var(--muted)", fontWeight:400 }}>(when you need to renew the actual plan)</span></label>`,
  `              <input type="date" value={form.renewDate}`,
  `                min={new Date().toISOString().split('T')[0]}`,
  `                onChange={set("renewDate")}`,
  `                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid var(--border)", background:"var(--bg2)", color:"var(--text)", fontSize:"0.9rem" }}`,
  `              />`,
  `              <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:4 }}>Admin will be notified 3 days before this date.</div>`,
  `            </div>`
);

fs.writeFileSync(file, lines.join('\n'));
console.log('✓ Date picker inserted in correct position');
