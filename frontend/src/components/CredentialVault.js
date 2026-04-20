import React, { useEffect, useState, useCallback } from "react";
import { api, session } from "../api";
import "./CredentialVault.css";

// ── Copy to clipboard helper ───────────────────────────────────────────────
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
  const display = secret && !reveal ? "•".repeat(Math.min(value.length, 18)) : value;

  return (
    <div className="cv-field">
      <div className="cv-field-label">{label}</div>
      <div className="cv-field-row">
        <span className={`cv-field-value ${secret && !reveal ? "cv-masked" : ""}`}>
          {display}
        </span>
        <div className="cv-field-actions">
          {secret && (
            <button
              className="cv-icon-btn"
              onClick={() => setReveal(r => !r)}
              title={reveal ? "Hide" : "Reveal"}
            >
              {reveal ? "🙈" : "👁️"}
            </button>
          )}
          <button
            className={`cv-copy-btn ${copied[copyKey] ? "copied" : ""}`}
            onClick={() => copy(copyKey, value)}
            title="Copy to clipboard"
          >
            {copied[copyKey] ? (
              <><span className="cv-copy-check">✓</span> Copied!</>
            ) : (
              <><span className="cv-copy-icon">⎘</span> Copy</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Slot editor for organizer ─────────────────────────────────────────────
function SlotEditor({ slot, index, onChange, onRemove, canRemove }) {
  const set = k => e => onChange(index, { ...slot, [k]: e.target.value });
  return (
    <div className="cv-slot-editor">
      <div className="cv-slot-editor-head">
        <span className="cv-slot-num">Slot {index + 1}</span>
        {canRemove && (
          <button className="cv-remove-btn" onClick={() => onRemove(index)} title="Remove slot">✕</button>
        )}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Label (e.g. "Profile 1" or "Shared Account")</label>
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
          <input value={slot.password} onChange={set("password")} placeholder="••••••••••" autoComplete="new-password" type="text" />
        </div>
      </div>
      <div className="form-group">
        <label>Extra Note (PIN, profile name, invite link, etc.)</label>
        <input value={slot.note} onChange={set("note")} placeholder="e.g. Use Profile 2 only · PIN: 1234" />
      </div>
    </div>
  );
}

// ── Main Vault Component ───────────────────────────────────────────────────
export default function CredentialVault({ groupId, groupName, serviceName, serviceIcon, maxSlots }) {
  const [creds, setCreds]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [editSlots, setEditSlots]   = useState([]);
  const [editNote, setEditNote]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { copied, copy } = useCopy();

  const isOrganizer  = session.isSuperAdmin() || session.isModerator();
  const canManage    = session.isSuperAdmin() ||
    (session.isModerator());  // further check done on server

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.getCredentials(groupId);
      setCreds(data);
    } catch (err) {
      // 403 = not paid yet — show gated view
      if (err.message.includes("denied") || err.message.includes("payment")) {
        setCreds({ locked: true, requiresPayment: true });
      } else {
        setError(err.message);
      }
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    const slots = creds?.exists && creds.slots?.length > 0
      ? creds.slots.map(s => ({ label: s.label, username: s.username, password: s.password, note: s.note }))
      : [{ label: "", username: "", password: "", note: "" }];
    setEditSlots(slots);
    setEditNote(creds?.generalNote || "");
    setEditing(true);
    setSaveMsg(null);
  }

  function addSlot() {
    setEditSlots(s => [...s, { label: "", username: "", password: "", note: "" }]);
  }

  function updateSlot(i, val) {
    setEditSlots(s => s.map((slot, idx) => idx === i ? val : slot));
  }

  function removeSlot(i) {
    setEditSlots(s => s.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const filled = editSlots.filter(s => s.username || s.password);
    if (filled.length === 0) {
      setSaveMsg({ type:"err", text:"Add at least one slot with a username or password." });
      return;
    }
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

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="cv-wrap cv-loading">
      <span className="spinner"/>
      <span>Loading vault…</span>
    </div>
  );

  if (error) return (
    <div className="cv-wrap">
      <div className="cv-error">{error}</div>
    </div>
  );

  // Locked — payment required
  if (creds?.locked) return (
    <div className="cv-wrap cv-locked">
      <div className="cv-lock-icon">🔒</div>
      <h3 className="cv-lock-title">Credential Vault Locked</h3>
      <p className="cv-lock-desc">
        Complete your payment to unlock secure access to the {serviceName} credentials.
        Once confirmed, this vault opens automatically.
      </p>
      <div className="cv-lock-hint">
        <span>💳</span> Pay via PesaPal above to unlock
      </div>
    </div>
  );

  // ── Edit mode ─────────────────────────────────────────────────────────────
  if (editing) return (
    <div className="cv-wrap cv-edit-mode">
      <div className="cv-edit-header">
        <div className="cv-edit-icon">{serviceIcon} 🔑</div>
        <div>
          <h3 className="cv-edit-title">Set Access Credentials</h3>
          <p className="cv-edit-sub">
            Add one slot per member or use a shared account. Only confirmed paying members can view these.
          </p>
        </div>
      </div>

      <div className="cv-slots-list">
        {editSlots.map((slot, i) => (
          <SlotEditor
            key={i} slot={slot} index={i}
            onChange={updateSlot}
            onRemove={removeSlot}
            canRemove={editSlots.length > 1}
          />
        ))}
      </div>

      {editSlots.length < maxSlots && (
        <button className="cv-add-slot-btn" onClick={addSlot}>
          + Add Another Slot
        </button>
      )}

      <div className="form-group" style={{ marginTop:16 }}>
        <label>General Note (shown to all members)</label>
        <textarea rows={3} value={editNote} onChange={e => setEditNote(e.target.value)}
          placeholder="e.g. Use incognito mode. Don't change the password. Contact me if you have issues."
          style={{ resize:"vertical" }} />
      </div>

      {saveMsg && (
        <div className={`cv-save-msg ${saveMsg.type === "ok" ? "cv-msg-ok" : "cv-msg-err"}`}>
          {saveMsg.text}
        </div>
      )}

      <div className="cv-edit-actions">
        <button className="btn btn-outline" onClick={() => { setEditing(false); setSaveMsg(null); }}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner"/> Saving…</> : "💾 Save Credentials"}
        </button>
      </div>
    </div>
  );

  // ── View mode — no credentials yet ────────────────────────────────────────
  if (!creds?.exists) return (
    <div className="cv-wrap cv-empty">
      <div className="cv-empty-icon">🔐</div>
      <h3 className="cv-empty-title">Credential Vault — Empty</h3>
      {canManage ? (
        <>
          <p className="cv-empty-desc">
            Set the access credentials for this group. Once saved, confirmed paying members
            will be able to view them here securely.
          </p>
          <button className="btn btn-primary cv-set-btn" onClick={startEdit}>
            🔑 Set Credentials Now
          </button>
        </>
      ) : (
        <p className="cv-empty-desc">
          The group coordinator hasn't set the access credentials yet.
          You'll be notified by email as soon as they're available.
        </p>
      )}
    </div>
  );

  // ── View mode — credentials available ─────────────────────────────────────
  return (
    <div className="cv-wrap cv-view-mode">
      {/* Vault header */}
      <div className="cv-vault-header">
        <div className="cv-vault-icon-wrap">
          <span className="cv-vault-service-icon">{serviceIcon}</span>
          <span className="cv-vault-key">🔑</span>
        </div>
        <div className="cv-vault-title-block">
          <h3 className="cv-vault-title">Access Credentials</h3>
          <p className="cv-vault-subtitle">
            Secured vault · {creds.slots.length} slot{creds.slots.length !== 1 ? "s" : ""} ·
            Updated {new Date(creds.updatedAt).toLocaleDateString()}
          </p>
        </div>
        {canManage && (
          <div className="cv-manage-btns">
            <button className="btn btn-sm btn-outline" onClick={startEdit}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>
        )}
      </div>

      {/* General note */}
      {creds.generalNote && (
        <div className="cv-general-note">
          <span className="cv-note-icon">📌</span>
          <span>{creds.generalNote}</span>
        </div>
      )}

      {/* Credential slots */}
      <div className="cv-slots">
        {creds.slots.map((slot, i) => (
          <div key={i} className="cv-slot">
            <div className="cv-slot-header">
              <span className="cv-slot-badge">#{slot.slotNumber || i + 1}</span>
              <span className="cv-slot-label">{slot.label}</span>
              <button
                className="cv-copy-all-btn"
                onClick={() => {
                  const text = `${slot.label}\nUsername: ${slot.username}\nPassword: ${slot.password}${slot.note ? `\nNote: ${slot.note}` : ""}`;
                  copy(`slot-all-${i}`, text);
                }}
              >
                {copied[`slot-all-${i}`] ? "✓ Copied!" : "⎘ Copy All"}
              </button>
            </div>

            <div className="cv-fields">
              <CopyField
                label="Email / Username"
                value={slot.username}
                secret={false}
                copyKey={`u-${i}`}
                copied={copied}
                copy={copy}
              />
              <CopyField
                label="Password"
                value={slot.password}
                secret={true}
                copyKey={`p-${i}`}
                copied={copied}
                copy={copy}
              />
              {slot.note && (
                <CopyField
                  label="Note"
                  value={slot.note}
                  secret={false}
                  copyKey={`n-${i}`}
                  copied={copied}
                  copy={copy}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Security notice */}
      <div className="cv-security-notice">
        <span>🛡️</span>
        <span>
          Keep these credentials private. Do not share screenshots or forward this page.
          Your access is tied to your confirmed membership.
        </span>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="modal">
            <h3>Clear Credentials?</h3>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>
              This will permanently delete all stored credentials for this group.
              Members will lose access to the vault until you set new ones.
            </p>
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
