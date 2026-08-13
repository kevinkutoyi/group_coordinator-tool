// Shared category catalog — single source of truth for category name/order/
// icon, used by both the Browse Groups page (GroupsPage.js) and the Create
// Group form (CreateGroupPage.js) so the two stay in sync. Matches the
// `category` field set on each entry in the backend SERVICES catalog
// (server.js). "All Listings" is a synthetic browsing category, not a real
// value in the catalog — it's excluded from CATEGORY_ORDER via REAL_CATEGORIES.

export const ALL_LISTINGS = "All Listings";

export const CATEGORY_ORDER = [
  ALL_LISTINGS,
  "Streaming & Entertainment",
  "AI & Productivity",
  "Social Media Accounts",
  "Design & Creativity",
  "Security, VPNs & Proxies",
  "E-books and Manuals",
  "Tech Help & Services",
];

// Real, selectable categories — excludes the synthetic "All Listings" entry.
export const REAL_CATEGORIES = CATEGORY_ORDER.filter(c => c !== ALL_LISTINGS);

export const CATEGORY_ICON = {
  [ALL_LISTINGS]: "🗂️",
  "Streaming & Entertainment": "🎬",
  "AI & Productivity": "🤖",
  "Social Media Accounts": "👥",
  "Design & Creativity": "🎨",
  "Security, VPNs & Proxies": "🛡️",
  "E-books and Manuals": "📚",
  "Tech Help & Services": "🛠️",
};

// Short, quick-scan labels for the compact category rail (GroupsPage.js
// sidebar) — display-only. The full names above remain the canonical values
// used for filtering, page titles, meta descriptions, and URL slugs, so
// nothing here affects SEO or already-indexed /groups/:slug URLs.
export const CATEGORY_SHORT_LABEL = {
  [ALL_LISTINGS]: "All",
  "Streaming & Entertainment": "Streaming",
  "AI & Productivity": "AI Tools",
  "Social Media Accounts": "Social Accounts",
  "Design & Creativity": "Design Tools",
  "Security, VPNs & Proxies": "Security & VPNs",
  "E-books and Manuals": "E-books & Manuals",
  "Tech Help & Services": "Technical Services",
};
