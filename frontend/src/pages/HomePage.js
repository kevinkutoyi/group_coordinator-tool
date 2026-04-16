import React, { useEffect, useState } from "react";
import { api } from "../api";
import "./HomePage.css";

const HERO_SERVICES = [
  { icon: "🎵", name: "Spotify" },
  { icon: "🎬", name: "Netflix" },
  { icon: "🤖", name: "ChatGPT" },
  { icon: "✨", name: "Claude AI" },
  { icon: "▶️", name: "YouTube" },
  { icon: "🍎", name: "Apple One" },
  { icon: "🏰", name: "Disney+" },
  { icon: "👑", name: "Max" },
];

export default function HomePage({ navigate }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="home fade-in">
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">🔒 Legal Family & Group Plans Only</div>
        <h1 className="hero-title">
          Split subscriptions.<br />
          <span className="gradient-text">Save together.</span>
        </h1>
        <p className="hero-sub">
          Coordinate group-buys for Spotify, Netflix, Claude AI, ChatGPT &amp; more —
          using their official family or group plans. Fully legal, fully transparent.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate("groups")}>Browse Open Groups</button>
          <button className="btn btn-outline" onClick={() => navigate("create")}>+ Start a Group</button>
        </div>

        <div className="service-pills">
          {HERO_SERVICES.map(s => (
            <span key={s.name} className="service-pill">
              {s.icon} {s.name}
            </span>
          ))}
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card"><div className="stat-value">{stats.openGroups}</div><div className="stat-label">Open Groups</div></div>
          <div className="stat-card"><div className="stat-value">{stats.fullGroups}</div><div className="stat-label">Filled Groups</div></div>
          <div className="stat-card"><div className="stat-value">{stats.totalMembers}</div><div className="stat-label">Members</div></div>
          <div className="stat-card"><div className="stat-value">${stats.totalSaved}</div><div className="stat-label">Total Saved</div></div>
        </div>
      )}

      {/* How it works */}
      <section className="how-section">
        <h2 className="section-title">How it works</h2>
        <div className="steps">
          {[
            { n:"01", icon:"🔍", title:"Browse Groups", text:"Find an open group for your favourite subscription service with available slots." },
            { n:"02", icon:"✋", title:"Request to Join", text:"Enter your name and email. The organizer will add you to the shared plan." },
            { n:"03", icon:"💸", title:"Pay Your Share", text:"Send your monthly split amount directly to the organizer via your preferred method." },
            { n:"04", icon:"🎉", title:"Enjoy &amp; Save", text:"The organizer shares your login slot. You save up to 80% compared to solo plans." },
          ].map(step => (
            <div key={step.n} className="step-card card">
              <div className="step-num">{step.n}</div>
              <div className="step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p dangerouslySetInnerHTML={{ __html: step.text }} />
            </div>
          ))}
        </div>
      </section>

      {/* Legal note */}
      <section className="legal-section">
        <div className="info-box">
          <strong>⚖️ Legal Compliance Note</strong><br />
          SplitPass only supports services with <em>official family or group plans</em> (e.g. Spotify Family, Netflix Standard/Premium with extra members, YouTube Premium Family). We never encourage password sharing that violates Terms of Service. Each member is a legitimate slot on the provider's official plan.
        </div>
      </section>
    </div>
  );
}
