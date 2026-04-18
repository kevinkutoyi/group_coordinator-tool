import React, { useEffect, useState } from "react";
import GroupCard from "../components/GroupCard";
import { api, session } from "../api";

export default function GroupsPage({ navigate }) {
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");

  useEffect(() => {
    api.getGroups()
      .then(setGroups)
      .catch(() => alert("Could not load groups. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = ["moderator","superadmin"].includes(session.getRole());

  const filtered = groups.filter(g => {
    const matchFilter = filter === "all" || g.status === filter;
    const q = search.toLowerCase();
    const matchSearch = (g.serviceName||"").toLowerCase().includes(q) ||
      (g.planName||"").toLowerCase().includes(q) ||
      (g.organizerName||"").toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <div className="fade-in">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, marginBottom:28 }}>
        <div>
          <h1 className="page-title">Browse Groups</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>Find an open slot in an existing group</p>
        </div>
        {canCreate
          ? <button className="btn btn-primary" onClick={() => navigate("create")}>+ Create Group</button>
          : !session.isLoggedIn() && (
            <button className="btn btn-outline" onClick={() => navigate("signup")}>Sign Up to Join</button>
          )
        }
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:28 }}>
        <input
          placeholder="Search by service, plan, organizer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth:300 }}
        />
        {["all","open","full","closed"].map(f => (
          <button key={f}
            className={`btn btn-sm ${filter===f ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:60 }}><span className="spinner"/></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🔍</div>
          <h3>No groups found</h3>
          <p>Try a different filter, or check back soon for new groups.</p>
        </div>
      ) : (
        <div className="grid-2">
          {filtered.map(g => (
            <GroupCard key={g.id} group={g} onClick={() => navigate("group", g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
