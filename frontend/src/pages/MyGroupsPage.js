import React, { useEffect, useState } from "react";
import { api, session } from "../api";

export default function MyGroupsPage({ navigate }) {
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session.isLoggedIn()) { navigate("login"); return; }
    api.getGroups()
      .then(all => {
        const uid  = session.getUser()?.id;
        const role = session.getRole();

        const mine = all.filter(g => {
          // Moderators/superadmin see groups they organise
          const isOrganizer = g.organizerId === uid;
          // Customers see groups they have a paying membership in
          const isMember = g.members?.some(m => m.userId === uid && m.role !== "organizer");
          return isOrganizer || isMember;
        });
        setGroups(mine);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign:"center", padding:80 }}><span className="spinner"/></div>;

  const uid = session.getUser()?.id;

  return (
    <div className="fade-in">
      <h1 className="page-title">My Groups</h1>
      <p className="page-sub">Groups you organise or have joined as a paying member</p>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📋</div>
          <h3>No groups yet</h3>
          <p>Browse available groups and join one to get started.</p>
          <br/>
          <button className="btn btn-primary" onClick={() => navigate("groups")}>Browse Groups</button>
        </div>
      ) : (
        <div className="grid-2">
          {groups.map(g => {
            const isOrganizer   = g.organizerId === uid;
            // Only look for a paying membership (not organizer role)
            const myMembership  = g.members?.find(m => m.userId === uid && m.role !== "organizer");
            const payingMembers = g.members?.filter(m => m.role !== "organizer") || [];
            const filled        = payingMembers.length;

            return (
              <div key={g.id} className="card card-clickable" onClick={() => navigate("group", g.id)}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                  <span style={{ fontSize:"2rem" }}>{g.serviceIcon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700 }}>{g.serviceName} — {g.planName}</div>
                    <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                      {isOrganizer
                        ? "🛡️ You are the organizer — you coordinate, not a paying slot"
                        : `👤 Paying member · ${filled}/${g.maxSlots} slots filled`}
                    </div>
                  </div>
                  <span className={`tag tag-${g.status}`}>{g.status}</span>
                </div>

                {/* Organizer summary */}
                {isOrganizer && (
                  <div style={{ background:"var(--bg3)", borderRadius:10, padding:"10px 14px", fontSize:"0.82rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"var(--muted)" }}>Paying slots filled</span>
                      <span style={{ fontWeight:600 }}>{filled} / {g.maxSlots}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"var(--muted)" }}>Per member / month</span>
                      <span style={{ fontWeight:600 }}>${g.memberPays} <span style={{ color:"var(--muted)", fontWeight:400 }}>(incl. 2% fee)</span></span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:"var(--muted)" }}>You collect / month</span>
                      <span style={{ fontWeight:600, color:"var(--accent3)" }}>
                        ${(g.pricePerSlot * filled).toFixed(2)} from {filled} member{filled !== 1?"s":""}
                      </span>
                    </div>
                    {g.billingCycle && (
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                        <span style={{ color:"var(--muted)" }}>Billing cycle</span>
                        <span style={{ fontSize:"0.75rem", textTransform:"capitalize" }}>{g.billingCycle}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Member (paying) summary */}
                {myMembership && (
                  <div style={{ background:"var(--bg3)", borderRadius:10, padding:"10px 14px", fontSize:"0.82rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"var(--muted)" }}>Duration</span>
                      <span style={{ fontWeight:600 }}>{myMembership.durationLabel || "1 Month"}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"var(--muted)" }}>Amount paid</span>
                      <span style={{ fontWeight:600, color:"var(--success)" }}>${myMembership.memberPays || g.memberPays}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"var(--muted)" }}>Payment status</span>
                      <span className={`tag tag-${myMembership.paymentStatus}`} style={{ padding:"1px 8px", fontSize:"0.72rem" }}>
                        {myMembership.paymentStatus}
                      </span>
                    </div>
                    {myMembership.expiresAt && (
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:"var(--muted)" }}>Expires</span>
                        <span style={{ fontSize:"0.75rem" }}>{new Date(myMembership.expiresAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {myMembership.paymentStatus === "pending" && (
                      <div style={{ marginTop:10 }}>
                        <button className="btn btn-sm pesapal-btn" style={{ width:"100%" }}
                          onClick={e => { e.stopPropagation(); navigate("group", g.id); }}>
                          🔒 Pay via PesaPal →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
