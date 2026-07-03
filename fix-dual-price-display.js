const fs = require('fs');

const file = 'frontend/src/components/GroupCard.js';
let src = fs.readFileSync(file, 'utf8');

if (!src.includes('KES {Math.round')) {
  const oldPriceMeta = `          <div className="gc-price-meta">
            <span className="gc-full-price">${'$'}{group.totalPrice}/mo full plan</span>
            <span className="gc-save-badge">Save ${'$'}{(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>
          </div>`;

  const newPriceMeta = `          <div className="gc-price-meta">
            <span className="gc-full-price">${'$'}{group.totalPrice}/mo full plan</span>
            <span className="gc-save-badge">Save ${'$'}{(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>
            KES {Math.round(group.pricePerSlot * KES_RATE)}/{group.billingCycle === "monthly" ? "mo" : "period"}
          </div>`;

  if (src.includes(oldPriceMeta.replace(/\$\{''\}/g, '$'))) {
    src = src.replace(
      `          <div className="gc-price-meta">\n            <span className="gc-full-price">$\{group.totalPrice}/mo full plan</span>\n            <span className="gc-save-badge">Save $\{(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>\n          </div>`,
      `          <div className="gc-price-meta">\n            <span className="gc-full-price">$\{group.totalPrice}/mo full plan</span>\n            <span className="gc-save-badge">Save $\{(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>\n          </div>\n          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>\n            KES {Math.round(group.pricePerSlot * KES_RATE)}/{group.billingCycle === "monthly" ? "mo" : "period"}\n          </div>`
    );
    fs.writeFileSync(file, src);
    console.log('✓ KES price added to GroupCard');
  } else {
    console.log('Pattern not found, trying line-based approach...');
    const lines = src.split('\n');
    const idx = lines.findIndex(l => l.includes('gc-price-meta') && l.includes('div'));
    const closeIdx = lines.findIndex((l, i) => i > idx && l.includes('</div>') && !l.includes('<span'));
    if (closeIdx !== -1) {
      lines.splice(closeIdx + 1, 0,
        `          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>`,
        `            KES {Math.round(group.pricePerSlot * KES_RATE)}/{group.billingCycle === "monthly" ? "mo" : "period"}`,
        `          </div>`
      );
      fs.writeFileSync(file, lines.join('\n'));
      console.log('✓ KES price added via line insertion');
    }
  }
} else {
  console.log('⚠ Already updated');
}