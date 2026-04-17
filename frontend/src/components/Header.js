import React from "react";
import { auth } from "../api";
import "./Header.css";

export default function Header({ page, navigate }) {
  const loggedIn = auth.isLoggedIn();

  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => navigate("home")}>
          <span className="logo-icon">⚡</span>
          <span>SplitPass</span>
        </button>
        <nav className="nav">
          <button
            className={`nav-link ${page === "home" ? "active" : ""}`}
            onClick={() => navigate("home")}
          >Home</button>
          <button
            className={`nav-link ${page === "groups" ? "active" : ""}`}
            onClick={() => navigate("groups")}
          >Browse Groups</button>

          {/* Admin link — shows lock icon if not logged in */}
          <button
            className={`nav-link admin-nav-link ${["earnings","admin-login"].includes(page) ? "active" : ""}`}
            onClick={() => navigate(loggedIn ? "earnings" : "admin-login")}
            title={loggedIn ? "Earnings Dashboard" : "Admin Login"}
          >
            {loggedIn ? "💰 Earnings" : "🔒 Admin"}
          </button>

          <button className="btn btn-primary btn-sm" onClick={() => navigate("create")}>
            + Create Group
          </button>
        </nav>
      </div>
    </header>
  );
}
