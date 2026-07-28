const fs = require('fs');
const file = 'backend/src/server.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const idx = lines.findIndex(l => l.includes('app.get("/api/groups"'));
if (idx === -1) {
  console.log('⚠ Anchor not found — aborting');
  process.exit(1);
}

const route = [
`function urlSlugify(text) {`,
`  return String(text || "")`,
`    .toLowerCase()`,
`    .replace(/[^a-z0-9]+/g, "-")`,
`    .replace(/^-+|-+$/g, "")`,
`    .slice(0, 60);`,
`}`,
``,
`app.get("/sitemap.xml", async (req, res) => {`,
`  try {`,
`    const base = "https://splitsubs.com";`,
`    const urls = [`,
`      { loc: base + "/", changefreq: "daily", priority: "1.0" },`,
`      { loc: base + "/groups", changefreq: "hourly", priority: "0.9" },`,
`      { loc: base + "/blog", changefreq: "daily", priority: "0.7" },`,
`    ];`,
``,
`    const groups = await prisma.group.findMany({`,
`      where: { reviewStatus: "approved", status: { in: ["open", "full"] } },`,
`      select: { id: true, serviceName: true, planName: true, updatedAt: true },`,
`    });`,
`    for (const g of groups) {`,
`      const slug = urlSlugify(g.serviceName + " " + g.planName);`,
`      urls.push({`,
`        loc: base + "/group/" + (slug ? slug + "-" : "") + g.id,`,
`        changefreq: "daily",`,
`        priority: "0.8",`,
`        lastmod: g.updatedAt ? new Date(g.updatedAt).toISOString().split("T")[0] : undefined,`,
`      });`,
`    }`,
``,
`    const posts = await prisma.blogPost.findMany({`,
`      where: { status: "published", reviewStatus: "approved", noIndex: { not: true } },`,
`      select: { slug: true, updatedAt: true, publishedAt: true },`,
`    });`,
`    for (const p of posts) {`,
`      urls.push({`,
`        loc: base + "/blog/" + p.slug,`,
`        changefreq: "weekly",`,
`        priority: "0.6",`,
`        lastmod: (p.updatedAt || p.publishedAt) ? new Date(p.updatedAt || p.publishedAt).toISOString().split("T")[0] : undefined,`,
`      });`,
`    }`,
``,
`    const xml = \`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\` +`,
`      urls.map(u => \`  <url>\n    <loc>\${u.loc}</loc>\n\` +`,
`        (u.lastmod ? \`    <lastmod>\${u.lastmod}</lastmod>\n\` : "") +`,
`        \`    <changefreq>\${u.changefreq}</changefreq>\n    <priority>\${u.priority}</priority>\n  </url>\`).join("\\n") +`,
`      \`\n</urlset>\`;`,
``,
`    res.set("Content-Type", "application/xml");`,
`    res.send(xml);`,
`  } catch (err) {`,
`    console.error("[SITEMAP] Error:", err.message);`,
`    res.status(500).send("Error generating sitemap");`,
`  }`,
`});`,
``,
];

lines.splice(idx, 0, ...route);
fs.writeFileSync(file, lines.join('\n'));
console.log('✓ /sitemap.xml route added, ' + route.length + ' lines inserted');
