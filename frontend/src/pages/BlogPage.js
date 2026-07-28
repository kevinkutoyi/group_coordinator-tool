import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function BlogPage({ navigate }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    document.title = "Blog — SplitSubs";
    let meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Guides and tips on splitting subscription costs for Netflix, Spotify, YouTube Premium and more.");
    api.getBlogPosts().then(setPosts).catch(() => setPosts([]));
  }, []);

  if (posts === null) {
    return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>
      <h1 className="page-title" style={{ marginBottom: 8 }}>📝 Blog</h1>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>Guides and tips on splitting subscription costs.</p>

      {posts.length === 0 ? (
        <div className="empty-state"><div className="emoji">📝</div><h3>No posts yet</h3></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {posts.map(p => (
            <a
              key={p.id}
              href={`/blog/${p.slug}`}
              onClick={e => { e.preventDefault(); navigate("blog-post", p.slug); }}
              className="card"
              style={{ display: "flex", gap: 16, padding: 20, textDecoration: "none", color: "inherit", cursor: "pointer" }}
            >
              {p.coverImage && (
                <img src={p.coverImage} alt={p.coverImageAlt || p.title} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
              )}
              <div>
                <h2 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>{p.title}</h2>
                {p.excerpt && <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 8px" }}>{p.excerpt}</p>}
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  {p.authorName} · {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
