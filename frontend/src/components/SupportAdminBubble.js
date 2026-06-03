import React, { useState, useEffect, useRef } from "react";
import { api, session } from "../api";

export default function SupportAdminBubble() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, top: 0, left: 0 });

  // Initialize panel position when first opened (top-right by default)
  useEffect(() => {
    if (open && pos === null && typeof window !== "undefined") {
      const panelW = 380, gutter = 24;
      const leftDefault = Math.max(gutter, window.innerWidth - panelW - gutter);
      setPos({ top: 80, left: leftDefault });
    }
  }, [open]);

  // Drag handlers
  useEffect(() => {
    if (!dragging) return;
    function onMove(e) {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = cx - dragRef.current.x;
      const dy = cy - dragRef.current.y;
      const panelW = 380;
      const panelH = Math.min(540, (typeof window !== "undefined" ? window.innerHeight - 110 : 540));
      const maxLeft = (typeof window !== "undefined" ? window.innerWidth - panelW : 1000);
      const maxTop  = (typeof window !== "undefined" ? window.innerHeight - 80 : 600);
      setPos({
        top:  Math.max(8, Math.min(maxTop,  dragRef.current.top  + dy)),
        left: Math.max(8, Math.min(maxLeft, dragRef.current.left + dx)),
      });
    }
    function onUp() { setDragging(false); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  function startDrag(e) {
    if (!pos) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { x: cx, y: cy, top: pos.top, left: pos.left };
    setDragging(true);
  }


  useEffect(() => {
    if (!session.isSuperAdmin()) return;
    api.adminHeartbeat();
    const hb = setInterval(api.adminHeartbeat, 30000);
    return () => clearInterval(hb);
  }, []);

  useEffect(() => {
    if (!session.isSuperAdmin()) return;
    const refresh = async () => {
      try { setThreads(await api.adminGetSupportThreads() || []); }
      catch {}
    };
    refresh();
    const i = setInterval(refresh, open && !selected ? 5000 : 15000);
    return () => clearInterval(i);
  }, [open, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const refresh = async () => {
      try {
        const t = await api.adminGetSupportThread(selected.id);
        if (!active) return;
        setSelected(t);
        setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 30);
      } catch {}
    };
    refresh();
    const i = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(i); };
  }, [selected?.id]);

  // click-outside: close panel when user clicks anywhere outside it
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!session.isSuperAdmin()) return null;

  const totalUnread = threads.reduce((acc, t) => acc + (t.unreadByAdmin || 0), 0);

  function fmtTime(ts) {
    if (!ts) return "";
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m";
    if (m < 1440) return Math.floor(m / 60) + "h";
    return Math.floor(m / 1440) + "d";
  }

  async function openThread(t) {
    try { setSelected(await api.adminGetSupportThread(t.id)); } catch {}
  }

  async function reply(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !selected) return;
    setSending(true);
    try {
      await api.adminReplySupport(selected.id, body);
      setDraft("");
      const t = await api.adminGetSupportThread(selected.id);
      setSelected(t);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
    } catch (e) {} finally { setSending(false); }
  }

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)} className="nav-chat-icon"
        title="Support inbox" aria-label="Support inbox"
        style={{
          position: "relative", background: "transparent", border: "none",
          color: "var(--muted)", cursor: "pointer", padding: "6px 10px",
          borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="9" cy="9.5" rx="6.5" ry="5.5" fill="currentColor" opacity="0.45"/>
  <path d="M22 14c0-3.31-3.13-6-7-6s-7 2.69-7 6c0 1.2.42 2.32 1.13 3.27L8 21l4.1-1.55c.91.32 1.9.5 2.9.5 3.87 0 7-2.69 7-6.5z" fill="currentColor"/>
</svg>
        {totalUnread > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 2,
            background: "#f87171", color: "#fff", borderRadius: 99,
            minWidth: 18, height: 18, padding: "0 5px",
            fontSize: 10, fontWeight: 700, display: "flex",
            alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg, #14141e)",
          }}>{totalUnread}</span>
        )}
      </button>

      {open && pos && (
        <div ref={panelRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9000,
          width: 380, maxWidth: "calc(100vw - 32px)",
          height: 540, maxHeight: "calc(100vh - 110px)",
          background: "#14141e", border: "1px solid rgba(124,106,255,0.4)",
          borderRadius: 16, display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)", overflow: "hidden",
        }}>
          <div onMouseDown={startDrag} onTouchStart={startDrag} style={{
            padding: "14px 16px",
            background: "linear-gradient(90deg, #ff6a8e, #7c6aff)",
            color: "#fff", display: "flex", alignItems: "center", gap: 10,
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none",
          }}>
            {selected ? (
              <>
                <button onClick={() => setSelected(null)} style={{
                  background: "rgba(255,255,255,0.15)", color: "#fff",
                  border: "none", borderRadius: "50%", width: 28, height: 28,
                  cursor: "pointer", fontSize: 14, flexShrink: 0,
                }}>←</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: selected.online ? "#4ade80" : "rgba(255,255,255,0.5)" }} />
                    {selected.userName}
                  </div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.9 }}>
                    {selected.userEmail} · {selected.online ? "online" : `last seen ${fmtTime(selected.lastSeen)} ago`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>🛡️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Support Inbox</div>
                  <div style={{ fontSize: "0.74rem", opacity: 0.9 }}>
                    {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}` : "All caught up ✓"}
                  </div>
                </div>
              </>
            )}
            <button onClick={() => { setOpen(false); setSelected(null); }} style={{
              background: "rgba(255,255,255,0.18)", color: "#fff",
              border: "none", borderRadius: "50%", width: 28, height: 28,
              cursor: "pointer", fontSize: 14, flexShrink: 0,
            }}>✕</button>
          </div>

          {!selected ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {threads.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: "0.86rem" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 8 }}>📭</div>
                  No conversations yet.
                </div>
              ) : threads.map(t => (
                <div key={t.id} onClick={() => openThread(t)} style={{
                  padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  background: t.unreadByAdmin > 0 ? "rgba(248,113,113,0.05)" : "transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.online ? "#4ade80" : "#666" }} />
                      {t.userName}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{fmtTime(t.updatedAt)}</span>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: 3 }}>
                    {t.userEmail} · {t.userRole}
                  </div>
                  <div style={{
                    fontSize: "0.82rem",
                    color: t.unreadByAdmin > 0 ? "var(--text)" : "var(--muted)",
                    fontWeight: t.unreadByAdmin > 0 ? 600 : 400,
                    display: "flex", justifyContent: "space-between", gap: 8,
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.lastSenderRole === "superadmin" ? "You: " : ""}{t.lastMessage || "(no messages)"}
                    </span>
                    {t.unreadByAdmin > 0 && (
                      <span style={{ background: "#f87171", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
                        {t.unreadByAdmin}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div ref={scrollRef} style={{
                flex: 1, overflowY: "auto", padding: 14,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {(selected.messages || []).map(m => {
                  const fromAdmin = m.senderRole === "superadmin";
                  return (
                    <div key={m.id} style={{ alignSelf: fromAdmin ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                      <div style={{
                        background: fromAdmin ? "linear-gradient(135deg, #7c6aff, #ff6a8e)" : "var(--bg3)",
                        color: fromAdmin ? "#fff" : "var(--text)",
                        padding: "9px 13px", borderRadius: 12,
                        fontSize: "0.88rem", lineHeight: 1.45,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>{m.body}</div>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: 3, textAlign: fromAdmin ? "right" : "left" }}>
                        {fromAdmin ? "You" : selected.userName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={reply} style={{
                padding: 12, borderTop: "1px solid var(--border)",
                display: "flex", gap: 8,
              }}>
                <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a reply…" autoFocus
                  style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: "0.9rem" }} />
                <button type="submit" disabled={sending || !draft.trim()} style={{
                  background: "linear-gradient(135deg, #7c6aff, #ff6a8e)", color: "#fff", border: "none", borderRadius: 10,
                  padding: "0 16px", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600,
                }}>{sending ? "…" : "➤"}</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
