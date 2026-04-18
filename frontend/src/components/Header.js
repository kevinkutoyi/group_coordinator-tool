import React, { useState } from "react";
import { session } from "../api";
import "./Header.css";

export default function Header({ page, navigate, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const role = session.getRole();

  function logout() {
    session.clear();
    navigate("home");
    setMenuOpen(false);
  }

  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => navigate("home")}>
          <span className="logo-icon">⚡</span>
          <span>SplitPass</span>
        </button>

        <nav className="nav">
          <button className={`nav-link ${page==="home"?"active":""}`} onClick={() => navigate("home")}>Home</button>
          <button className={`nav-link ${page==="groups"?"active":""}`} onClick={() => navigate("groups")}>Browse Groups</button>

          {/* Role-specific links */}
          {["moderator","superadmin"].includes(role) && (
            <button className={`nav-link ${page==="create"?"active":""}`} onClick={() => navigate("create")}>+ Create Group</button>
          )}
          {role === "superadmin" && (
            <>
              <button className={`nav-link admin-link ${page==="admin"?"active":""}`} onClick={() => navigate("admin")}>🛡️ Admin</button>
              <button className={`nav-link admin-link ${page==="earnings"?"active":""}`} onClick={() => navigate("earnings")}>💰 Earnings</button>
            </>
          )}

          {/* Auth state */}
          {!user ? (
            <div className="nav-auth">
              <button className="btn btn-outline btn-sm" onClick={() => navigate("login")}>Log In</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("signup")}>Sign Up</button>
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
                  <button onClick={() => navigate("my-groups")}>📋 My Groups</button>
                  <button onClick={() => navigate("login")} className="divider">⚙️ Account</button>
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
