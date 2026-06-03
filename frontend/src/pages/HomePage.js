import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import "./HomePage.css";
const TRUST_RIBBON_ITEMS = [
  { icon: "🛡️", text: "100% Legal & Compliant" },
  { icon: "🔒", text: "Official Family & Group Plans Only" },
  { icon: "👥", text: "500+ Happy Users" },
  { icon: "⭐", text: "4.9/5 Average Rating" },
  { icon: "💳", text: "Secure Card & M-Pesa Payments" },
  { icon: "🔑", text: "Instant Credential Vault Access" },
  { icon: "✨", text: "Save up to 70% on Premium Subs" },
  { icon: "🚀", text: "Slots Confirmed in Seconds" },
];


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

      {/* Animated trust ribbon */}
      <div className="trust-ribbon" aria-label="Trust signals">
        <div className="trust-ribbon-track">
          {[...TRUST_RIBBON_ITEMS, ...TRUST_RIBBON_ITEMS].map((it, i) => (
            <div key={i} className="trust-ribbon-item">
              <span className="trust-ribbon-icon">{it.icon}</span>
              <span className="trust-ribbon-text">{it.text}</span>
              <span className="trust-ribbon-dot">•</span>
            </div>
          ))}
        </div>
      </div>
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
            { n:"01", icon:"✍️", title:"Sign Up",          text:"Create a free customer account in seconds. No credit card needed to register." },
            { n:"02", icon:"🔍", title:"Find a Group",     text:"Browse open groups for your favourite subscription service and pick your duration (1, 3, 6, or 12 months — longer plans are discounted)." },
            { n:"03", icon:"🔒", title:"Pay via M-Pesa",   text:"Pay your share securely through PesaPal (M-Pesa, card, or bank). Your slot is confirmed the moment payment clears." },
            { n:"04", icon:"🔑", title:"Unlock the Vault", text:"Once paid, the group's Credential Vault unlocks for you — that's where the organizer stores the login details. No DMs, no emails: access is delivered inside the vault, instantly." },
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
            <p>A moderator is able to create and list groups on SplitSubs for others to join. This requires trust, and hence admin approval and group reviews are needed to protect our users.</p>
            <button className="btn btn-outline" onClick={() => navigate("signup", { role: "moderator" })}>Apply as Moderator</button>
          </div>
        </section>
      )}

      <section className="legal-section">
        <div className="info-box">
          <strong>⚖️ Legal Compliance Notice</strong><br/>
          SplitSubs only supports services with <em>official family or group plans</em>. We never encourage account sharing that violates Terms of Service. Every member is a legitimate slot on the provider's official plan.
        </div>
      </section>

      {/* ── Trust + Social proof ─────────────────────────────── */}
      <section className="trust-section">
        {/* Row 1: Trust badges */}
        <div className="trust-row">
          <div className="trust-block trust-headline">
            <h3>Trusted. Transparent. Compliant.</h3>
            <p>We follow the rules so you can subscribe with peace of mind.</p>
          </div>

          <div className="trust-divider" />

          <div className="trust-block trust-badge">
            <div className="trust-badge-label trust-badge-card">💳 Card Payments</div>
            <div className="trust-badge-sub">Supported</div>
          </div>

          <div className="trust-divider" />

          <div className="trust-block trust-badge">
            <div className="trust-badge-icon">🛡️</div>
            <div className="trust-badge-label">256-BIT SSL</div>
            <div className="trust-badge-sub">Encrypted</div>
          </div>

          <div className="trust-divider" />

          <div className="trust-block trust-badge">
            <div className="trust-badge-label trust-badge-mpesa">📱 M-PESA</div>
            <div className="trust-badge-sub">Secure Payments</div>
          </div>

          <button
            type="button"
            className="trust-block trust-highlight"
            onClick={() => navigate("groups")}
            aria-label="Our guarantee — browse groups"
          >
            <div className="trust-highlight-icon">🛡️</div>
            <div>
              <h4>Our Guarantee</h4>
              <p>If a plan has issues, we'll help resolve or replace your slot. Your satisfaction is guaranteed.</p>
            </div>
          </button>
        </div>

        {/* Row 2: Social proof */}
        <div className="trust-row">
          <div className="trust-block trust-avatars">
            <div className="ts-avatars">
              <span className="ts-av ts-av-1">A</span>
              <span className="ts-av ts-av-2">S</span>
              <span className="ts-av ts-av-3">D</span>
              <span className="ts-av ts-av-4">M</span>
              <span className="ts-av ts-av-5">J</span>
              <span className="ts-av ts-av-more">+495</span>
            </div>
            <p>500+ students and professionals trust SplitSubs worldwide.</p>
          </div>

          <div className="trust-divider" />

          <div className="trust-block trust-rating">
            <div className="ts-stars">★★★★★</div>
            <p><strong>4.9/5 average rating</strong><br/>from 300+ reviews</p>
          </div>

          <button
            type="button"
            className="trust-block trust-highlight trust-urgent"
            onClick={() => navigate("groups")}
            aria-label="Browse and join a group now"
          >
            <div className="trust-highlight-icon">⏱️</div>
            <div>
              <h4>Groups fill fast!</h4>
              <p>Join now to secure your slot before others do.</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
