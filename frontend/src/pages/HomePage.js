import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import "./HomePage.css";

const HERO_SERVICES = [
  { icon:"🎵", name:"Spotify" }, { icon:"🎬", name:"Netflix" },
  { icon:"🤖", name:"ChatGPT" }, { icon:"✨", name:"Claude AI" },
  { icon:"▶️", name:"YouTube" }, { icon:"🍎", name:"Apple One" },
  { icon:"🏰", name:"Disney+" }, { icon:"👑", name:"Max" },
];

export default function HomePage({ navigate }) {
  const [stats, setStats] = useState(null);
  const user = session.getUser();

  useEffect(() => { api.getStats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="home fade-in">
      <section className="hero">
        <div className="hero-badge">🔒 Legal Family & Group Plans Only</div>
        <h1 className="hero-title">
          Split subscriptions.<br/>
          <span className="gradient-text">Save together.</span>
        </h1>
        <p className="hero-sub">
          Coordinate group-buys for Spotify, Netflix, Claude AI, ChatGPT &amp; more — using official family or group plans. Fully legal, fully transparent.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate("groups")}>Browse Open Groups</button>
          {!user
            ? <button className="btn btn-outline" onClick={() => navigate("signup")}>Create Free Account</button>
            : ["moderator","superadmin"].includes(user.role)
              ? <button className="btn btn-outline" onClick={() => navigate("create")}>+ Create a Group</button>
              : <button className="btn btn-outline" onClick={() => navigate("my-groups")}>My Groups</button>
          }
        </div>
        <div className="service-pills">
          {HERO_SERVICES.map(s => <span key={s.name} className="service-pill">{s.icon} {s.name}</span>)}
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
            { n:"01", icon:"✍️", title:"Sign Up",        text:"Create a free customer account in seconds. No credit card needed to register." },
            { n:"02", icon:"🔍", title:"Find a Group",   text:"Browse open groups for your favourite subscription service." },
            { n:"03", icon:"📅", title:"Pick Duration",  text:"Choose 1, 3, 6, or 12 months. Longer plans come with a discount." },
            { n:"04", icon:"🔒", title:"Pay via PesaPal",text:"Secure payment via M-Pesa, card, or bank transfer. Your slot is confirmed instantly." },
          ].map(s => (
            <div key={s.n} className="step-card card">
              <div className="step-num">{s.n}</div>
              <div className="step-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Role callout */}
      {!user && (
        <section className="role-callout">
          <div className="rc-card card">
            <div className="rc-icon">👤</div>
            <h3>Join as a Customer</h3>
            <p>Browse groups, pick your duration, and pay your share securely.</p>
            <button className="btn btn-primary" onClick={() => navigate("signup")}>Sign Up Free</button>
          </div>
          <div className="rc-card card rc-mod">
            <div className="rc-icon">🛡️</div>
            <h3>Become a Group Moderator</h3>
            <p>Hold a subscription plan and earn trust managing a group for others. Requires admin approval.</p>
            <button className="btn btn-outline" onClick={() => navigate("signup")}>Apply as Moderator</button>
          </div>
        </section>
      )}

      <section className="legal-section">
        <div className="info-box">
          <strong>⚖️ Legal Compliance Notice</strong><br/>
          SplitPass only supports services with <em>official family or group plans</em>. We never encourage account sharing that violates Terms of Service. Every member is a legitimate slot on the provider's official plan.
        </div>
      </section>
    </div>
  );
}
