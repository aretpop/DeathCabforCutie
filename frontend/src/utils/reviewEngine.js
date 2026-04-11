// ================================================================
//  reviewEngine.js  —  Driver Review & Rating System
//  Wrapper around Supabase RPCs with local validation + helpers
//  Works in tandem with the DB-side SECURITY DEFINER functions
// ================================================================

import { supabase } from '../supabaseClient'

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

/** Valid tag options riders can attach to a review (bonus feature) */
export const REVIEW_TAGS = [
  'Polite',
  'On time',
  'Rash driving',
  'Smooth ride',
  'Overcharged',
  'Clean vehicle',
]

/** Star ratings and their human-readable labels */
export const STAR_LABELS = {
  1: 'Terrible',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
}

// ──────────────────────────────────────────────────────────────
//  1.  submitReview()
// ──────────────────────────────────────────────────────────────
/**
 * Submits a rider → driver review for a completed ride.
 *
 * All core validation (ride status, duplicate, participant check)
 * happens atomically inside the Supabase RPC to prevent race conditions.
 * Client-side validation runs first for instant UX feedback.
 *
 * @param {Object} params
 * @param {string}   params.rideId    - UUID of the completed ride
 * @param {string}   params.riderId   - UUID of the reviewing rider
 * @param {string}   params.driverId  - UUID of the driver being reviewed
 * @param {number}   params.rating    - Integer 1–5
 * @param {string}  [params.comment]  - Optional text review
 * @param {string[]} [params.tags]    - Optional tags from REVIEW_TAGS list
 *
 * @returns {Promise<{ ok: boolean, reviewId?: string, error?: string }>}
 */
export async function submitReview({
  rideId,
  riderId,
  driverId,
  rating,
  comment = null,
  tags    = [],
}) {
  // ── Client-side fast-fail validation ─────────────────────────
  if (!rideId || !riderId || !driverId) {
    return { ok: false, error: 'rideId, riderId, and driverId are all required' }
  }

  const parsedRating = parseInt(rating)
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return { ok: false, error: 'Rating must be an integer between 1 and 5' }
  }

  // Validate tags against allowlist (prevent garbage data)
  const invalidTags = tags.filter(t => !REVIEW_TAGS.includes(t))
  if (invalidTags.length > 0) {
    return { ok: false, error: `Invalid tags: ${invalidTags.join(', ')}` }
  }

  // ── Delegate to RPC (atomic, with row-level lock) ─────────────
  const { data, error } = await supabase.rpc('submit_driver_review', {
    p_ride_id:   rideId,
    p_rider_id:  riderId,
    p_driver_id: driverId,
    p_rating:    parsedRating,
    p_comment:   comment,
    p_tags:      tags,
  })

  if (error) {
    console.error('[reviewEngine] submitReview RPC error:', error)
    return { ok: false, error: error.message }
  }

  // RPC returns { ok, review_id | error }
  return {
    ok:       data.ok,
    reviewId: data.review_id ?? null,
    error:    data.error    ?? null,
  }
}

// ──────────────────────────────────────────────────────────────
//  2.  handleDriverCancellation()
// ──────────────────────────────────────────────────────────────
/**
 * Applies a system-generated 1-star penalty when a driver cancels
 * AFTER a ride has been accepted.
 *
 * This function is idempotent — calling it twice for the same ride
 * will not create duplicate penalties (enforced via DB unique index).
 *
 * Do NOT call this for:
 *   - Driver cancelling before accepting (no penalty)
 *   - Ride expiring due to timeout (no penalty)
 *
 * @param {string} rideId    - UUID of the accepted ride
 * @param {string} driverId  - UUID of the cancelling driver
 *
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
export async function handleDriverCancellation(rideId, driverId) {
  if (!rideId || !driverId) {
    return { ok: false, error: 'rideId and driverId are required' }
  }

  const { data, error } = await supabase.rpc('handle_driver_cancellation', {
    p_ride_id:   rideId,
    p_driver_id: driverId,
  })

  if (error) {
    console.error('[reviewEngine] handleDriverCancellation RPC error:', error)
    return { ok: false, error: error.message }
  }

  return {
    ok:      data.ok,
    message: data.message ?? null,
    error:   data.error   ?? null,
  }
}

// ──────────────────────────────────────────────────────────────
//  3.  updateDriverRating()
// ──────────────────────────────────────────────────────────────
/**
 * Recalculates and persists a driver's average rating from scratch
 * by querying all their reviews. Use this for full recalculation
 * (e.g. after a review is deleted by an admin).
 *
 * For real-time incremental updates during normal use, the RPCs
 * above handle rating updates atomically — this function is a
 * maintenance/reconciliation utility.
 *
 * @param {string} driverId
 * @returns {Promise<{ ok: boolean, newAvg?: number, total?: number, error?: string }>}
 */
export async function updateDriverRating(driverId) {
  if (!driverId) {
    return { ok: false, error: 'driverId is required' }
  }

  try {
    // Fetch all reviews for this driver
    const { data: reviews, error: fetchErr } = await supabase
      .from('ride_reviews')
      .select('rating')
      .eq('driver_id', driverId)

    if (fetchErr) throw fetchErr

    const total = reviews.length

    // Avoid division by zero: no reviews → reset to default 5.0
    const newAvg = total === 0
      ? 5.0
      : parseFloat(
          (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(2)
        )

    // Persist recalculated values
    const { error: updateErr } = await supabase
      .from('drivers')
      .update({ average_rating: newAvg, total_reviews: total })
      .eq('id', driverId)

    if (updateErr) throw updateErr

    return { ok: true, newAvg, total }
  } catch (err) {
    console.error('[reviewEngine] updateDriverRating error:', err)
    return { ok: false, error: err.message }
  }
}

// ──────────────────────────────────────────────────────────────
//  4.  getDriverRatingBreakdown()  — Bonus feature
// ──────────────────────────────────────────────────────────────
/**
 * Returns a star-by-star breakdown and recency-weighted average.
 *
 * Weighted avg: reviews in the last 30 days count 2× as much,
 * so a driver's recent behaviour impacts their score more heavily.
 *
 * @param {string} driverId
 * @returns {Promise<{
 *   ok: boolean,
 *   breakdown?: Record<string, number>,   // { "5": 12, "4": 3, … }
 *   weightedAvg?: number,
 *   totalReviews?: number,
 *   error?: string
 * }>}
 */
export async function getDriverRatingBreakdown(driverId) {
  if (!driverId) {
    return { ok: false, error: 'driverId is required' }
  }

  const { data, error } = await supabase.rpc('get_driver_rating_breakdown', {
    p_driver_id: driverId,
  })

  if (error) {
    console.error('[reviewEngine] getDriverRatingBreakdown RPC error:', error)
    return { ok: false, error: error.message }
  }

  return {
    ok:           true,
    breakdown:    data.breakdown    ?? {},
    weightedAvg:  data.weighted_avg ?? 5.0,
    totalReviews: data.total_reviews ?? 0,
  }
}

// ──────────────────────────────────────────────────────────────
//  5.  fetchDriverReviews()  — Read helper
// ──────────────────────────────────────────────────────────────
/**
 * Fetches paginated public reviews for a driver profile page.
 * Excludes auto-generated penalty reviews from the public display.
 *
 * @param {string} driverId
 * @param {Object} [opts]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.offset=0]
 * @param {boolean} [opts.includeAuto=false]
 *
 * @returns {Promise<{ ok: boolean, reviews?: Array, error?: string }>}
 */
export async function fetchDriverReviews(driverId, {
  limit        = 10,
  offset       = 0,
  includeAuto  = false,
} = {}) {
  if (!driverId) {
    return { ok: false, error: 'driverId is required' }
  }

  let query = supabase
    .from('ride_reviews')
    .select(`
      id,
      rating,
      comment,
      tags,
      is_auto_generated,
      created_at,
      reviewer:reviewer_id ( name, avatar_url )
    `)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Optionally filter out system-generated penalties
  if (!includeAuto) {
    query = query.eq('is_auto_generated', false)
  }

  const { data, error } = await query

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, reviews: data }
}

// ──────────────────────────────────────────────────────────────
//  6.  formatStarBreakdown()  — UI utility
// ──────────────────────────────────────────────────────────────
/**
 * Converts raw breakdown object { "5": 12, "4": 3, … } into
 * a sorted array ready for rendering a rating bars UI.
 *
 * @param {Object} breakdown
 * @param {number} total - total reviews (for percentage calc)
 * @returns {Array<{ star: number, label: string, count: number, pct: number }>}
 */
export function formatStarBreakdown(breakdown, total) {
  return [5, 4, 3, 2, 1].map(star => {
    const count = parseInt(breakdown[String(star)] ?? 0)
    return {
      star,
      label: STAR_LABELS[star],
      count,
      pct:   total > 0 ? Math.round((count / total) * 100) : 0,
    }
  })
}
