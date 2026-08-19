import React, { useState, useEffect } from "react";
import { session } from "../api";
import SupportChatBubble from "./SupportChatBubble";
import SupportAdminBubble from "./SupportAdminBubble";
import "./Header.css";

export default function Header({ page, navigate, user }) {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [navOpen, setNavOpen]       = useState(false);
  const role = session.getRole();

  // Close the mobile nav panel any time the page changes (link tapped) —
  // otherwise it stays open over the newly-navigated page.
  useEffect(() => { setNavOpen(false); setMenuOpen(false); }, [page]);

  function logout() {
    session.clear();
    navigate("home");
    setMenuOpen(false);
    setNavOpen(false);
  }

  function go(target, param) {
    navigate(target, param);
    setNavOpen(false);
  }

  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => go("home")}>
          <span className="logo-icon">⚡</span>
          <span>SplitSubs</span>
        </button>

        {/* Hamburger — only visible on smaller screens (see Header.css) */}
        <button
          className={`hamburger-btn ${navOpen ? "open" : ""}`}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen(o => !o)}
        >
          <span /><span /><span />
        </button>

        {/* Backdrop — tap outside the mobile panel to close it */}
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

        <nav className={`nav ${navOpen ? "nav-open" : ""}`}>
          <button className={`nav-link ${page==="home"?"active":""}`} onClick={() => go("home")}>Home</button>
          <button className={`nav-link ${page==="groups"?"active":""}`} onClick={() => go("groups")}>Browse Groups</button>
          <SupportChatBubble navigate={navigate} />
          <SupportAdminBubble />
          <a href="/blog" className="nav-link">📝 Blog</a>
          {(session.isSuperAdmin() || session.isModerator()) && (
            <button className={`nav-link ${page==="blog-editor"?"active":""}`} onClick={() => go("blog-editor")}>✏️ Editor</button>
          )}

          {/* Role-specific links */}
          {role === "moderator" && (
            <button className={`nav-link ${page==="mod-dash"?"active":""}`} onClick={() => go("mod-dash")}>📊 Dashboard</button>
          )}
          {["moderator","superadmin"].includes(role) && (
            <button className={`nav-link ${page==="create"?"active":""}`} onClick={() => go("create")}>+ Create Group</button>
          )}
          {role === "superadmin" && (
            <button className={`nav-link admin-link ${["admin","earnings"].includes(page)?"active":""}`} onClick={() => go("admin")}>🛡️ Admin</button>
          )}

          {/* Auth state */}
          {!user ? (
            <div className="nav-auth">
              <button className="btn btn-outline btn-sm" onClick={() => go("login")}>Log In</button>
              <button className="btn btn-primary btn-sm" onClick={() => go("signup")}>Sign Up</button>
            </div>
          ) : (
            <div className="user-menu-wrap">
              <button className="user-pill" onClick={() => setMenuOpen(o => !o)}>
                <span className="user-avatar">{user.name?.[0]?.toUpperCase()}</span>
                <span className="user-name">{user.name.split(" ")[0]}</span>
                <span className="user-role-badge role-badge-sm" data-role={user.role}>{user.role}</span>
                <span style={{fontSize:"0.7rem",opacity:0.5}}>▾</span>
              </button>
              {menuOpen && (
                <div className="user-dropdown" onClick={() => setMenuOpen(false)}>
                  <button onClick={() => go("my-groups")}>📋 My Groups</button>
                  <button onClick={() => go("splitcoins")}>🪙 SplitCoins</button>
                  {session.isModerator() && <button onClick={() => go("mod-dash")}>📊 Moderator Dashboard</button>}
                  {session.isModerator() && <button onClick={() => go("mod-settings")}>⚙️ Settings & PesaPal</button>}
                  <button onClick={() => go("login")} className="divider">⚙️ Account</button>
                  <button onClick={logout} className="logout-btn">🚪 Sign Out</button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
