const fs = require('fs');
const glob = require('path');

const edits = [
  {
    file: 'frontend/src/pages/PaymentCallbackPage.js',
    from: `navigate("group", groupId)`,
    to: `navigate("group", groupId)`, // no group object available here, leave as-is
    skip: true,
  },
  {
    file: 'frontend/src/pages/ModeratorDashboardPage.js',
    from: `onClick={() => navigate("group", g.id)}>View</button>`,
    to: `onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })}>View</button>`,
  },
  {
    file: 'frontend/src/pages/MyGroupsPage.js',
    from: `                      onClick={() => navigate("group", g.id)}>`,
    to: `                      onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })}>`,
  },
  {
    file: 'frontend/src/pages/MyGroupsPage.js',
    from: `onClick={e => { e.stopPropagation(); navigate("group", g.id); }}>`,
    to: `onClick={e => { e.stopPropagation(); navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` }); }}>`,
    all: true,
  },
  {
    file: 'frontend/src/pages/MyGroupsPage.js',
    from: `<div key={g.id} className="card" style={{ cursor: "pointer", padding: 20 }} onClick={() => navigate("group", g.id)}>`,
    to: `<div key={g.id} className="card" style={{ cursor: "pointer", padding: 20 }} onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })}>`,
  },
  {
    file: 'frontend/src/pages/AdminDashboardPage.js',
    from: `<div key={g.id} className="user-card card" style={{cursor:"pointer"}} onClick={() => navigate("group", g.id)}>`,
    to: `<div key={g.id} className="user-card card" style={{cursor:"pointer"}} onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })}>`,
  },
  {
    file: 'frontend/src/pages/AdminDashboardPage.js',
    from: `onClick={e => {e.stopPropagation(); navigate("group", g.id);}}>`,
    to: `onClick={e => {e.stopPropagation(); navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` });}}>`,
  },
  {
    file: 'frontend/src/pages/AdminDashboardPage.js',
    from: `                  onClick={() => navigate("group", g.id)}>`,
    to: `                  onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })}>`,
  },
  {
    file: 'frontend/src/pages/GroupsPage.js',
    from: `<GroupCard key={g.id} group={g} onClick={() => navigate("group", g.id)} />`,
    to: `<GroupCard key={g.id} group={g} onClick={() => navigate("group", { id: g.id, slug: \`\${g.serviceName} \${g.planName}\` })} />`,
  },
];

let successCount = 0, skipCount = 0, failCount = 0;
const fileCache = {};

for (const edit of edits) {
  if (edit.skip) { console.log('⏭  Skipped (no group object available):', edit.file); skipCount++; continue; }

  let src = fileCache[edit.file] || fs.readFileSync(edit.file, 'utf8');

  if (edit.all) {
    const count = src.split(edit.from).length - 1;
    if (count > 0) {
      src = src.split(edit.from).join(edit.to);
      console.log(`✓ Replaced ${count} occurrence(s) in ${edit.file}`);
      successCount += count;
    } else {
      console.log(`⚠ Pattern not found (all-mode) in ${edit.file}:`, edit.from.slice(0, 60));
      failCount++;
    }
  } else {
    if (src.includes(edit.from)) {
      src = src.replace(edit.from, edit.to);
      console.log(`✓ Updated ${edit.file}`);
      successCount++;
    } else {
      console.log(`⚠ Pattern not found in ${edit.file}:`, edit.from.slice(0, 60));
      failCount++;
    }
  }

  fileCache[edit.file] = src;
}

for (const [file, src] of Object.entries(fileCache)) {
  fs.writeFileSync(file, src);
}

console.log(`\n✅ Done. ${successCount} updated, ${skipCount} skipped, ${failCount} not found.`);
