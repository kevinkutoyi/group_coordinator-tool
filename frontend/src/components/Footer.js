import React, { useState } from "react";
import { api } from "../api";
import "./Footer.css";

export default function Footer({ navigate }) {
  const [email, setEmail]           = useState("");
  const [agreed, setAgreed]         = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState("");
  const [emailHint, setEmailHint]   = useState("");

  function checkFooterEmail(val) {
    if (!val) { setEmailHint(""); return; }
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const disposable = ["mailinator","guerrillamail","yopmail","tempmail","trashmail","throwaway"];
    const domain = val.split("@")[1] || "";
    if (!regex.test(val)) setEmailHint("⚠️ Check email format");
    else if (disposable.some(d => domain.includes(d))) setEmailHint("⚠️ Disposable emails not allowed");
    else setEmailHint("✅ Looks good");
  }

  async function handleSubscribe(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Please enter your email address.");
    if (!agreed)       return setError("Please agree to receive our newsletter to subscribe.");
    try {
      await api.footerSubscribe(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Could not subscribe. Please try again.");
    }
  }

  return (
    <footer className="footer">
      <div className="footer-inner">

        {/* Newsletter section */}
        <div className="footer-newsletter">
          <div className="fn-text">
            <div className="fn-title">📧 Stay in the loop</div>
            <p className="fn-sub">
              Get notified about new groups, subscription deals, and platform updates.
              No spam — unsubscribe any time.
            </p>
          </div>

          {submitted ? (
            <div className="fn-success">
              ✅ You're subscribed! Watch your inbox for the next update.
            </div>
          ) : (
            <form className="fn-form" onSubmit={handleSubscribe}>
              <div className="fn-input-row">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="fn-input"
                />
                <button type="submit" className="btn btn-primary fn-btn">Subscribe</button>
              </div>

              <label className="fn-checkbox-row">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="checkbox-input" />
                <span className="fn-checkbox-box">{agreed && <span className="checkbox-tick">✓</span>}</span>
                <span className="fn-checkbox-label">
                  I agree to receive the SplitSubs newsletter and marketing emails.
                  <span className="fn-checkbox-note"> Unsubscribe anytime. See our Privacy Policy.</span>
                </span>
              </label>

              {emailHint && !error && (
                <p style={{fontSize:"0.74rem", color: emailHint.startsWith("✅")?"var(--success)":"var(--warning)", margin:0}}>
                  {emailHint}
                </p>
              )}
              {error && <p className="fn-error">{error}</p>}
            </form>
          )}
        </div>

        {/* Social + contact */}
        <div className="footer-social-row">
          <div className="footer-social-block">
            <div className="footer-social-title">Follow us</div>
            <p className="footer-social-sub">News, updates, and new group drops.</p>
            <div className="footer-social-icons">
              <a href="https://x.com/splitsubs" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="footer-social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21l-6.563 7.5L22 22h-6.84l-4.74-6.193L4.91 22H2.155l7.04-8.04L2 2h6.99l4.28 5.65L18.244 2zm-1.196 18.4h1.51L7.05 3.5H5.45l11.598 16.9z"/></svg>
                <span>X</span>
              </a>
              <a href="https://facebook.com/splitsubs26/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="footer-social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12z"/></svg>
                <span>Facebook</span>
              </a>
              <a href="https://www.instagram.com/splitsubs26/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="footer-social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                <span>Instagram</span>
              </a>
              <a href="https://www.tiktok.com/@splitsubs" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="footer-social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005.8 20.1a6.34 6.34 0 0010.86-4.43V8.39a8.16 8.16 0 004.77 1.52V6.46a4.83 4.83 0 01-1.84-.77z"/></svg>
                <span>TikTok</span>
              </a>
            </div>
          </div>

          <div className="footer-contact-block">
            <div className="footer-social-title">Get in touch</div>
            <p className="footer-social-sub">For queries, partnerships, sponsorships, or to report a bug.</p>
            <a href="mailto:admin@splitsubs.com" className="footer-contact-email">
              <span>✉️</span><span>admin@splitsubs.com</span>
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="footer-divider" />

        {/* Bottom bar */}
        <div className="footer-bottom">
          <div className="footer-brand">
            <span className="footer-logo">⚡ SplitSubs</span>
            <span className="footer-tagline">Share legally, save smartly.</span>
          </div>

          <nav className="footer-links">
            <button onClick={() => navigate("home")}>Home</button>
            <button onClick={() => navigate("groups")}>Browse Groups</button>
            <button onClick={() => navigate("signup")}>Sign Up</button>
            <button onClick={() => navigate("login")}>Log In</button>
          </nav>

          <p className="footer-legal">
            © {new Date().getFullYear()} SplitSubs. All group buys use official family/group plans only.
          </p>
        </div>
      </div>
    </footer>
  );
}
