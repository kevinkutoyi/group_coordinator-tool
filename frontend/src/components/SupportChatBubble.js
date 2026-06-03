import React, { useState, useEffect, useRef } from "react";
import { api, session } from "../api";

export default function SupportChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [adminOnline, setAdminOnline] = useState(false);
  const [adminLastSeen, setAdminLastSeen] = useState(null);
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
    if (!session.isLoggedIn() || session.isSuperAdmin()) return;
    api.heartbeat();
    const hb = setInterval(() => api.heartbeat(), 30000);
    return () => clearInterval(hb);
  }, []);

  useEffect(() => {
    if (!session.isLoggedIn() || session.isSuperAdmin()) return;
    const refresh = async () => {
      try {
        const u = await api.getMyUnreadCount();
        setUnread(u.count || 0);
        const pres = await api.getSuperadminPresence();
        setAdminOnline(pres.online);
        setAdminLastSeen(pres.lastSeen);
      } catch {}
    };
    refresh();
    const interval = setInterval(refresh, open ? 5000 : 20000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        const r = await api.getMySupportThread();
        if (!active) return;
        setMessages(r.thread?.messages || []);
        setUnread(0);
        setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
      } catch {}
    };
    load();
    const i = setInterval(load, 5000);
    return () => { active = false; clearInterval(i); };
  }, [open]);

  async function send(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const r = await api.supportSendMessage(body);
      setMessages(m => [...m, r.message]);
      setDraft("");
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
    } catch (e) {} finally { setSending(false); }
  }

  function fmtLastSeen(ts) {
    if (!ts) return "Offline";
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.floor(m/60)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

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

  if (!session.isLoggedIn() || session.isSuperAdmin()) return null;

  return (
    <>
      {/* Nav icon button */}
      <button ref={triggerRef} onClick={() => setOpen(true)} className="nav-chat-icon"
        title="Chat with SplitSubs Admin" aria-label="Chat with admin"
        style={{
          position: "relative", background: "transparent", border: "none",
          color: "var(--muted)", cursor: "pointer", padding: "6px 10px",
          borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: "0.92rem",
        }}>
        <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="9" cy="9.5" rx="6.5" ry="5.5" fill="currentColor" opacity="0.45"/>
  <path d="M22 14c0-3.31-3.13-6-7-6s-7 2.69-7 6c0 1.2.42 2.32 1.13 3.27L8 21l4.1-1.55c.91.32 1.9.5 2.9.5 3.87 0 7-2.69 7-6.5z" fill="currentColor"/>
</svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 2,
            background: "#f87171", color: "#fff", borderRadius: 99,
            minWidth: 18, height: 18, padding: "0 5px",
            fontSize: 10, fontWeight: 700, display: "flex",
            alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg, #14141e)",
          }}>{unread}</span>
        )}
      </button>

      {/* Floating chat panel */}
      {open && pos && (
        <div ref={panelRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9000,
          width: 380, maxWidth: "calc(100vw - 32px)", height: 540,
          maxHeight: "calc(100vh - 110px)",
          background: "#14141e", border: "1px solid rgba(124,106,255,0.4)",
          borderRadius: 16, display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)", overflow: "hidden",
        }}>
          <div onMouseDown={startDrag} onTouchStart={startDrag} style={{
            padding: "14px 16px",
            background: "linear-gradient(90deg, #7c6aff, #ff6a8e)",
            color: "#fff", display: "flex", alignItems: "center", gap: 10,
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none",
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, position: "relative", flexShrink: 0,
            }}>
              🛡️
              <span style={{
                position: "absolute", bottom: -2, right: -2,
                width: 12, height: 12, borderRadius: "50%",
                background: adminOnline ? "#4ade80" : "#888",
                border: "2px solid #14141e",
              }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.96rem" }}>
                💬 Chat with SplitSubs Admin
              </div>
              <div style={{ fontSize: "0.74rem", opacity: 0.92 }}>
                {adminOnline
                  ? "🟢 Online — usually replies in minutes"
                  : `Offline · last seen ${fmtLastSeen(adminLastSeen)}`}
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "rgba(255,255,255,0.18)", color: "#fff",
              border: "none", borderRadius: "50%", width: 28, height: 28,
              cursor: "pointer", fontSize: 14, flexShrink: 0,
            }}>✕</button>
          </div>

          <div ref={scrollRef} style={{
            flex: 1, overflowY: "auto", padding: 14,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: "0.86rem", lineHeight: 1.6 }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>👋</div>
                Hi! Send the SplitSubs admin team a message about anything — questions, issues, payments, or feedback. We typically reply within minutes.
              </div>
            ) : messages.map(m => {
              const fromAdmin = m.senderRole === "superadmin";
              return (
                <div key={m.id} style={{ alignSelf: fromAdmin ? "flex-start" : "flex-end", maxWidth: "82%" }}>
                  <div style={{
                    background: fromAdmin ? "var(--bg3)" : "linear-gradient(135deg, #7c6aff, #ff6a8e)",
                    color: fromAdmin ? "var(--text)" : "#fff",
                    padding: "9px 13px", borderRadius: 12,
                    fontSize: "0.88rem", lineHeight: 1.45,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>{m.body}</div>
                  <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: 3, textAlign: fromAdmin ? "left" : "right" }}>
                    {fromAdmin ? "🛡️ SplitSubs Admin" : "You"} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={send} style={{
            padding: 12, borderTop: "1px solid var(--border)",
            display: "flex", gap: 8,
          }}>
            <input
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder="Message admin…" autoFocus
              style={{
                flex: 1, background: "var(--bg3)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: "0.9rem",
              }}
            />
            <button type="submit" disabled={sending || !draft.trim()} style={{
              background: "linear-gradient(135deg, #7c6aff, #ff6a8e)",
              color: "#fff", border: "none", borderRadius: 10,
              padding: "0 16px", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600,
            }}>{sending ? "…" : "➤"}</button>
          </form>
        </div>
      )}
    </>
  );
}
