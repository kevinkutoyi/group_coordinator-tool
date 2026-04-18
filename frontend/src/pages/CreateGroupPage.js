import React, { useEffect, useState } from "react";
import { api, session } from "../api";
import "./CreateGroupPage.css";

export default function CreateGroupPage({ navigate }) {
  const [services, setServices]       = useState([]);
  const [selectedService, setSvc]     = useState(null);
  const [selectedPlan, setPlan]       = useState(null);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState("");
  const [form, setForm] = useState({
    serviceId: "", planName: "", totalPrice: "", maxSlots: "", description: "",
  });

  useEffect(() => {
    // Moderator/superadmin only
    if (!session.isLoggedIn()) { navigate("login"); return; }
    if (!["moderator","superadmin"].includes(session.getRole())) { navigate("groups"); return; }
    api.getServices().then(setServices).catch(() => setError("Could not load services."));
  }, []);

  function handleServiceChange(e) {
    const svc = services.find(s => s.id === e.target.value);
    setSvc(svc || null); setPlan(null);
    setForm(f => ({ ...f, serviceId: e.target.value, planName: "", totalPrice: "", maxSlots: "" }));
  }

  function handlePlanChange(e) {
    const plan = selectedService?.plans.find(p => p.name === e.target.value);
    setPlan(plan || null);
    setForm(f => ({ ...f, planName: e.target.value, totalPrice: plan ? plan.price : "", maxSlots: plan ? plan.maxSlots : "" }));
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const pricePerSlot = form.totalPrice && form.maxSlots
    ? (parseFloat(form.totalPrice) / parseInt(form.maxSlots)).toFixed(2)
    : null;

  const feePercent = 2;
  const memberPays = pricePerSlot
    ? (parseFloat(pricePerSlot) * (1 + feePercent / 100)).toFixed(2)
    : null;

  async function handleSubmit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const group = await api.createGroup({
        serviceId:  form.serviceId,
        planName:   form.planName,
        totalPrice: parseFloat(form.totalPrice),
        maxSlots:   parseInt(form.maxSlots),
        description: form.description,
      });
      navigate("group", group.id);
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  }

  const user = session.getUser();

  return (
    <div className="create-page fade-in">
      <div>
        <h1 className="page-title">Create a Group</h1>
        <p className="page-sub">Set up a group-buy for an official family or group subscription plan.</p>
      </div>

      <div className="create-layout">
        <form className="card create-form" onSubmit={handleSubmit}>
          <h2 className="create-section-title">Subscription Details</h2>

          <div className="form-group">
            <label>Service</label>
            <select required value={form.serviceId} onChange={handleServiceChange}>
              <option value="">— Choose a service —</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>

          {selectedService && (
            <div className="form-group">
              <label>Plan</label>
              <select required value={form.planName} onChange={handlePlanChange}>
                <option value="">— Choose a plan —</option>
                {selectedService.plans.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} — ${p.price}/mo · up to {p.maxSlots} people
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedPlan && (
            <div className="form-row">
              <div className="form-group">
                <label>Total Plan Price ($/mo)</label>
                <input type="number" step="0.01" required value={form.totalPrice} onChange={set("totalPrice")} />
              </div>
              <div className="form-group">
                <label>Max Slots</label>
                <input type="number" min="2" max={selectedPlan.maxSlots} required value={form.maxSlots} onChange={set("maxSlots")} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Description (optional)</label>
            <textarea rows={3} value={form.description} onChange={set("description")}
              placeholder="e.g. Looking for 3 more people to split Spotify Family. Pay via M-Pesa."
              style={{ resize:"vertical" }} />
          </div>

          {/* Organizer info — auto-populated from logged-in user */}
          <div className="organizer-info-box">
            <div className="org-label">👤 Group Organizer (you)</div>
            <div className="org-name">{user?.name}</div>
            <div className="org-email">{user?.email}</div>
          </div>

          {error && <div className="msg-box msg-err" style={{ marginBottom:8 }}>{error}</div>}

          <button type="submit" className="btn btn-primary" style={{ width:"100%" }} disabled={busy}>
            {busy ? <><span className="spinner"/> Creating…</> : "🚀 Create Group"}
          </button>
        </form>

        <div className="create-sidebar">
          <div className="card preview-card">
            <h2 className="create-section-title">Live Preview</h2>
            {!selectedPlan ? (
              <p className="preview-empty">Select a service and plan to see your group preview.</p>
            ) : (
              <>
                <div className="preview-icon">{selectedService.icon}</div>
                <h3 className="preview-title">{selectedService.name}</h3>
                <p className="preview-plan">{selectedPlan.name}</p>
                {pricePerSlot && (
                  <div className="preview-price">
                    <span className="preview-big">${pricePerSlot}</span>
                    <span className="preview-sub">/person/mo</span>
                  </div>
                )}
                <div className="preview-breakdown">
                  <div className="pb-row"><span>Full plan cost</span><span>${form.totalPrice || "—"}/mo</span></div>
                  <div className="pb-row"><span>Slots</span><span>{form.maxSlots || "—"} people</span></div>
                  <div className="pb-row"><span>Members pay (incl. 2% fee)</span><span>{memberPays ? `$${memberPays}` : "—"}/mo</span></div>
                  <div className="pb-row pb-save">
                    <span>Each member saves</span>
                    <span>{pricePerSlot ? `$${(parseFloat(form.totalPrice) - parseFloat(pricePerSlot)).toFixed(2)}/mo` : "—"}</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="info-box">
            <strong>⚖️ Organizer Responsibilities</strong><br />
            You hold the subscription and coordinate payments. Only create groups for official family/group plans.
          </div>
        </div>
      </div>
    </div>
  );
}
