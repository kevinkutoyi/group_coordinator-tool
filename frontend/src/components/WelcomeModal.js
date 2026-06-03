import React, { useState, useEffect } from "react";
import "./WelcomeModal.css";

const REFRESH_SECONDS = 600; // 10 minutes

export default function WelcomeModal({ navigate, onClose }) {
  const [seconds, setSeconds] = useState(REFRESH_SECONDS);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const i = setInterval(() => {
      setSeconds(s => (s <= 1 ? REFRESH_SECONDS : s - 1));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  function fmt(s) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  }

  function close() {
    setClosing(true);
    setTimeout(() => onClose && onClose(), 220);
  }

  function handleJoin() {
    close();
    setTimeout(() => navigate("groups"), 230);
  }

  return (
    <div className={`wm-overlay ${closing ? "wm-out" : "wm-in"}`} onClick={close}>
      <div className="wm-card" onClick={e => e.stopPropagation()}>
        <button className="wm-close" onClick={close} aria-label="Close">✕</button>

        <span className="wm-sparkle wm-spark-1">✨</span>
        <span className="wm-sparkle wm-spark-2">⭐</span>
        <span className="wm-sparkle wm-spark-3">✨</span>

        <div className="wm-glow" />

        <div className="wm-urgency">
          <span className="wm-pulse" />
          <span>⏳ Limited premium slots filling fast</span>
        </div>

        <h1 className="wm-title">
          Join a Group.<br/>
          <span className="wm-grad">Pay Less.</span><br/>
          <span className="wm-sub">100% Official Plans.</span>
        </h1>

        <p className="wm-desc">
          We help you join others to split the cost of official premium plans.
        </p>

        <ul className="wm-features">
          <li><span className="wm-tick">✅</span> Official family &amp; team plans only</li>
          <li><span className="wm-tick">✅</span> No reselling or hacked accounts</li>
          <li><span className="wm-tick">✅</span> Secure &amp; private access</li>
        </ul>

        <div className="wm-social">
          <span className="wm-stars">⭐⭐⭐⭐⭐</span>
          <strong>1,000+ users</strong> already saving monthly
        </div>

        <button className="wm-cta" onClick={handleJoin}>
          <span>Join a Group Now</span>
          <span className="wm-arrow">→</span>
          <span className="wm-shimmer" />
        </button>

        <div className="wm-timer">
          <span className="wm-timer-icon">⏱</span>
          Groups refresh in: <strong>{fmt(seconds)}</strong>
        </div>
      </div>
    </div>
  );
}
