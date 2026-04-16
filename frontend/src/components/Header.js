import React from "react";
import "./Header.css";

export default function Header({ page, navigate }) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => navigate("home")}>
          <span className="logo-icon">⚡</span>
          <span>SplitPass</span>
        </button>
        <nav className="nav">
          <button className={`nav-link ${page === "home" ? "active" : ""}`} onClick={() => navigate("home")}>Home</button>
          <button className={`nav-link ${page === "groups" ? "active" : ""}`} onClick={() => navigate("groups")}>Browse Groups</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("create")}>+ Create Group</button>
        </nav>
      </div>
    </header>
  );
}
