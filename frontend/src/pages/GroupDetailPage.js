import React, { useEffect, useState } from "react";
import { api } from "../api";
import "./GroupDetailPage.css";

export default function GroupDetailPage({ id, navigate }) {
  const [group, setGroup]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [showPay, setShowPay]   = useState(false);
  const [payMember, setPayMember] = useState(null);
  const [joinForm, setJoinForm] = useState({ name:"", email:"" });
  const [payForm, setPayForm]   = useState({ amount:"", method:"bank_transfer", note:"" });
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState(null);

  const reload = () =>
    api.getGroup(id).then(setGroup).catch(() => navigate("groups"));

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  async function handleJoin(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.joinGroup(id, joinForm);
      setMsg({ type:"ok", text:"You've joined! The organizer will contact you with access details." });
      setShowJoin(false);
      setJoinForm({ name:"", email:"" });
      reload();
    } catch (err) {
      setMsg({ type:"err", text: err.message });
    } finally { setBusy(false); }
  }

  async function handlePay(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.recordPayment(id, { memberId: payMember.id, ...payForm });
      setMsg({ type:"ok", text:`Payment recorded for ${payMember.name}.` });
      setShowPay(false);
      setPayMember(null);
      reload();
    } catch (err) {
      setMsg({ type:"err", text: err.message });
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{textAlign:"center",padding:80}}><span className="spinner"/></div>;
  if (!group)  return null;

  const filled = group.members?.length || 0;
  const pct    = Math.round((filled / group.maxSlots) * 100);

  return (
    <div className="gd fade-in">
      <button className="btn btn-outline btn-sm" onClick={() => navigate("groups")} style={{marginBottom:20}}>
        ← Back to Groups
      </button>

      {msg && (
        <div className={`msg-box ${msg.type === "ok" ? "msg-ok" : "msg-err"}`} onClick={() => setMsg(null)}>
          {msg.text} <span style={{opacity:.5}}>✕</span>
        </div>
      )}

      {/* Header */}
      <div className="gd-header card">
        <div className="gd-hero">
          <span className="gd-icon">{group.serviceIcon}</span>
          <div>
            <h1 className="gd-title">{group.serviceName} — {group.planName}</h1>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
              <span className={`tag tag-${group.status}`}>
                {group.status === "open" ? "● Open" : group.status === "full" ? "● Full" : "Closed"}
              </span>
              <span style={{fontSize:"0.78rem",color:"var(--muted)"}}>
                Created {new Date(group.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          {group.status === "open" && (
            <button className="btn btn-primary" style={{marginLeft:"auto"}} onClick={() => setShowJoin(true)}>
              Join Group
            </button>
          )}
        </div>

        {group.description && <p className="gd-desc">{group.description}</p>}

        <div className="gd-stats">
          <div className="gd-stat">
            <div className="gd-stat-val">${group.pricePerSlot}<span>/mo</span></div>
            <div className="gd-stat-lbl">Your Share</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">${group.totalPrice}<span>/mo</span></div>
            <div className="gd-stat-lbl">Full Plan Cost</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">${(group.totalPrice - group.pricePerSlot).toFixed(2)}<span>/mo</span></div>
            <div className="gd-stat-lbl">You Save</div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-val">{filled}<span>/{group.maxSlots}</span></div>
            <div className="gd-stat-lbl">Members</div>
          </div>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width:`${pct}%` }} />
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem",color:"var(--muted)",marginTop:4}}>
          <span>{filled} / {group.maxSlots} slots filled</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Two-column */}
      <div className="gd-cols">
        {/* Members */}
        <div className="card">
          <h2 className="section-h2">Members</h2>
          {group.members?.length === 0 ? (
            <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No members yet.</p>
          ) : group.members.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-avatar">{m.name[0].toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">{m.name} {m.role === "organizer" && <span className="organizer-badge">Organizer</span>}</div>
                <div className="member-email">{m.email}</div>
              </div>
              <span className={`tag tag-${m.paymentStatus}`}>{m.paymentStatus}</span>
              {m.paymentStatus === "pending" && (
                <button className="btn btn-sm btn-outline" onClick={() => { setPayMember(m); setPayForm(f=>({...f,amount:group.pricePerSlot})); setShowPay(true); }}>
                  Mark Paid
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Info */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="card">
            <h2 className="section-h2">Organizer Contact</h2>
            <p style={{fontSize:"0.9rem"}}>{group.organizerName}</p>
            <p style={{fontSize:"0.85rem",color:"var(--muted)"}}>{group.organizerEmail}</p>
          </div>

          <div className="info-box">
            <strong>💡 Payment Info</strong><br/>
            Coordinate payment directly with the organizer. Use the "Mark Paid" button to track payments once received. We recommend using a trusted transfer method (bank transfer, PayPal, M-Pesa, etc.).
          </div>

          <div className="card">
            <h2 className="section-h2">Payment Log</h2>
            {group.payments?.length === 0 ? (
              <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>No payments recorded yet.</p>
            ) : group.payments.map(p => (
              <div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:"0.83rem",display:"flex",justifyContent:"space-between"}}>
                <span>{p.memberName}</span>
                <span style={{color:"var(--success)",fontWeight:600}}>${p.amount} — {p.method}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Join Modal */}
      {showJoin && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowJoin(false)}>
          <div className="modal">
            <h3>Join {group.serviceName} Group</h3>
            <div className="info-box" style={{marginBottom:16}}>
              You'll pay <strong>${group.pricePerSlot}/month</strong>. The organizer will share your account slot details after payment.
            </div>
            <form onSubmit={handleJoin}>
              <div className="form-group">
                <label>Your Name</label>
                <input required value={joinForm.name} onChange={e=>setJoinForm(f=>({...f,name:e.target.value}))} placeholder="Jane Doe"/>
              </div>
              <div className="form-group">
                <label>Your Email</label>
                <input required type="email" value={joinForm.email} onChange={e=>setJoinForm(f=>({...f,email:e.target.value}))} placeholder="jane@email.com"/>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <><span className="spinner"/>Joining…</> : "Confirm Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPay && payMember && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPay(false)}>
          <div className="modal">
            <h3>Record Payment — {payMember.name}</h3>
            <form onSubmit={handlePay}>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount ($)</label>
                  <input required type="number" step="0.01" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label>Method</label>
                  <select value={payForm.method} onChange={e=>setPayForm(f=>({...f,method:e.target.value}))}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="paypal">PayPal</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input value={payForm.note} onChange={e=>setPayForm(f=>({...f,note:e.target.value}))} placeholder="e.g. Ref: ABC123"/>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowPay(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <><span className="spinner"/>Saving…</> : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
