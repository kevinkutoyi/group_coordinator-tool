const fs = require('fs');

// ── 1. api.js — add sendUserEmail ─────────────────────────────────────────
const apiFile = 'frontend/src/api.js';
let apiLines = fs.readFileSync(apiFile, 'utf8').split('\n');

if (!apiLines.some(l => l.includes('sendUserEmail'))) {
  const idx = apiLines.findIndex(l => l.includes('deleteGroupMember'));
  apiLines.splice(idx + 1, 0,
    '  sendUserEmail:          (body) => req("/admin/users/email", { method: "POST", body }),'
  );
  fs.writeFileSync(apiFile, apiLines.join('\n'));
  console.log('✓ sendUserEmail added to api.js');
} else {
  console.log('⚠ sendUserEmail already exists');
}

// ── 2. server.js — add POST /api/admin/users/email endpoint ───────────────
const serverFile = 'backend/src/server.js';
let serverLines = fs.readFileSync(serverFile, 'utf8').split('\n');

if (!serverLines.some(l => l.includes('/api/admin/users/email'))) {
  const idx = serverLines.findIndex(l => l.includes('app.delete("/api/admin/members/:id"'));
  const route = [
    'app.post("/api/admin/users/email", requireSuperAdmin, async (req, res) => {',
    '  const { userId, subject, body: msgBody } = req.body;',
    '  if (!userId || !subject || !msgBody) return res.status(400).json({ error: "userId, subject and body required" });',
    '  const user = await prisma.user.findUnique({ where: { id: userId } });',
    '  if (!user) return res.status(404).json({ error: "User not found" });',
    '  try {',
    '    await emailService.sendEmail({',
    '      to: user.email,',
    '      subject: subject,',
    '      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;background:#0a0a0f;color:#f0f0f8">',
    '        <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:28px">⚡ Split<span style="color:#7c6aff">Subs</span></div>',
    '        <div style="background:#14141e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px">',
    '          <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#fff">${subject}</h1>',
    '          <p style="font-size:15px;color:#aaaacc">Hi <strong style="color:#fff">${user.name}</strong>,</p>',
    '          <div style="font-size:15px;line-height:1.65;color:#aaaacc;white-space:pre-wrap">${msgBody}</div>',
    '          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0"/>',
    '          <p style="font-size:13px;color:#666688">— SplitSubs Admin Team</p>',
    '        </div>',
    '      </div>`,',
    '    });',
    '    console.log("[ADMIN] Email sent to user:", user.email);',
    '    res.json({ ok: true, message: "Email sent to " + user.name + "." });',
    '  } catch (err) {',
    '    console.error("User email failed:", err.message);',
    '    res.status(500).json({ error: "Could not send email" });',
    '  }',
    '});',
    '',
  ];
  serverLines.splice(idx, 0, ...route);
  fs.writeFileSync(serverFile, serverLines.join('\n'));
  console.log('✓ POST /api/admin/users/email added to server.js');
} else {
  console.log('⚠ Endpoint already exists');
}

// ── 3. AdminDashboardPage.js — add email modal state + function + UI ───────
const adpFile = 'frontend/src/pages/AdminDashboardPage.js';
let adpLines = fs.readFileSync(adpFile, 'utf8').split('\n');

// Add state
if (!adpLines.some(l => l.includes('emailTarget'))) {
  const idx = adpLines.findIndex(l => l.includes('remindAllBusy]   = useState'));
  adpLines.splice(idx + 1, 0,
    '',
    '  // User email modal',
    '  const [emailTarget, setEmailTarget]   = useState(null);',
    '  const [emailForm, setEmailForm]       = useState({ subject: "", body: "" });',
    '  const [emailBusy, setEmailBusy]       = useState(false);',
    '  const [emailModalMsg, setEmailModalMsg] = useState(null);'
  );
  console.log('✓ Email modal state added');
} else { console.log('⚠ Email modal state exists'); }

// Add sendEmailToUser function
if (!adpLines.some(l => l.includes('sendEmailToUser'))) {
  const idx = adpLines.findIndex(l => l.includes('async function deleteExpiredMember'));
  adpLines.splice(idx, 0,
    '  async function sendEmailToUser() {',
    '    if (!emailTarget || !emailForm.subject || !emailForm.body) return;',
    '    setEmailBusy(true); setEmailModalMsg(null);',
    '    try {',
    '      const r = await api.sendUserEmail({ userId: emailTarget.id, subject: emailForm.subject, body: emailForm.body });',
    '      setEmailModalMsg({ type: "ok", text: r.message });',
    '      setEmailForm({ subject: "", body: "" });',
    '    } catch (err) { setEmailModalMsg({ type: "err", text: err.message }); }',
    '    finally { setEmailBusy(false); }',
    '  }',
    ''
  );
  console.log('✓ sendEmailToUser function added');
} else { console.log('⚠ sendEmailToUser exists'); }

// Add 📧 Email button to each user card (after the Suspend/Unsuspend buttons)
if (!adpLines.some(l => l.includes('setEmailTarget(u)'))) {
  const idx = adpLines.findIndex(l => l.includes("u.status === \"suspended\" && u.role !== \"superadmin\" && ("));
  // Find the closing of the user card right actions and add email button before it
  const cardEnd = adpLines.findIndex((l, i) => i > idx && l.includes('</div>') && l.includes('user-card-right'));
  // Instead add after the last action button block — find the unsuspend block end
  const unsuspendEnd = adpLines.findIndex((l, i) => i > idx && l.includes('"✅ Unsuspend"'));
  if (unsuspendEnd !== -1) {
    adpLines.splice(unsuspendEnd + 3, 0,
      '                {u.role !== "superadmin" && (',
      '                  <button className="btn btn-sm btn-outline" style={{borderColor:"rgba(124,106,255,0.3)",color:"var(--accent)"}}',
      '                    onClick={() => { setEmailTarget(u); setEmailForm({ subject: "", body: "" }); setEmailModalMsg(null); }}>',
      '                    ✉️ Email',
      '                  </button>',
      '                )}'
    );
    console.log('✓ Email button added to user cards');
  } else {
    console.log('⚠ Could not find unsuspend block to insert after');
  }
} else { console.log('⚠ Email button already exists'); }

// Add email modal before the reject modal
if (!adpLines.some(l => l.includes('emailTarget &&'))) {
  const idx = adpLines.findIndex(l => l.includes('{/* Reject modal */}'));
  adpLines.splice(idx, 0,
    '      {/* ── Email User Modal ── */}',
    '      {emailTarget && (',
    '        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setEmailTarget(null)}>',
    '          <div className="modal" style={{maxWidth:520}}>',
    '            <h3>✉️ Email {emailTarget.name}</h3>',
    '            <p style={{color:"var(--muted)",fontSize:"0.82rem",marginBottom:16}}>',
    '              Sending to: <strong style={{color:"var(--text)"}}>{emailTarget.email}</strong>',
    '              <span style={{marginLeft:8,fontSize:"0.75rem",background:"var(--bg3)",padding:"2px 8px",borderRadius:99}}>{emailTarget.role}</span>',
    '            </p>',
    '            <div className="form-group">',
    '              <label>Subject</label>',
    '              <input value={emailForm.subject}',
    '                onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}',
    '                placeholder="e.g. Important update about your account"/>',
    '            </div>',
    '            <div className="form-group">',
    '              <label>Message</label>',
    '              <textarea rows={6} value={emailForm.body}',
    '                onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}',
    '                placeholder={"Hi " + emailTarget.name + ",\\n\\nWrite your message here...\\n\\n— SplitSubs Admin"}',
    '                style={{resize:"vertical",fontFamily:"monospace",fontSize:"0.82rem"}}/>',
    '            </div>',
    '            {emailModalMsg && (',
    '              <div className={"msg-box " + (emailModalMsg.type==="ok"?"msg-ok":"msg-err")}',
    '                style={{marginBottom:12}} onClick={()=>setEmailModalMsg(null)}>',
    '                {emailModalMsg.text} <span style={{opacity:.4}}>✕</span>',
    '              </div>',
    '            )}',
    '            <div className="modal-actions">',
    '              <button className="btn btn-outline" onClick={() => { setEmailTarget(null); setEmailModalMsg(null); }}>Cancel</button>',
    '              <button className="btn btn-primary" disabled={emailBusy || !emailForm.subject || !emailForm.body} onClick={sendEmailToUser}>',
    '                {emailBusy ? <><span className="spinner"/> Sending…</> : "📨 Send Email"}',
    '              </button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      )}',
    ''
  );
  console.log('✓ Email modal added');
} else { console.log('⚠ Email modal exists'); }

fs.writeFileSync(adpFile, adpLines.join('\n'));
console.log('✓ AdminDashboardPage.js written');
console.log('\n✅ All patches complete!');
