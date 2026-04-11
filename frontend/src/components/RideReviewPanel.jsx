import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Star, Car, X } from 'lucide-react'
import { REVIEW_TAGS } from '../utils/reviewEngine'

// ── Star picker component ────────────────────────────────────
function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '0.25rem', margin: '0.5rem 0' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
            transform: (hovered || value) >= s ? 'scale(1.15)' : 'scale(1)',
            transition: 'transform 0.1s'
          }}
        >
          <Star
            size={26}
            fill={(hovered || value) >= s ? '#fbbf24' : 'none'}
            color={(hovered || value) >= s ? '#fbbf24' : 'var(--text-muted)'}
          />
        </button>
      ))}
    </div>
  )
}

const STAR_LABELS = { 1: 'Terrible', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' }

export default function RideReviewPanel({ ride, currentUser, requests, onReviewSubmitted }) {
  const isCreator = currentUser.id === ride.creator_id
  const [loading, setLoading] = useState(false)

  // Does this ride have an assigned driver who can be reviewed?
  const driverId = ride.assigned_driver_id ?? null
  const driverName = ride.drivers?.name ?? 'Driver'

  // ── Peer review state (rider ↔ publisher) ─────────────────────
  const approvedPassengers = requests.filter(r => r.status === 'approved')
  const [reviewsState, setReviewsState] = useState(() => {
    if (isCreator) {
      const s = {}
      approvedPassengers.forEach(p => {
        s[p.user_id] = { didHappen: true, rating: 5, comment: '' }
      })
      return s
    }
    return { [ride.creator_id]: { didHappen: true, rating: 5, comment: '' } }
  })

  // ── Driver review state ───────────────────────────────────────
  const [driverReview, setDriverReview] = useState({ rating: 5, comment: '', tags: [] })
  const [driverReviewed, setDriverReviewed] = useState(false)
  const [driverDismissed, setDriverDismissed] = useState(false)

  // ── Per-peer dismiss set ──────────────────────────────────────
  const [dismissedPeers, setDismissedPeers] = useState(new Set())
  const dismissPeer = (id) => setDismissedPeers(prev => new Set([...prev, id]))

  const handlePeerChange = (targetId, field, value) => {
    setReviewsState(prev => ({
      ...prev,
      [targetId]: { ...prev[targetId], [field]: value }
    }))
  }

  const toggleTag = (tag) => {
    setDriverReview(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }))
  }

  // ── Submit peer reviews ───────────────────────────────────────
  const handleSubmitPeer = async () => {
    setLoading(true)
    try {
      const { data: existing } = await supabase
        .from('ride_reviews')
        .select('id')
        .eq('ride_id', ride.id)
        .eq('reviewer_id', currentUser.id)
        .in('review_type', ['publisher_review', 'rider_review'])

      if (existing && existing.length > 0) {
        alert('You have already submitted peer reviews for this ride.')
        onReviewSubmitted()
        return
      }

      const payloads = Object.keys(reviewsState).map(targetId => {
        const rev = reviewsState[targetId]
        return {
          ride_id:     ride.id,
          reviewer_id: currentUser.id,
          reviewee_id: targetId,
          review_type: isCreator ? 'publisher_review' : 'rider_review',
          did_ride_happen: rev.didHappen,
          rating:  rev.didHappen ? parseInt(rev.rating) : null,
          comment: rev.comment,
        }
      })

      const { error } = await supabase.from('ride_reviews').insert(payloads)
      if (error) throw error

      onReviewSubmitted()
    } catch (err) {
      console.error(err)
      alert('Failed to submit review.')
    } finally {
      setLoading(false)
    }
  }

  // ── Submit driver review via RPC ───────────────────────────────
  const handleSubmitDriverReview = async () => {
    if (!driverId) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('submit_driver_review', {
        p_ride_id:   ride.id,
        p_rider_id:  currentUser.id,
        p_driver_id: driverId,
        p_rating:    driverReview.rating,
        p_comment:   driverReview.comment || null,
        p_tags:      driverReview.tags,
      })
      if (error) throw error
      if (!data.ok) throw new Error(data.error)
      setDriverReviewed(true)
    } catch (err) {
      console.error(err)
      alert(`Could not submit driver review: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Render peer review form ────────────────────────────────────
  const renderPeerForm = (targetId, title) => {
    const rev = reviewsState[targetId]
    if (!rev) return null

    // Dismissed — show collapsed skip label
    if (dismissedPeers.has(targetId)) {
      return (
        <div key={targetId} style={{ marginBottom: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Review for <strong>{title}</strong></span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>Skipped</span>
        </div>
      )
    }

    return (
      <div key={targetId} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        {/* Header + dismiss */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h5 style={{ margin: 0 }}>Review for: <strong>{title}</strong></h5>
          <button
            type="button"
            title="Skip this review"
            onClick={() => dismissPeer(targetId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <X size={16} />
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={rev.didHappen}
            onChange={e => handlePeerChange(targetId, 'didHappen', e.target.checked)}
          />
          {isCreator ? 'Did this passenger show up?' : 'Did this ride actually happen?'}
        </label>

        {rev.didHappen && (
          <>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Rating — {STAR_LABELS[rev.rating] || ''}
            </label>
            <StarPicker value={parseInt(rev.rating)} onChange={v => handlePeerChange(targetId, 'rating', v)} />
          </>
        )}

        <textarea
          className="input-field"
          placeholder="Optional comments..."
          value={rev.comment}
          onChange={e => handlePeerChange(targetId, 'comment', e.target.value)}
          style={{ minHeight: '60px', width: '100%', marginTop: '0.5rem', boxSizing: 'border-box' }}
        />
      </div>
    )
  }

  // ── Driver review section ──────────────────────────────────────
  const renderDriverReviewSection = () => {
    if (!driverId) return null

    // Dismissed — show collapsed skip label
    if (driverDismissed) {
      return (
        <div style={{ marginBottom: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <Car size={14} /> Driver review
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>Skipped</span>
        </div>
      )
    }

    return (
      <div style={{
        marginBottom: '1.5rem',
        borderRadius: '10px',
        padding: '1rem',
        border: '1px solid rgba(99,102,241,0.2)',
        background: 'rgba(99,102,241,0.05)',
      }}>
        {/* Header + dismiss */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Car size={18} color="var(--primary)" />
            <h5 style={{ margin: 0 }}>Rate your Driver — <strong>{driverName}</strong></h5>
          </div>
          {!driverReviewed && (
            <button
              type="button"
              title="Skip driver review"
              onClick={() => setDriverDismissed(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {driverReviewed ? (
          <div style={{ color: '#22c55e', fontWeight: '600', padding: '0.5rem 0' }}>✅ Driver review submitted!</div>
        ) : (
          <>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Rating — {STAR_LABELS[driverReview.rating] || ''}
            </label>
            <StarPicker
              value={driverReview.rating}
              onChange={v => setDriverReview(prev => ({ ...prev, rating: v }))}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.75rem 0' }}>
              {REVIEW_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '0.25rem 0.65rem', borderRadius: '999px', border: '1px solid',
                    borderColor: driverReview.tags.includes(tag) ? 'var(--primary)' : 'var(--border)',
                    background:  driverReview.tags.includes(tag) ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color:       driverReview.tags.includes(tag) ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>

            <textarea
              className="input-field"
              placeholder="Optional comment about the driver..."
              value={driverReview.comment}
              onChange={e => setDriverReview(prev => ({ ...prev, comment: e.target.value }))}
              style={{ minHeight: '60px', width: '100%', boxSizing: 'border-box' }}
            />

            <button
              className="btn"
              onClick={handleSubmitDriverReview}
              disabled={loading}
              style={{ marginTop: '0.75rem', width: '100%', background: 'var(--primary)' }}
            >
              {loading ? 'Submitting...' : '⭐ Submit Driver Review'}
            </button>
          </>
        )}
      </div>
    )
  }

  // ── Empty case for creator with no passengers ─────────────────
  if (isCreator && approvedPassengers.length === 0 && !driverId) {
    return (
      <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
        <h4>Submit Reviews</h4>
        <p style={{ color: 'var(--text-muted)' }}>No passengers or driver to review for this ride.</p>
        <button className="btn" onClick={onReviewSubmitted}>Acknowledge</button>
      </div>
    )
  }

  // activeIds = peer IDs that haven't been dismissed yet
  const peerIds = isCreator
    ? approvedPassengers.map(p => p.user_id)
    : [ride.creator_id]
  const activePeerIds = peerIds.filter(id => !dismissedPeers.has(id))

  return (
    <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
      <h4 style={{ marginBottom: '1.25rem' }}>Submit Feedback</h4>

      {/* 1. Driver review — always first */}
      {renderDriverReviewSection()}

      {/* 2. Peer reviews */}
      {isCreator
        ? approvedPassengers.map(p => renderPeerForm(p.user_id, p.users?.name || 'Passenger'))
        : renderPeerForm(ride.creator_id, ride.users?.name || 'Publisher')
      }

      {/* Peer submit — only if at least one peer section is still active */}
      {activePeerIds.length > 0 && (
        <button className="btn" onClick={handleSubmitPeer} disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Submitting...' : isCreator ? 'Submit Passenger Review(s)' : 'Submit Review'}
        </button>
      )}

      {/* Done button when everything is either submitted or dismissed */}
      {activePeerIds.length === 0 && (driverReviewed || driverDismissed || !driverId) && (
        <button className="btn" onClick={onReviewSubmitted} style={{ width: '100%', background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
          Done
        </button>
      )}
    </div>
  )
}
