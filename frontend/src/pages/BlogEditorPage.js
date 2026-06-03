import React, { useState, useEffect } from "react";
import { api, session } from "../api";

export default function BlogEditorPage({ navigate }) {
  const [form, setForm] = useState({
    title: "", metaTitle: "", metaDescription: "", excerpt: "",
    content: "# My new post\n\nWrite **markdown** here.",
    coverImage: "", coverImageAlt: "",
    category: "guides", tags: "",
    ogImage: "", noIndex: false, status: "draft", authorBio: "",
  });
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyById, setBusyById] = useState({});
  const [uploadingCover, setUploadingCover] = useState(false);
  const [msg, setMsg] = useState(null);
  const isAdmin = session.isSuperAdmin();

  useEffect(() => {
    if (!session.isModerator() && !isAdmin) { navigate("home"); return; }
    api.getMyBlogPosts().then(setPosts).catch(() => {});
  }, []);

  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value
  }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const created = await api.createBlogPost({
        ...form,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      });
      setMsg({
        type: "ok",
        text: created.reviewStatus === "pending"
          ? "Draft created. Awaiting admin approval."
          : "Saved! Use the buttons below to publish."
      });
      setPosts(p => [created, ...p]);
      setForm(f => ({ ...f, title: "", metaDescription: "", excerpt: "", content: "# New post\n\n" }));
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCoverUpload(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("image", f);
      const res = await fetch("/api/blog/upload-image", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.getToken() },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      setForm(f2 => ({ ...f2, coverImage: j.url }));
      setMsg({ type: "ok", text: "Uploaded " + j.name + " (" + (j.size / 1024).toFixed(0) + " KB)" });
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally {
      setUploadingCover(false);
    }
  }

  async function publish(id, slug) {
    setBusyById(b => ({ ...b, [id]: true }));
    try {
      const updated = await api.publishBlogPost(id);
      setPosts(ps => ps.map(x => x.id === id ? updated : x));
      setMsg({
        type: "ok",
        text: isAdmin ? "Published! Live at /blog/" + slug : "Submitted for admin review."
      });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusyById(b => ({ ...b, [id]: false }));
    }
  }

  async function unpublish(id) {
    setBusyById(b => ({ ...b, [id]: true }));
    try {
      const updated = await api.unpublishBlogPost(id);
      setPosts(ps => ps.map(x => x.id === id ? updated : x));
      setMsg({ type: "ok", text: "Unpublished — back to draft." });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusyById(b => ({ ...b, [id]: false }));
    }
  }

  async function remove(id, title) {
    if (!window.confirm('Delete "' + title + '"? This cannot be undone.')) return;
    try {
      await api.deleteBlogPost(id);
      setPosts(ps => ps.filter(x => x.id !== id));
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px" }}>
      <h1 className="page-title">📝 Blog Editor</h1>
      <p className="page-sub" style={{ marginBottom: 18 }}>
        {isAdmin ? "Posts go live immediately." : "Posts will be reviewed by admin before going live."}
      </p>

      {msg && (
        <div className={"msg-box " + (msg.type === "ok" ? "msg-ok" : "msg-err")} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 24, marginBottom: 32 }}>
        <div className="form-group">
          <label>Title * <span style={{ color: "var(--muted)", fontWeight: 400 }}>— H1 of the page</span></label>
          <input required value={form.title} onChange={set("title")} placeholder="How to Split a Spotify Family Plan in Kenya" maxLength={200} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Meta Title <span style={{ color: "var(--muted)", fontWeight: 400 }}>(SERP, optional)</span></label>
            <input value={form.metaTitle} onChange={set("metaTitle")} maxLength={70} />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={set("category")}>
              <option value="guides">Guides</option>
              <option value="savings">Savings Tips</option>
              <option value="security">Security</option>
              <option value="news">News</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Meta Description * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(155-160 chars)</span></label>
          <textarea required rows={2} value={form.metaDescription} onChange={set("metaDescription")} maxLength={200} />
          <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: "4px 2px 0" }}>
            {form.metaDescription.length}/160
          </p>
        </div>

        <div className="form-group">
          <label>Excerpt <span style={{ color: "var(--muted)", fontWeight: 400 }}>(card preview)</span></label>
          <textarea rows={2} value={form.excerpt} onChange={set("excerpt")} maxLength={300} />
        </div>

        <div className="form-group">
          <label>Cover Image <span style={{ color: "var(--muted)", fontWeight: 400 }}>(jpg, png, webp · max 8 MB)</span></label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleCoverUpload} />
          {uploadingCover && (
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 6 }}>
              <span className="spinner" /> Uploading…
            </p>
          )}
          {form.coverImage && (
            <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
              <img src={form.coverImage} alt="Cover preview" style={{ maxWidth: 280, maxHeight: 160, borderRadius: 8, border: "1px solid var(--border)" }} />
              <button type="button" onClick={() => setForm(f => ({ ...f, coverImage: "" }))} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer" }}>✕</button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Cover Alt Text <span style={{ color: "var(--muted)", fontWeight: 400 }}>(SEO + accessibility)</span></label>
          <input value={form.coverImageAlt} onChange={set("coverImageAlt")} placeholder="Spotify logo on a phone screen" />
        </div>

        <div className="form-group">
          <label>Content (Markdown) *</label>
          <textarea required rows={14} value={form.content} onChange={set("content")} style={{ fontFamily: "monospace", fontSize: "0.92rem" }} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Tags <span style={{ color: "var(--muted)", fontWeight: 400 }}>(comma-separated)</span></label>
            <input value={form.tags} onChange={set("tags")} placeholder="spotify, family-plan, kenya" />
          </div>
          <div className="form-group">
            <label>OG Image URL</label>
            <input type="url" value={form.ogImage} onChange={set("ogImage")} />
          </div>
        </div>

        <div className="form-group">
          <label>Author Bio</label>
          <textarea rows={2} value={form.authorBio} onChange={set("authorBio")} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "var(--muted)", marginBottom: 14 }}>
          <input type="checkbox" checked={form.noIndex} onChange={set("noIndex")} />
          <span>noindex (hide from search engines)</span>
        </label>

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? <><span className="spinner" /> Saving…</> : "💾 Save as Draft"}
        </button>
      </form>

      <h2 className="section-h2">Your Posts ({posts.length})</h2>
      {posts.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No posts yet.</p>
      ) : posts.map(p => {
        const statusColor = p.status === "published" ? "var(--success)" : p.status === "archived" ? "var(--muted)" : "var(--warning)";
        const reviewColor = p.reviewStatus === "approved" ? "var(--success)" : p.reviewStatus === "rejected" ? "var(--error)" : "var(--warning)";
        const isOwner = isAdmin || p.authorId === session.getUser()?.id;
        return (
          <div key={p.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {p.status === "published" ? (
                    <a href={"/blog/" + p.slug} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                      {p.title} ↗
                    </a>
                  ) : (
                    <span>{p.title}</span>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>
                  /blog/{p.slug} · {p.viewCount} views · {p.readingMinutes} min · by {p.authorName}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: statusColor, background: "var(--bg3)", border: "1px solid var(--border)", padding: "2px 9px", fontSize: "0.72rem", borderRadius: 6 }}>
                    {p.status === "published" ? "● Published" : p.status === "archived" ? "Archived" : "Draft"}
                  </span>
                  <span style={{ color: reviewColor, background: "var(--bg3)", border: "1px solid var(--border)", padding: "2px 9px", fontSize: "0.72rem", borderRadius: 6 }}>
                    {p.reviewStatus === "approved" ? "✓ Approved" : p.reviewStatus === "rejected" ? "✗ Rejected" : "⏳ Pending"}
                  </span>
                  {p.category && (
                    <span style={{ background: "var(--bg3)", padding: "2px 9px", fontSize: "0.72rem", borderRadius: 6, color: "var(--muted)" }}>
                      {p.category}
                    </span>
                  )}
                </div>
                {p.rejectionNote && (
                  <p style={{ fontSize: "0.78rem", color: "var(--error)", marginTop: 6 }}>Reason: {p.rejectionNote}</p>
                )}
              </div>
              {isOwner && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.status === "draft" && p.reviewStatus === "approved" && (
                    <button className="btn btn-sm btn-primary" disabled={busyById[p.id]} onClick={() => publish(p.id, p.slug)}>
                      {busyById[p.id] ? <span className="spinner" /> : (isAdmin ? "🚀 Publish" : "📤 Submit")}
                    </button>
                  )}
                  {p.status === "published" && isAdmin && (
                    <button className="btn btn-sm btn-outline" disabled={busyById[p.id]} onClick={() => unpublish(p.id)}>
                      {busyById[p.id] ? <span className="spinner" /> : "↩ Unpublish"}
                    </button>
                  )}
                  <a href={"/blog/" + p.slug} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">👁️ View</a>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(p.id, p.title)}>🗑️</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
