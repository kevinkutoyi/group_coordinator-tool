const fs = require('fs');
const file = 'frontend/src/App.js';
let src = fs.readFileSync(file, 'utf8');
let ok = true;

const routerAnchor = `function pathToPage(pathname, search) {
  const q = Object.fromEntries(new URLSearchParams(search || ""));

  if (!pathname || pathname === "/") return { page: "home", param: null };

  const g  = pathname.match(/^\\/group\\/([^/]+)\\/?$/);
  if (g)  return { page: "group", param: g[1] };

  const ge = pathname.match(/^\\/group-emails\\/([^/]+)\\/?$/);
  if (ge) return { page: "group-emails", param: ge[1] };

  const stripped = pathname.replace(/^\\/|\\/$/g, "");
  if (SIMPLE_PAGES.includes(stripped)) {
    const queryPages = ["payment-callback", "unsubscribe", "signup", "login"];
    return { page: stripped, param: queryPages.includes(stripped) ? q : null };
  }

  return { page: "home", param: null };
}

function pageToPath(target, param) {
  if (target === "home")          return "/";
  if (target === "group")         return \`/group/\${param || ""}\`;
  if (target === "group-emails")  return \`/group-emails/\${param || ""}\`;
  if (target === "unsubscribe" && param?.email) return \`/unsubscribe?email=\${encodeURIComponent(param.email)}\`;
  return \`/\${target}\`;
}`;

const routerReplacement = `export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function pathToPage(pathname, search) {
  const q = Object.fromEntries(new URLSearchParams(search || ""));

  if (!pathname || pathname === "/") return { page: "home", param: null };

  const g  = pathname.match(/^\\/group\\/([^/]+)\\/?$/);
  if (g)  {
    const idMatch = g[1].match(UUID_RE);
    return { page: "group", param: idMatch ? idMatch[1] : g[1] };
  }

  const ge = pathname.match(/^\\/group-emails\\/([^/]+)\\/?$/);
  if (ge) {
    const idMatch = ge[1].match(UUID_RE);
    return { page: "group-emails", param: idMatch ? idMatch[1] : ge[1] };
  }

  const stripped = pathname.replace(/^\\/|\\/$/g, "");
  if (SIMPLE_PAGES.includes(stripped)) {
    const queryPages = ["payment-callback", "unsubscribe", "signup", "login"];
    return { page: stripped, param: queryPages.includes(stripped) ? q : null };
  }

  return { page: "home", param: null };
}

function pageToPath(target, param) {
  if (target === "home")          return "/";
  if (target === "group") {
    if (param && typeof param === "object" && param.id) {
      const slug = slugify(param.slug);
      return slug ? \`/group/\${slug}-\${param.id}\` : \`/group/\${param.id}\`;
    }
    return \`/group/\${param || ""}\`;
  }
  if (target === "group-emails")  return \`/group-emails/\${param || ""}\`;
  if (target === "unsubscribe" && param?.email) return \`/unsubscribe?email=\${encodeURIComponent(param.email)}\`;
  return \`/\${target}\`;
}`;

if (src.includes(routerAnchor)) {
  src = src.replace(routerAnchor, routerReplacement);
  console.log('✓ Router (pathToPage/pageToPath) updated with slug support');
} else {
  console.log('⚠ Router anchor not found — no changes made');
  ok = false;
  process.exit(1);
}

const setParamAnchor = `    setPage(target);
    setParam(param);
    window.scrollTo({ top:0, behavior:"smooth" });
    window.history.pushState({}, "", pageToPath(target, param));`;

const setParamReplacement = `    setPage(target);
    setParam(target === "group" && param && typeof param === "object" && param.id ? param.id : param);
    window.scrollTo({ top:0, behavior:"smooth" });
    window.history.pushState({}, "", pageToPath(target, param));`;

if (src.includes(setParamAnchor)) {
  src = src.replace(setParamAnchor, setParamReplacement);
  console.log('✓ navigate() now unwraps slug object before storing internal param');
} else {
  console.log('⚠ setParam anchor not found — router changes saved but state unwrap NOT applied');
  ok = false;
}

fs.writeFileSync(file, src);
console.log(ok ? '\n✅ All patches applied, file written' : '\n⚠ Partial changes written — review before deploying');
