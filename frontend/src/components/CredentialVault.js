import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import "./CredentialVault.css";

// ── Copy helper ────────────────────────────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState({});
  function copy(key, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    });
  }
  return { copied, copy };
}

// ── Single field with copy button ─────────────────────────────────────────
function CopyField({ label, value, secret, copyKey, copied, copy }) {
  const [reveal, setReveal] = useState(false);
  if (!value) return null;
  const display = secret && !reveal ? "•".repeat(Math.min(value.length, 16)) : value;

  return (
    <div className="cv-field">
      <div className="cv-field-label">{label}</div>
      <div className="cv-field-row">
        <span className={`cv-field-value ${secret && !reveal ? "cv-masked" : ""}`}>{display}</span>
        <div className="cv-field-actions">
          {secret && (
            <button className="cv-icon-btn" onClick={() => setReveal(r => !r)} title={reveal ? "Hide" : "Reveal"}>
              {reveal ? "🙈" : "👁️"}
            </button>
          )}
          <button className={`cv-copy-btn ${copied[copyKey] ? "copied" : ""}`} onClick={() => copy(copyKey, value)}>
            {copied[copyKey] ? <><span className="cv-copy-check">✓</span> Copied!</> : <><span className="cv-copy-icon">⎘</span> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Slot editor ────────────────────────────────────────────────────────────
function SlotEditor({ slot, index, onChange, onRemove, canRemove }) {
  const set = k => e => onChange(index, { ...slot, [k]: e.target.value });
  return (
    <div className="cv-slot-editor">
      <div className="cv-slot-editor-head">
        <span className="cv-slot-num">Slot {index + 1}</span>
        {canRemove && (
          <button className="cv-remove-btn" onClick={() => onRemove(index)}>✕</button>
        )}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Label</label>
          <input value={slot.label} onChange={set("label")} placeholder={`Slot ${index + 1}`} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Email / Username</label>
          <input value={slot.username} onChange={set("username")} placeholder="shared@email.com" autoComplete="off" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input value={slot.password} onChange={set("password")} placeholder="password here" type="text" autoComplete="new-password" />
        </div>
      </div>
      <div className="form-group">
        <label>Extra Note (PIN, profile, invite link, etc.)</label>
        <input value={slot.note} onChange={set("note")} placeholder="e.g. Use Profile 2 · PIN: 1234" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CredentialVault({
  groupId, groupName, serviceName, serviceIcon, maxSlots,
  // CTA callbacks passed from GroupDetailPage
  onJoin, onLogin, groupStatus, isLoggedIn, isCustomer, isMyMember, isOrganizer,
}) {
  const [creds, setCreds]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [editSlots, setEditSlots] = useState([]);
  const [editNote, setEditNote]   = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { copied, copy } = useCopy();
  // canManage: superadmin, any moderator, or the group organizer (who is typically a moderator)
  const canManage = session.isSuperAdmin() || session.isModerator() || isOrganizer;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.getCredentials(groupId);
      setCreds(data);
    } catch (err) {
      if (err.message.includes("denied") || err.message.includes("payment")) {
        setCreds({ locked: true });
      } else {
        setError(err.message);
      }
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    const slots = creds?.exists && creds.slots?.length > 0
      ? creds.slots.map(s => ({ label:s.label, username:s.username, password:s.password, note:s.note }))
      : [{ label:"", username:"", password:"", note:"" }];
    setEditSlots(slots);
    setEditNote(creds?.generalNote || "");
    setEditing(true);
    setSaveMsg(null);
  }

  async function handleSave() {
    const filled = editSlots.filter(s => s.username || s.password);
    if (!filled.length) { setSaveMsg({ type:"err", text:"Add at least one slot with credentials." }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      await api.saveCredentials(groupId, { slots: editSlots, generalNote: editNote });
      setSaveMsg({ type:"ok", text:"Credentials saved! Confirmed members have been notified." });
      setEditing(false);
      load();
    } catch (err) { setSaveMsg({ type:"err", text: err.message }); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      await api.deleteCredentials(groupId);
      setConfirmDelete(false);
      setCreds({ exists: false, slots: [] });
    } catch (err) { setSaveMsg({ type:"err", text: err.message }); }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="cv-wrap cv-loading">
      <span className="spinner"/><span>Loading vault…</span>
    </div>
  );

  if (error) return (
    <div className="cv-wrap"><div className="cv-error">{error}</div></div>
  );

  // ── LOCKED — the attention-grabbing teaser ─────────────────────────────
  if (creds?.locked) {
    const canJoin = groupStatus === "open" && isCustomer && !isMyMember && !isOrganizer;
    const needsLogin = !isLoggedIn;

    return (
      <div className="cv-wrap cv-locked-teaser">
        {/* Animated shimmer sweep across the whole card */}
        <div className="cvt-shimmer" />

        {/* Top label */}
        <div className="cvt-top-label">
          <span className="cvt-key-icon">🔑</span>
          <span>Access Credentials Vault</span>
          <span className="cvt-live-badge">LIVE</span>
        </div>

        {/* Blurred fake credential preview — entices the user */}
        <div className="cvt-preview-area">
          <div className="cvt-preview-slot">
            <div className="cvt-preview-slot-label">
              <span className="cvt-slot-dot" />
              {serviceName} Account
            </div>
            <div className="cvt-fake-fields">
              <div className="cvt-fake-field">
                <span className="cvt-fake-label">EMAIL</span>
                <span className="cvt-fake-value cvt-blur">shared.account@example.com</span>
                <span className="cvt-fake-copy">⎘</span>
              </div>
              <div className="cvt-fake-field">
                <span className="cvt-fake-label">PASSWORD</span>
                <span className="cvt-fake-value cvt-blur cvt-mono">••••••••••••••</span>
                <span className="cvt-fake-copy">⎘</span>
              </div>
            </div>
          </div>
          {/* Overlay on top of blurred fields */}
          <div className="cvt-blur-overlay">
            <div className="cvt-lock-badge">
              <span className="cvt-lock-emoji">🔒</span>
              <span className="cvt-lock-text">Locked</span>
            </div>
          </div>
        </div>

        {/* What's inside */}
        <div className="cvt-perks">
          <div className="cvt-perk">✅ Instant access to credentials after payment</div>
          <div className="cvt-perk">✅ Password reveal toggle + one-click copy</div>
          <div className="cvt-perk">✅ Email notification when credentials update</div>
        </div>

        {/* CTA */}
        <div className="cvt-cta-area">
          {needsLogin ? (
            <>
              <p className="cvt-cta-hint">Sign in to join this group and unlock the credential vault.</p>
              <button className="cvt-cta-btn" onClick={onLogin}>
                🔓 Sign In to Unlock
              </button>
            </>
          ) : canJoin ? (
            <>
              <p className="cvt-cta-hint">
                Join for <strong>${/* shown dynamically */}</strong> — credentials unlock instantly after payment.
              </p>
              <button className="cvt-cta-btn" onClick={onJoin}>
                🔓 Join & Unlock Credentials
              </button>
            </>
          ) : isMyMember ? (
            <p className="cvt-cta-hint cvt-pending-hint">
              ⏳ Complete your payment above — the vault unlocks automatically once confirmed.
            </p>
          ) : (
            <p className="cvt-cta-hint">
              {groupStatus === "full" ? "This group is full — check back for openings." : "Credentials locked."}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Empty — no credentials set yet ────────────────────────────────────────
  if (!creds?.exists) return (
    <div className="cv-wrap cv-empty">
      <div className="cv-empty-icon">🔐</div>
      <h3 className="cv-empty-title">Credential Vault</h3>
      {canManage ? (
        <>
          <p className="cv-empty-desc">Set the access credentials. Confirmed paying members will see them here immediately.</p>
          <button className="btn btn-primary cv-set-btn" onClick={startEdit}>🔑 Set Credentials Now</button>
        </>
      ) : (
        <p className="cv-empty-desc">Your coordinator hasn't added credentials yet. You'll be notified by email the moment they do.</p>
      )}
    </div>
  );

  // ── Edit mode ─────────────────────────────────────────────────────────────
  if (editing) return (
    <div className="cv-wrap cv-edit-mode">
      <div className="cv-edit-header">
        <div className="cv-edit-icon">{serviceIcon} 🔑</div>
        <div>
          <h3 className="cv-edit-title">Set Access Credentials</h3>
          <p className="cv-edit-sub">Only confirmed paying members can view these. They are notified on every update.</p>
        </div>
      </div>
      <div className="cv-slots-list">
        {editSlots.map((slot, i) => (
          <SlotEditor key={i} slot={slot} index={i} onChange={(idx, val) => setEditSlots(s => s.map((x, j) => j===idx?val:x))} onRemove={i => setEditSlots(s => s.filter((_,j)=>j!==i))} canRemove={editSlots.length > 1} />
        ))}
      </div>
      {editSlots.length < maxSlots && (
        <button className="cv-add-slot-btn" onClick={() => setEditSlots(s => [...s, {label:"",username:"",password:"",note:""}])}>+ Add Another Slot</button>
      )}
      <div className="form-group" style={{marginTop:16}}>
        <label>General Note (visible to all members)</label>
        <textarea rows={3} value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="e.g. Use incognito mode. Don't change the password." style={{resize:"vertical"}}/>
      </div>
      {saveMsg && <div className={`cv-save-msg ${saveMsg.type==="ok"?"cv-msg-ok":"cv-msg-err"}`}>{saveMsg.text}</div>}
      <div className="cv-edit-actions">
        <button className="btn btn-outline" onClick={() => { setEditing(false); setSaveMsg(null); }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <><span className="spinner"/> Saving…</> : "💾 Save Credentials"}</button>
      </div>
    </div>
  );

  // ── View mode — credentials visible ───────────────────────────────────────
  return (
    <div className="cv-wrap cv-view-mode">
      <div className="cv-vault-header">
        <div className="cv-vault-icon-wrap">
          <span className="cv-vault-service-icon">{serviceIcon}</span>
          <span className="cv-vault-key">🔑</span>
        </div>
        <div className="cv-vault-title-block">
          <h3 className="cv-vault-title">🔓 Access Credentials Unlocked</h3>
          <p className="cv-vault-subtitle">
            {creds.slots.length} slot{creds.slots.length !== 1 ? "s" : ""} · Updated {new Date(creds.updatedAt).toLocaleDateString()}
          </p>
        </div>
        {canManage && (
          <div className="cv-manage-btns">
            <button className="btn btn-sm btn-outline" onClick={startEdit}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>
        )}
      </div>

      {creds.generalNote && (
        <div className="cv-general-note"><span className="cv-note-icon">📌</span><span>{creds.generalNote}</span></div>
      )}

      <div className="cv-slots">
        {creds.slots.map((slot, i) => (
          <div key={i} className="cv-slot">
            <div className="cv-slot-header">
              <span className="cv-slot-badge">#{slot.slotNumber || i+1}</span>
              <span className="cv-slot-label">{slot.label}</span>
              <button className="cv-copy-all-btn" onClick={() => copy(`slot-all-${i}`, `${slot.label}\nUsername: ${slot.username}\nPassword: ${slot.password}${slot.note?`\nNote: ${slot.note}`:""}`)}>
                {copied[`slot-all-${i}`] ? "✓ Copied!" : "⎘ Copy All"}
              </button>
            </div>
            <div className="cv-fields">
              <CopyField label="Email / Username" value={slot.username} secret={false} copyKey={`u-${i}`} copied={copied} copy={copy} />
              <CopyField label="Password" value={slot.password} secret={true} copyKey={`p-${i}`} copied={copied} copy={copy} />
              {slot.note && <CopyField label="Note" value={slot.note} secret={false} copyKey={`n-${i}`} copied={copied} copy={copy} />}
            </div>
          </div>
        ))}
      </div>

      <div className="cv-security-notice">
        <span>🛡️</span>
        <span>Keep these credentials private. Do not share screenshots or forward this page. Your access is tied to your confirmed membership.</span>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setConfirmDelete(false)}>
          <div className="modal">
            <h3>Clear Credentials?</h3>
            <p style={{color:"var(--muted)",fontSize:"0.85rem"}}>Members will lose vault access until you set new credentials.</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
