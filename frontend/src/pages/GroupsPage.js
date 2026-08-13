import React, { useEffect, useState } from "react";
import GroupCard from "../components/GroupCard";
import { api, session } from "../api";
import { slugify } from "../slugify";
import { ALL_LISTINGS, CATEGORY_ORDER, CATEGORY_ICON, CATEGORY_SHORT_LABEL } from "../categories";
import "./GroupsPage.css";

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
    // Jump back to the top of the results pane, not the whole page — the
    // sidebar stays put so this is a short hop, not a full re-scroll.
    document.getElementById("gp-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const activeCatData = categories.find(c => c.name === activeCategory);

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
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, marginBottom:20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Browse Groups</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>Pick a category to see open slots</p>
        </div>
        {canCreate
          ? <button className="btn btn-primary" onClick={() => navigate("create")}>+ Create Group</button>
          : !session.isLoggedIn() && (
            <button className="btn btn-outline" onClick={() => navigate("signup")}>Sign Up to Join</button>
          )
        }
      </div>

      {/* ── Category rail (left) + results (right) ── */}
      <div className="gp-layout">
        {!loading && categories.length > 0 && (
          <aside className="gp-sidebar" aria-label="Categories">
            <div className="gp-sidebar-title">Categories</div>
            <div className="gp-rail">
              {categories.map(cat => {
                const active = activeCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    className={`gp-rail-item ${active ? "active" : ""}`}
                    onClick={() => selectCategory(cat.name)}
                    title={cat.name}
                  >
                    <span className="gp-rail-icon">{CATEGORY_ICON[cat.name] || "📦"}</span>
                    <span className="gp-rail-label">{CATEGORY_SHORT_LABEL[cat.name] || cat.name}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        <div className="gp-main" id="gp-main">
          {loading ? (
            <div style={{ textAlign:"center", padding:60 }}><span className="spinner"/></div>
          ) : activeCategory === null ? (
            <div className="empty-state">
              <div className="emoji">🗂️</div>
              <h3>Choose a category to get started</h3>
              <p>Pick "{ALL_LISTINGS}" to see everything, or a category on the left.</p>
            </div>
          ) : (
            <>
              <div className="gp-main-head">
                <h2 className="gp-active-title">
                  <span>{CATEGORY_ICON[activeCategory] || "📦"}</span> {activeCategory}
                </h2>
                {activeCatData && activeCatData.services.length > 0 && (
                  <div className="gp-chip-row">
                    {activeCatData.services.slice(0, 6).map(s => (
                      <span key={s.id} className="gp-chip" title={s.name}>
                        <span>{s.icon}</span>{s.name}
                      </span>
                    ))}
                    {activeCatData.services.length > 6 && (
                      <span className="gp-chip-more">+{activeCatData.services.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24, alignItems:"center" }}>
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
      </div>
    </div>
  );
}
