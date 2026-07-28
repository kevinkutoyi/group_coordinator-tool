const fs = require('fs');
const file = 'frontend/src/App.js';
let src = fs.readFileSync(file, 'utf8');
let ok = true;

// 1. Add imports
const importAnchor = `import UnsubscribePage from "./pages/UnsubscribePage";`;
const importReplacement = `import UnsubscribePage from "./pages/UnsubscribePage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";`;

if (src.includes(importAnchor) && !src.includes('import BlogPage')) {
  src = src.replace(importAnchor, importReplacement);
  console.log('✓ Imports added');
} else if (src.includes('import BlogPage')) {
  console.log('⚠ Imports already present');
} else {
  console.log('⚠ import anchor not found'); ok = false;
}

// 2. Add "blog" to SIMPLE_PAGES
const simpleAnchor = `const SIMPLE_PAGES = [
  "home", "groups", "create", "signup", "login", "admin-login", "blog-editor", "forgot-password",
  "admin", "earnings", "my-groups", "mod-dash", "mod-settings",
  "payment-callback", "unsubscribe",
];`;
const simpleReplacement = `const SIMPLE_PAGES = [
  "home", "groups", "create", "signup", "login", "admin-login", "blog-editor", "forgot-password",
  "admin", "earnings", "my-groups", "mod-dash", "mod-settings",
  "payment-callback", "unsubscribe", "blog",
];`;

if (src.includes(simpleAnchor)) {
  src = src.replace(simpleAnchor, simpleReplacement);
  console.log('✓ "blog" added to SIMPLE_PAGES');
} else if (src.includes('"unsubscribe", "blog",')) {
  console.log('⚠ SIMPLE_PAGES already updated');
} else {
  console.log('⚠ SIMPLE_PAGES anchor not found'); ok = false;
}

// 3. Add /blog/:slug regex to pathToPage (right after the group-emails match)
const geAnchor = `  const ge = pathname.match(/^\\/group-emails\\/([^/]+)\\/?$/);
  if (ge) {
    const idMatch = ge[1].match(UUID_RE);
    return { page: "group-emails", param: idMatch ? idMatch[1] : ge[1] };
  }`;
const geReplacement = `  const ge = pathname.match(/^\\/group-emails\\/([^/]+)\\/?$/);
  if (ge) {
    const idMatch = ge[1].match(UUID_RE);
    return { page: "group-emails", param: idMatch ? idMatch[1] : ge[1] };
  }

  const bp = pathname.match(/^\\/blog\\/([^/]+)\\/?$/);
  if (bp) return { page: "blog-post", param: bp[1] };`;

if (src.includes(geAnchor)) {
  src = src.replace(geAnchor, geReplacement);
  console.log('✓ /blog/:slug pattern added to pathToPage');
} else if (src.includes('const bp = pathname.match')) {
  console.log('⚠ Blog post pattern already present');
} else {
  console.log('⚠ group-emails anchor not found'); ok = false;
}

// 4. Add pageToPath case for "blog-post"
const pathAnchor = `  if (target === "group-emails")  return \`/group-emails/\${param || ""}\`;`;
const pathReplacement = `  if (target === "group-emails")  return \`/group-emails/\${param || ""}\`;
  if (target === "blog-post")     return \`/blog/\${param || ""}\`;`;

if (src.includes(pathAnchor)) {
  src = src.replace(pathAnchor, pathReplacement);
  console.log('✓ pageToPath case for blog-post added');
} else if (src.includes('if (target === "blog-post")')) {
  console.log('⚠ pageToPath case already present');
} else {
  console.log('⚠ pageToPath anchor not found'); ok = false;
}

// 5. Render the two new pages, right next to the group render line
const renderAnchor = `        {page === "group"            && <GroupDetailPage      id={pageParam}      navigate={navigate} user={user} />}`;
const renderReplacement = `        {page === "group"            && <GroupDetailPage      id={pageParam}      navigate={navigate} user={user} />}
        {page === "blog"             && <BlogPage                                 navigate={navigate} />}
        {page === "blog-post"        && <BlogPostPage           id={pageParam}      navigate={navigate} />}`;

if (src.includes(renderAnchor)) {
  src = src.replace(renderAnchor, renderReplacement);
  console.log('✓ Render lines added for blog pages');
} else if (src.includes('page === "blog-post"')) {
  console.log('⚠ Render lines already present');
} else {
  console.log('⚠ render anchor not found'); ok = false;
}

fs.writeFileSync(file, src);
console.log(ok ? '\n✅ All patches applied, file written' : '\n⚠ Partial changes written — review before deploying');
