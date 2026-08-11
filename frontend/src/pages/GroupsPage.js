import React, { useEffect, useState } from "react";
import GroupCard from "../components/GroupCard";
import { api, session } from "../api";
import { slugify } from "../slugify";

// Fixed display order for category cards — matches the `category` field set
// on each entry in the backend SERVICES catalog (server.js). "All Listings"
// is a synthetic first category, not a real value in the catalog.
const ALL_LISTINGS = "All Listings";
const CATEGORY_ORDER = [
  ALL_LISTINGS,
  "Streaming & Entertainment",
  "AI & Productivity",
  "Social Media Accounts",
  "Design & Creativity",
  "VPNs & Proxies",
  "E-books and Manuals",
  "Tech Help & Services",
];
const CATEGORY_ICON = {
  [ALL_LISTINGS]: "🗂️",
  "Streaming & Entertainment": "🎬",
  "AI & Productivity": "🤖",
  "Social Media Accounts": "👥",
  "Design & Creativity": "🎨",
  "VPNs & Proxies": "🛡️",
  "E-books and Manuals": "📚",
  "Tech Help & Services": "🛠️",
};
// URL slug -> category name, e.g. "streaming-entertainment" -> "Streaming &
// Entertainment" — gives every category its own crawlable /groups/:slug URL
// instead of client-only filter state, for SEO / Search Console indexing.
const CATEGORY_SLUG_TO_NAME = Object.fromEntries(CATEGORY_ORDER.map(name => [slugify(name), name]));

export default function GroupsPage({ navigate, categoryParam }) {
  const [groups, setGroups]     = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  // Source of truth is the URL (categoryParam) — this just mirrors it locally.
  const [activeCategory, setActiveCategory] = useState(
    () => CATEGORY_SLUG_TO_NAME[categoryParam?.category] || null
  );

  useEffect(() => {
    Promise.all([api.getGroups(), api.getServices()])
      .then(([g, s]) => { setGroups(g); setServices(s); })
      .catch(() => alert("Could not load groups. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  // Stay in sync with the URL — browser back/forward, or a category link
  // clicked elsewhere in the app, both change categoryParam without this
  // component remounting.
  useEffect(() => {
    setActiveCategory(CATEGORY_SLUG_TO_NAME[categoryParam?.category] || null);
  }, [categoryParam?.category]);

  // SEO — distinct title/description/canonical per category page.
  useEffect(() => {
    document.title = activeCategory
      ? `${activeCategory} — Browse Groups | SplitSubs`
      : "Browse Groups | SplitSubs";

    const desc = activeCategory && activeCategory !== ALL_LISTINGS
      ? `Split the cost of ${activeCategory.toLowerCase()} subscriptions with a trusted group on SplitSubs. Browse open slots and join today.`
      : "Browse group-buy subscription listings on SplitSubs — split the cost of streaming, AI tools, VPNs, design software and more with trusted group members.";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `https://splitsubs.com/groups${activeCategory ? `/${slugify(activeCategory)}` : ""}`);
  }, [activeCategory]);

  const canCreate = ["moderator","superadmin"].includes(session.getRole());

  function selectCategory(name) {
    navigate("groups", { category: slugify(name) });
  }
  function clearCategory() {
    navigate("groups");
  }

  // Group the services catalog into categories, preserving CATEGORY_ORDER.
  // "All Listings" shows a sample pulled from across every category instead
  // of a single category's services.
  const categories = CATEGORY_ORDER
    .map(name => ({
      name,
      services: name === ALL_LISTINGS ? services : services.filter(s => s.category === name),
    }))
    .filter(c => c.name === ALL_LISTINGS || c.services.length > 0);

  const serviceCategory = Object.fromEntries(services.map(s => [s.id, s.category]));

  const filtered = activeCategory === null ? [] : groups.filter(g => {
    // Customers and guests only see approved groups
    const role = session.getRole();
    if (role !== "superadmin" && role !== "moderator" && g.reviewStatus !== "approved") return false;
    const matchFilter   = filter === "all" || g.status === filter;
    const matchCategory = activeCategory === ALL_LISTINGS || serviceCategory[g.serviceId] === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = (g.serviceName||"").toLowerCase().includes(q) ||
      (g.planName||"").toLowerCase().includes(q) ||
      (g.organizerName||"").toLowerCase().includes(q);
    return matchFilter && matchCategory && matchSearch;
  });

  return (
    <div className="fade-in">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, marginBottom:28 }}>
        <div>
          <h1 className="page-title">Browse Groups</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>Pick a category to see open slots</p>
        </div>
        {canCreate
          ? <button className="btn btn-primary" onClick={() => navigate("create")}>+ Create Group</button>
          : !session.isLoggedIn() && (
            <button className="btn btn-outline" onClick={() => navigate("signup")}>Sign Up to Join</button>
          )
        }
      </div>

      {/* ── Browse by category ── */}
      {!loading && categories.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <h2 style={{ fontSize:"1rem", fontWeight:700, color:"var(--text)", margin:0 }}>Browse by Category</h2>
            {activeCategory && (
              <button className="btn btn-sm btn-outline" onClick={clearCategory}>
                ✕ Clear category
              </button>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>
            {categories.map(cat => {
              const active = activeCategory === cat.name;
              return (
                <div
                  key={cat.name}
                  className="card"
                  onClick={() => selectCategory(cat.name)}
                  style={{
                    cursor:"pointer", padding:"16px 18px",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: active ? "rgba(124,106,255,0.08)" : "var(--card)",
                    transition:"border-color 0.2s, background 0.2s",
                  }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:"1.4rem" }}>{CATEGORY_ICON[cat.name] || "📦"}</span>
                    <span style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--text)" }}>{cat.name}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    {cat.services.slice(0, 4).map(s => (
                      <span key={s.id} title={s.name} style={{
                        display:"inline-flex", alignItems:"center", gap:4,
                        background:"var(--bg3)", border:"1px solid var(--border)",
                        borderRadius:99, padding:"3px 9px", fontSize:"0.72rem", color:"var(--muted)",
                      }}>
                        <span>{s.icon}</span>{s.name}
                      </span>
                    ))}
                    {cat.services.length > 4 && (
                      <span style={{ fontSize:"0.72rem", color:"var(--muted)" }}>+{cat.services.length - 4} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:"center", padding:60 }}><span className="spinner"/></div>
      ) : activeCategory === null ? (
        <div className="empty-state">
          <div className="emoji">🗂️</div>
          <h3>Choose a category to get started</h3>
          <p>Pick "{ALL_LISTINGS}" to see everything, or a specific category above.</p>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:28, alignItems:"center" }}>
            <input
              placeholder="Search by service, plan, organizer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth:300 }}
            />
            {["all","open","full","closed"].map(f => (
              <button key={f}
                className={`btn btn-sm ${filter===f ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
            <span style={{ fontSize:"0.8rem", color:"var(--muted)" }}>
              Showing <strong style={{ color:"var(--text)" }}>{activeCategory}</strong>
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="emoji">🔍</div>
              <h3>No groups found</h3>
              <p>{activeCategory === ALL_LISTINGS ? "Try a different filter, or check back soon for new groups." : `No groups in ${activeCategory} yet — check back soon.`}</p>
            </div>
          ) : (
            <div className="grid-2">
              {filtered.map(g => (
                <GroupCard key={g.id} group={g} onClick={() => navigate("group", { id: g.id, slug: `${g.serviceName} ${g.planName}` })} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
