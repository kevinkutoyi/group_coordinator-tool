const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

const anchor = `  useEffect(() => {
    reload().finally(() => setLoading(false));
    loadCreds();
  }, [id]);`;

const replacement = `  useEffect(() => {
    reload().finally(() => setLoading(false));
    loadCreds();
  }, [id]);

  useEffect(() => {
    if (!group) return;
    const title = \`\${group.serviceName} \${group.planName} — Split the Cost | SplitSubs\`;
    document.title = title;

    const desc = \`Split \${group.serviceName} \${group.planName} with a trusted group. Pay \$\${group.memberPays || group.pricePerSlot}/mo instead of the full price. \${group.maxSlots} slots total.\`;
    let meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", \`https://splitsubs.com/group/\${id}\`);

    let ld = document.getElementById("ld-product");
    if (!ld) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "ld-product";
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Service",
      name: \`\${group.serviceName} \${group.planName} — Shared Subscription Slot\`,
      description: desc,
      provider: { "@type": "Organization", name: "SplitSubs", url: "https://splitsubs.com" },
      offers: {
        "@type": "Offer",
        price: group.memberPays || group.pricePerSlot,
        priceCurrency: "USD",
        availability: group.status === "open" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        url: \`https://splitsubs.com/group/\${id}\`,
      },
    });

    return () => {
      const el = document.getElementById("ld-product");
      if (el) el.remove();
    };
  }, [group, id]);`;

if (src.includes(anchor)) {
  src = src.replace(anchor, replacement);
  fs.writeFileSync(file, src);
  console.log('✓ Product/Service JSON-LD + meta tags added to GroupDetailPage');
} else {
  console.log('⚠ Anchor not found — no changes made');
}
