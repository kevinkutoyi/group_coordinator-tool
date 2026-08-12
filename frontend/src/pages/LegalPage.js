import React, { useEffect } from "react";

const LAST_UPDATED = "August 2026";

const CONTENT = {
  terms: {
    title: "Terms & Conditions",
    metaDesc: "SplitSubs Terms & Conditions — the rules for creating, joining, and paying for group-buy subscriptions on the platform.",
    sections: [
      ["1. What SplitSubs Is",
        `SplitSubs is a group-buy coordination platform. Moderators list an official family or group subscription plan (e.g. a streaming, AI, design, or utility subscription), and customers pay for one slot in that group instead of the full price. Payments are processed through Paystack; SplitSubs and its moderators never see your card or M-Pesa PIN directly.`],
      ["2. Eligibility",
        `You must be at least 18 years old, or the age of majority in your jurisdiction, to create an account, join a group, or moderate a group on SplitSubs.`],
      ["3. Accounts",
        `You're responsible for keeping your login credentials secure and for all activity under your account. Moderator accounts require super admin approval before they can list groups, and every listing goes through admin review before it becomes visible to the public.`],
      ["4. Group-Buy Mechanics & Fees",
        `Each group has a total plan price and a fixed number of slots. Your per-slot price already includes SplitSubs' platform fee, set by the admin and applied at the time you join or renew. Group moderators are responsible for maintaining the underlying subscription for the group's duration.`],
      ["5. Third-Party Service Terms",
        `Sharing access to a subscription may be subject to the terms of the underlying service provider (e.g. a streaming or software company). SplitSubs facilitates cost-splitting for official family/group plans designed for shared use; it is your responsibility to confirm that your use complies with the third-party service's own terms.`],
      ["6. Prohibited Conduct",
        `You may not use SplitSubs to list or pay for services obtained fraudulently, to share individually-licensed (non-shareable) accounts, to harass other users, or to circumvent platform fees.`],
      ["7. Termination",
        `SplitSubs may suspend or remove an account or listing that violates these terms, engages in fraud, or receives repeated valid complaints.`],
      ["8. Limitation of Liability",
        `SplitSubs coordinates payments and group membership but does not control the underlying subscription services. To the maximum extent permitted by law, SplitSubs is not liable for service interruptions, price changes, or account actions taken by third-party providers.`],
      ["9. Changes to These Terms",
        `We may update these terms from time to time. Continued use of SplitSubs after an update constitutes acceptance of the revised terms.`],
      ["10. Contact",
        `Questions about these terms can be sent to admin@splitsubs.com.`],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    metaDesc: "SplitSubs Privacy Policy — what information we collect, how it's used, and who we share it with.",
    sections: [
      ["1. Information We Collect",
        `Account details you provide (name, email, phone number), payment metadata from Paystack (not your full card or M-Pesa PIN), group membership and payment history, and support messages you send us.`],
      ["2. How We Use Your Information",
        `To operate your account, process payments, send transactional emails (receipts, renewal reminders, OTPs) via Resend, prevent fraud, and — if you opt in — send newsletter updates.`],
      ["3. Who We Share It With",
        `Paystack (payment processing), Resend (transactional email delivery), and group moderators (limited to what's needed to run the group you've joined, such as your masked email and payment status). We do not sell your personal information.`],
      ["4. Cookies & Local Storage",
        `SplitSubs uses local browser storage to keep you signed in and to remember basic preferences. We don't use third-party advertising trackers.`],
      ["5. Data Retention",
        `We retain account and payment records for as long as your account is active and as needed to meet accounting, tax, and legal obligations afterward.`],
      ["6. Your Rights",
        `You can request a copy of your data, ask us to correct inaccurate information, or request account deletion by emailing admin@splitsubs.com. Some records (e.g. payment history) may need to be retained for legal/accounting reasons even after deletion.`],
      ["7. Contact",
        `Privacy questions can be sent to admin@splitsubs.com.`],
    ],
  },
  refund: {
    title: "Refund Policy",
    metaDesc: "SplitSubs Refund Policy — when a payment for a group slot is and isn't eligible for a refund.",
    sections: [
      ["1. General Policy",
        `Because a group slot grants you immediate access to shared subscription details once payment is confirmed, payments are generally non-refundable once your slot has been confirmed and access has been provided.`],
      ["2. When a Refund May Apply",
        `You may be eligible for a refund or credit if: the group's moderator fails to deliver working access after payment is confirmed, the underlying subscription is cancelled or becomes unavailable through no fault of yours, or you were charged in error (e.g. a duplicate payment).`],
      ["3. How to Request",
        `Contact admin@splitsubs.com within 7 days of the issue with your group name, payment reference, and a description of the problem. We'll review the group's payment log and access history before deciding.`],
      ["4. Processing Time",
        `Approved refunds are processed back to your original payment method via Paystack, typically within 5–10 business days depending on your bank or mobile money provider.`],
      ["5. Platform Fees",
        `The platform fee portion of your payment is non-refundable except where the refund is due to a SplitSubs platform error.`],
    ],
  },
  "data-protection": {
    title: "Data Protection Policy",
    metaDesc: "SplitSubs Data Protection Policy — our approach to safeguarding your personal data.",
    sections: [
      ["1. Our Approach",
        `SplitSubs collects the minimum personal data needed to run group-buy subscriptions and process payments, and aims to handle it in line with the principles of Kenya's Data Protection Act, 2019 and comparable data protection regulations.`],
      ["2. Security Measures",
        `Passwords are stored hashed, never in plain text. Payment card and mobile money details are handled entirely by Paystack — SplitSubs' servers never store your full card number or M-Pesa PIN. Access to admin tools is role-gated and requires authentication.`],
      ["3. Data Minimization",
        `Group moderators only see what's necessary to run their group (e.g. a masked email and payment status) — not your full account details.`],
      ["4. Data Subject Rights",
        `You may request access to, correction of, or deletion of your personal data by emailing admin@splitsubs.com. We'll respond within a reasonable timeframe and explain any legal reasons we may need to retain specific records.`],
      ["5. Breach Notification",
        `In the event of a data breach affecting your personal information, we will notify affected users and relevant authorities as required by applicable law.`],
      ["6. Contact",
        `For data protection questions or to exercise your rights, email admin@splitsubs.com.`],
    ],
  },
};

export default function LegalPage({ type, navigate }) {
  const doc = CONTENT[type] || CONTENT.terms;

  useEffect(() => {
    document.title = `${doc.title} — SplitSubs`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", doc.metaDesc);
  }, [type, doc.title, doc.metaDesc]);

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 4px 60px" }}>
      <button className="btn btn-outline btn-sm" onClick={() => navigate("home")} style={{ marginBottom: 20 }}>
        ← Back to Home
      </button>

      <h1 className="page-title" style={{ marginBottom: 4 }}>{doc.title}</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 24 }}>Last updated: {LAST_UPDATED}</p>

      <div style={{
        background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
        borderRadius: 10, padding: "12px 16px", marginBottom: 28, fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.5,
      }}>
        ⚠️ This is a starting draft describing how SplitSubs actually operates today. It hasn't been reviewed by a lawyer —
        please have it checked against your local regulations before treating it as your final, binding policy.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {doc.sections.map(([heading, body]) => (
          <div key={heading}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{heading}</h2>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
