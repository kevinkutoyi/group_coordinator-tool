import React, { useEffect, useState } from "react";
import { api } from "../api";
import "./GroupReviews.css";

function Stars({ value, size = 14 }) {
  return (
    <span style={{ fontSize: size, color: "var(--warning)", letterSpacing: 1, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ opacity: i <= Math.round(value) ? 1 : 0.25 }}>★</span>
      ))}
    </span>
  );
}

// Compact, space-saving ratings + reviews block for a group's detail page.
// Only members with a confirmed payment on this group (canReview, from the
// backend) can write or edit a review — one per member, enforced server-side.
export default function GroupReviews({ groupId }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showAll, setShowAll]   = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating]     = useState(0);
  const [hoverRating, setHover] = useState(0);
  const [comment, setComment]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState(null);

  function load() {
    api.getGroupReviews(groupId).then(d => {
      setData(d);
      if (d?.myReview) { setRating(d.myReview.rating); setComment(d.myReview.comment || ""); }
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [groupId]);

  if (loading || !data) return null;
  const { summary, reviews, canReview, myReview } = data;

  async function submit() {
    if (!rating) { setMsg({ type: "err", text: "Pick a star rating first." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.submitGroupReview(groupId, { rating, comment });
      setFormOpen(false);
      load();
    } catch (err) { setMsg({ type: "err", text: err.message }); }
    finally { setBusy(false); }
  }

  const visibleReviews = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div className="card gr-wrap">
      <h3 className="gr-title">⭐ Ratings & Reviews</h3>

      {summary.count === 0 ? (
        <p className="gr-empty">No reviews yet — be the first to leave one after joining.</p>
      ) : (
        <>
          <div className="gr-summary">
            <div className="gr-avg">
              <div className="gr-avg-num">{summary.average}<span>★</span></div>
              <div className="gr-avg-count">{summary.count.toLocaleString()} review{summary.count !== 1 ? "s" : ""}</div>
            </div>
            <div className="gr-bars">
              {[5, 4, 3, 2, 1].map(star => (
                <div key={star} className="gr-bar-row">
                  <span className="gr-bar-label">{star}★</span>
                  <div className="gr-bar-track"><div className="gr-bar-fill" style={{ width: `${summary.breakdown[star]}%` }} /></div>
                  <span className="gr-bar-pct">{summary.breakdown[star]}%</span>
                </div>
              ))}
            </div>
          </div>
          {summary.recommendPercent > 0 && (
            <p className="gr-recommend">👍 {summary.recommendPercent}% of customers recommend this subscription</p>
          )}
        </>
      )}

      {canReview && (
        <div className="gr-form-toggle">
          {!formOpen ? (
            <button className="btn btn-sm btn-outline" onClick={() => setFormOpen(true)}>
              {myReview ? "✏️ Edit your review" : "✍️ Write a review"}
            </button>
          ) : (
            <div className="gr-form">
              <div className="gr-star-picker">
                {[1, 2, 3, 4, 5].map(i => (
                  <span key={i}
                    className="gr-star-input"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(i)}
                    style={{ opacity: i <= (hoverRating || rating) ? 1 : 0.3 }}>★</span>
                ))}
              </div>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Optional — say a word or two (max 500 chars)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="gr-textarea"
              />
              {msg && <div className={`msg-box ${msg.type === "ok" ? "msg-ok" : "msg-err"}`} style={{ marginBottom: 0 }}>{msg.text}</div>}
              <div className="gr-form-actions">
                <button className="btn btn-sm btn-outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy}>
                  {busy ? "Saving…" : "Submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {reviews.length > 0 && (
        <div className="gr-list">
          {visibleReviews.map(r => (
            <div key={r.id} className="gr-item">
              <div className="gr-item-head">
                <Stars value={r.rating} size={12} />
                <span className="gr-item-name">{r.reviewerName}</span>
                <span className="gr-item-date">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </div>
              {r.comment && <p className="gr-item-comment">{r.comment}</p>}
            </div>
          ))}
          {reviews.length > 3 && (
            <button className="gr-showall" onClick={() => setShowAll(s => !s)}>
              {showAll ? "Show less" : `Show all ${reviews.length} reviews`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { Stars };
