import React from "react";
import "./GroupCard.css";

export default function GroupCard({ group, onClick }) {
  const filled = group.memberCount || 0;
  const pct = Math.round((filled / group.maxSlots) * 100);
  const spotsLeft = group.maxSlots - filled;

  return (
    <div className="card card-clickable group-card fade-in" onClick={onClick}>
      <div className="gc-top">
        <span className="gc-icon">{group.serviceIcon}</span>
        <div className="gc-title">
          <h3>{group.serviceName}</h3>
          <p className="gc-plan">{group.planName}</p>
        </div>
        <span className={`tag tag-${group.status}`}>
          {group.status === "open" ? "● Open" : group.status === "full" ? "● Full" : "Closed"}
        </span>
      </div>

      {group.description && <p className="gc-desc">{group.description}</p>}

      <div className="gc-price-row">
        <div>
          <span className="gc-price">${group.pricePerSlot}</span>
          <span className="gc-price-sub">/person/mo</span>
        </div>
        <div className="gc-full-price">Full: ${group.totalPrice}/mo</div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="gc-slots">
        <span>{filled}/{group.maxSlots} members</span>
        <span className={spotsLeft === 0 ? "no-spots" : "spots-left"}>
          {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft > 1 ? "s" : ""} left` : "Full"}
        </span>
      </div>

      <div className="gc-footer">
        <span className="gc-organizer">Organizer: {group.organizerName}</span>
        <span className="gc-savings">Save ${(group.totalPrice - group.pricePerSlot).toFixed(2)}/mo</span>
      </div>
    </div>
  );
}
