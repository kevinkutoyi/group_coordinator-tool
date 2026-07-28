import React, { useEffect, useState } from "react";
import { api } from "../api";

function setMeta(name, content, isProperty) {
  if (!content) return;
  const attr = isProperty ? "property" : "name";
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export default function BlogPostPage({ id: slug, navigate }) {
  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    setPost(null);
    api.getBlogPost(slug)
      .then(p => {
        if (!p || p.status !== "published") { setNotFound(true); return; }
        setPost(p);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const title = post.metaTitle || post.title;
    document.title = `${title} — SplitSubs`;
    setMeta("description", post.metaDescription || post.excerpt || "");
    setMeta("og:title", title, true);
    setMeta("og:description", post.metaDescription || post.excerpt || "", true);
    setMeta("og:type", "article", true);
    setMeta("og:url", `https://splitsubs.com/blog/${post.slug}`, true);
    if (post.ogImage || post.coverImage) setMeta("og:image", post.ogImage || post.coverImage, true);
    setMeta("twitter:title", title);
    setMeta("twitter:description", post.metaDescription || post.excerpt || "");

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", post.canonicalUrl || `https://splitsubs.com/blog/${post.slug}`);

    if (post.noIndex) setMeta("robots", "noindex, follow");
    else setMeta("robots", "index, follow");
  }, [post]);

  if (notFound) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div className="emoji" style={{ fontSize: "3rem" }}>🔍</div>
        <h2>Post not found</h2>
        <button className="btn btn-outline" onClick={() => navigate("blog")}>← Back to Blog</button>
      </div>
    );
  }

  if (!post) {
    return <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" /></div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>
      <button className="btn btn-sm btn-outline" onClick={() => navigate("blog")} style={{ marginBottom: 24 }}>← Back to Blog</button>

      {post.coverImage && (
        <img src={post.coverImage} alt={post.coverImageAlt || post.title} style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 14, marginBottom: 24 }} />
      )}

      <h1 style={{ fontSize: "1.9rem", marginBottom: 10 }}>{post.title}</h1>
      <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 28 }}>
        {post.authorName} · {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}
      </div>

      <div className="blog-content" style={{ fontSize: "1rem", lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: post.content }} />

      {post.tags?.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 32 }}>
          {post.tags.map(t => (
            <span key={t} className="tag" style={{ background: "var(--bg3)", color: "var(--muted)" }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
