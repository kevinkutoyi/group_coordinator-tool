// Shared URL-slug helper — used for group detail URLs (/group/:slug-:id)
// and category URLs (/groups/:categorySlug).
export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
