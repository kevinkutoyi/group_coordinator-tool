import React, { useEffect, useState } from "react";
import { api, session } from "../api";

export default function MyGroupsPage({ navigate, user }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session.isLoggedIn()) { navigate("login"); return; }
    api.getGroups()
      .then(all => {
        const uid = session.getUser()?.id;
        const mine = all.filter(g =>
          g.members?.some(m => m.userId === uid) || g.organizerId === uid
        );
        setGroups(mine);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;

  return (
    <div className="fade-in">
      <h1 className="page-title">My Groups</h1>
      <p className="page-sub">Groups you've joined or organise</p>
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
            const myMembership = g.members?.find(m => m.userId === session.getUser()?.id);
            return (
              <div key={g.id} className="card card-clickable" onClick={() => navigate("group", g.id)}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <span style={{fontSize:"2rem"}}>{g.serviceIcon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700}}>{g.serviceName} — {g.planName}</div>
                    <div style={{fontSize:"0.75rem",color:"var(--muted)"}}>
                      {g.organizerId === session.getUser()?.id ? "🛡️ You are the organizer" : "👤 Member"}
                    </div>
                  </div>
                  <span className={`tag tag-${g.status}`}>{g.status}</span>
                </div>
                {myMembership && myMembership.role !== "organizer" && (
                  <div style={{background:"var(--bg3)",borderRadius:10,padding:"10px 14px",fontSize:"0.82rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{color:"var(--muted)"}}>Duration</span>
                      <span style={{fontWeight:600}}>{myMembership.durationLabel || "1 Month"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{color:"var(--muted)"}}>Total paid</span>
                      <span style={{fontWeight:600,color:"var(--success)"}}>${myMembership.memberPays || g.memberPays}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:"var(--muted)"}}>Payment</span>
                      <span className={`tag tag-${myMembership.paymentStatus}`} style={{padding:"1px 8px"}}>{myMembership.paymentStatus}</span>
                    </div>
                    {myMembership.expiresAt && (
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                        <span style={{color:"var(--muted)"}}>Expires</span>
                        <span style={{fontSize:"0.75rem"}}>{new Date(myMembership.expiresAt).toLocaleDateString()}</span>
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
