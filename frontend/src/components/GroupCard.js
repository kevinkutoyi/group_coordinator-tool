import React, { useRef, useState } from "react";
import "./GroupCard.css";

const CYCLE_LABELS = {
  monthly:    { label:"Monthly",    icon:"📅", color:"#7c6aff" },
  quarterly:  { label:"Quarterly",  icon:"🗓️", color:"#ff6a8e" },
  biannually: { label:"Every 6 mo", icon:"📆", color:"#6affcb" },
  annually:   { label:"Annual",     icon:"🏆", color:"#fbbf24" },
};

const SERVICE_GRADIENTS = {
  spotify: ["#1DB954","#158a3e"],
  netflix: ["#E50914","#8b0000"],
  chatgpt: ["#10a37f","#0d7a60"],
  claude:  ["#7c6aff","#5548cc"],
  youtube: ["#FF0000","#cc0000"],
  apple:   ["#555","#222"],
  disney:  ["#113ccf","#0a2596"],
  hbo:     ["#5822B4","#3d1880"],
};

export default function GroupCard({ group, onClick }) {
  const filled    = group.memberCount || 0;
  const pct       = Math.round((filled / group.maxSlots) * 100);
  const spotsLeft = group.maxSlots - filled;
  const cycle     = CYCLE_LABELS[group.billingCycle] || CYCLE_LABELS.monthly;
  const gradient  = SERVICE_GRADIENTS[group.serviceId] || ["#7c6aff","#5548cc"];

  // 3-D tilt on mouse move
  const cardRef  = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50 });

  function handleMouseMove(e) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    setTilt({
      x: ((y - cy) / cy) * 8,
      y: -((x - cx) / cx) * 8,
      gx: (x / rect.width) * 100,
      gy: (y / rect.height) * 100,
    });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0, gx: 50, gy: 50 });
  }

  return (
    <div
      ref={cardRef}
      className={`gc-wrap gc-status-${group.status}`}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        "--tilt-x": `${tilt.x}deg`,
        "--tilt-y": `${tilt.y}deg`,
        "--gx": `${tilt.gx}%`,
        "--gy": `${tilt.gy}%`,
        "--g1": gradient[0],
        "--g2": gradient[1],
      }}
    >
      {/* Glow layer that tracks the mouse */}
      <div className="gc-glow" />

      {/* Status ribbon */}
      {group.status === "open" && spotsLeft <= 2 && spotsLeft > 0 && (
        <div className="gc-ribbon gc-ribbon-urgent">🔥 Almost full!</div>
      )}
      {group.status === "full" && (
        <div className="gc-ribbon gc-ribbon-full">● Full</div>
      )}
      {group.status === "closed" && (
        <div className="gc-ribbon gc-ribbon-closed">Closed</div>
      )}

      <div className="gc-inner">
        {/* Header */}
        <div className="gc-head">
          <div className="gc-icon-wrap">
            <span className="gc-icon">{group.serviceIcon}</span>
          </div>
          <div className="gc-title">
            <h3>{group.serviceName}</h3>
            <p className="gc-plan">{group.planName}</p>
          </div>
          {/* Billing cycle badge */}
          <div className="gc-cycle-badge" style={{ "--cycle-color": cycle.color }}>
            {cycle.icon} {cycle.label}
          </div>
        </div>

        {group.description && (
          <p className="gc-desc">{group.description}</p>
        )}

        {/* Price block */}
        <div className="gc-price-block">
          <div className="gc-price-main">
            <span className="gc-currency">$</span>
            <span className="gc-amount">{group.pricePerSlot}</span>
            <span className="gc-price-sub">/{group.billingCycle === "monthly" ? "mo" : "period"}</span>
          </div>
          <div className="gc-price-meta">
            <span className="gc-full-price">${group.totalPrice}/mo full plan</span>
            <span className="gc-save-badge">Save ${(group.totalPrice - group.pricePerSlot).toFixed(2)}</span>
          </div>
        </div>

        {/* Animated progress bar */}
        <div className="gc-progress-wrap">
          <div className="gc-progress-track">
            <div
              className="gc-progress-fill"
              style={{ "--pct": `${pct}%`, "--g1": gradient[0], "--g2": gradient[1] }}
            />
          </div>
          <div className="gc-slots-row">
            <span className="gc-slots-text">{filled}/{group.maxSlots} paying slots</span>
            <span className={`gc-spots ${spotsLeft === 0 ? "full" : spotsLeft <= 2 ? "urgent" : "open"}`}>
              {spotsLeft > 0
                ? <><span className="gc-dot" />{spotsLeft} spot{spotsLeft > 1 ? "s" : ""} left</>
                : "● Full"
              }
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="gc-footer">
          <span className="gc-organizer">🛡️ {group.organizerName}</span>
          <span className={`gc-status-pill status-${group.status}`}>
            {group.status === "open" ? "● Open" : group.status === "full" ? "● Full" : "Closed"}
          </span>
        </div>
      </div>
    </div>
  );
}
