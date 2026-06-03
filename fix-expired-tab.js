const fs = require('fs');
const file = 'frontend/src/pages/AdminDashboardPage.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Fix exclusion list ─────────────────────────────────────────────────
const before = '!["pending-payments","groups","newsletter","group-review","org-email","payouts"].includes(tab)';
const after  = '!["pending-payments","groups","newsletter","group-review","org-email","payouts","expired"].includes(tab)';

if (src.includes(before)) {
  src = src.replace(before, after);
  console.log('✓ Fixed exclusion list');
} else {
  console.log('⚠ Exclusion list pattern not found');
}

// ── 2. Add deleteExpiredMember function after remindExpiredOne ────────────
const fnAnchor = '  async function remindExpiredOne(memberId) {\n    setBusy(b => ({ ...b, [memberId]: true })); setExpiredMsg(null);\n    try { const r = await api.remindExpiredMember(memberId); setExpiredMsg({ type: "ok", text: r.message }); }\n    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }\n    finally { setBusy(b => ({ ...b, [memberId]: false })); }\n  }';

const fnReplacement = `  async function remindExpiredOne(memberId) {
    setBusy(b => ({ ...b, [memberId]: true })); setExpiredMsg(null);
    try { const r = await api.remindExpiredMember(memberId); setExpiredMsg({ type: "ok", text: r.message }); }
    catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setBusy(b => ({ ...b, [memberId]: false })); }
  }

  async function deleteExpiredMember(memberId, name) {
    if (!window.confirm("Remove " + name + " from this group? This will delete their membership record.")) return;
    setBusy(b => ({ ...b, ["del_" + memberId]: true })); setExpiredMsg(null);
    try {
      await api.deleteGroupMember(memberId);
      setExpiredMsg({ type: "ok", text: name + " removed successfully." });
      loadExpiredMembers();
    } catch (err) { setExpiredMsg({ type: "err", text: err.message }); }
    finally { setBusy(b => ({ ...b, ["del_" + memberId]: false })); }
  }`;

if (!src.includes("deleteExpiredMember")) {
  src = src.replace(fnAnchor, fnReplacement);
  console.log('✓ deleteExpiredMember function added');
} else {
  console.log('⚠ deleteExpiredMember already exists');
}

// ── 3. Add delete button next to Send Reminder button in expired list ─────
const btnAnchor = `                <button className="btn btn-sm btn-primary"
                  style={{whiteSpace:"nowrap",background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}
                  disabled={busy[m.id]} onClick={()=>remindExpiredOne(m.id)}>
                  {busy[m.id] ? <><span className="spinner"/> Sending…</> : "📧 Send Reminder"}
                </button>`;

const btnReplacement = `                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <button className="btn btn-sm btn-primary"
                    style={{whiteSpace:"nowrap",background:"linear-gradient(90deg,#f59e0b,#ef4444)",border:"none"}}
                    disabled={busy[m.id]} onClick={()=>remindExpiredOne(m.id)}>
                    {busy[m.id] ? <><span className="spinner"/> Sending…</> : "📧 Send Reminder"}
                  </button>
                  <button className="btn btn-sm btn-danger"
                    style={{whiteSpace:"nowrap"}}
                    disabled={busy["del_" + m.id]}
                    onClick={()=>deleteExpiredMember(m.id, m.name)}>
                    {busy["del_" + m.id] ? <><span className="spinner"/> Deleting…</> : "🗑️ Remove"}
                  </button>
                </div>`;

if (!src.includes("deleteExpiredMember(m.id")) {
  src = src.replace(btnAnchor, btnReplacement);
  console.log('✓ Delete button added to expired list');
} else {
  console.log('⚠ Delete button already exists');
}

fs.writeFileSync(file, src);
console.log('✓ AdminDashboardPage.js written');
