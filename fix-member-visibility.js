const fs = require('fs');
const file = 'frontend/src/pages/GroupDetailPage.js';
let src = fs.readFileSync(file, 'utf8');

// Find the Paying Members section and restrict visibility
// Only show full member list to canManage (admin/organizer/moderator)
// Customers only see their own row and slot count

const oldPayingMembers = `        <h2 className="section-h2">Paying Members</h2>
          {payingMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>👥</div>
              No paying members yet. Be the first to join!
            </div>
          ) : payingMembers.map(m => (`;

const newPayingMembers = `        <h2 className="section-h2">Paying Members</h2>
          {payingMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>👥</div>
              No paying members yet. Be the first to join!
            </div>
          ) : canManage ? payingMembers.map(m => (`;

if (src.includes(oldPayingMembers)) {
  src = src.replace(oldPayingMembers, newPayingMembers);
  console.log('✓ Paying members list restricted to canManage');
} else {
  console.log('⚠ Pattern not found — trying line approach');
}

// Find closing of the payingMembers.map and add else clause for customers
// After the map closing, add customer view showing only their own status + slot count
const mapClose = `          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>`;

const mapCloseNew = `          )) : (
            <div>
              {/* Customer view — only show their own membership status */}
              {myMember ? (
                <div className="member-row" style={{ background: "rgba(124,106,255,0.06)", borderRadius: 10, padding: "12px 16px" }}>
                  <div className="member-avatar">{myMember.name?.[0]?.toUpperCase()}</div>
                  <div className="member-info">
                    <div className="member-name">You</div>
                    {myMember.durationLabel && <div style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: 1 }}>📅 {myMember.durationLabel}</div>}
                    {myMember.expiresAt && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Expires {new Date(myMember.expiresAt).toLocaleDateString()}</div>}
                  </div>
                  <span className={\`tag tag-\${myMember.paymentStatus}\`}>{myMember.paymentStatus}</span>
                  {myMember.paymentStatus === "pending" && (
                    <button className="btn btn-sm pesapal-btn" onClick={() => handlePay(myMember)} disabled={payingId === myMember.id}>
                      {payingId === myMember.id ? <><span className="spinner" /> Redirecting…</> : "🔒 Pay Now"}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "16px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>👥</div>
                  {filled} of {group.maxSlots} slots filled
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>`;

if (src.includes(mapClose)) {
  src = src.replace(mapClose, mapCloseNew);
  console.log('✓ Customer view added');
} else {
  console.log('⚠ Map close pattern not found');
  // Find it differently
  const idx = src.indexOf('No paying members yet');
  console.log('Context around paying members:', src.substring(idx + 200, idx + 600));
}

fs.writeFileSync(file, src);
console.log('✓ GroupDetailPage.js updated');
