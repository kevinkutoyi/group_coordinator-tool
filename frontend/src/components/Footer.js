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

              {/* Newsletter agreement checkbox */}
              <label className="fn-checkbox-row">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="checkbox-input"
                />
                <span className="fn-checkbox-box">
                  {agreed && <span className="checkbox-tick">✓</span>}
                </span>
                <span className="fn-checkbox-label">
                  I agree to receive the SplitPass newsletter and marketing emails.
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

        {/* Divider */}
        <div className="footer-divider" />

        {/* Bottom bar */}
        <div className="footer-bottom">
          <div className="footer-brand">
            <span className="footer-logo">⚡ SplitPass</span>
            <span className="footer-tagline">Share legally, save smartly.</span>
          </div>

          <nav className="footer-links">
            <button onClick={() => navigate("home")}>Home</button>
            <button onClick={() => navigate("groups")}>Browse Groups</button>
            <button onClick={() => navigate("signup")}>Sign Up</button>
            <button onClick={() => navigate("login")}>Log In</button>
          </nav>

          <p className="footer-legal">
            © {new Date().getFullYear()} SplitPass. All group buys use official family/group plans only.
          </p>
        </div>
      </div>
    </footer>
  );
}
