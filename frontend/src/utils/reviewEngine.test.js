/**
 * reviewEngine.test.md
 * ─────────────────────────────────────────────────────────────
 * Manual + SQL test cases for the driver review system.
 * Run the SQL blocks directly in Supabase SQL Editor.
 * JS snippets show how to call the engine from the frontend.
 * ─────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════
//  SETUP — Create test fixtures
// ═══════════════════════════════════════════════════════════════

/*
-- In Supabase SQL Editor (replace UUIDs with real ones from your DB):

-- Check existing drivers
SELECT id, name, average_rating, total_reviews, cancellation_count FROM drivers;

-- Check existing rides in 'accepted' or 'completed' state
SELECT id, status, creator_id, assigned_driver_id FROM rides
WHERE status IN ('accepted','completed','awaiting_reviews')
LIMIT 5;
*/

// ═══════════════════════════════════════════════════════════════
//  TEST 1: Normal Review — Rider reviews driver after completion
// ═══════════════════════════════════════════════════════════════

/*
-- SQL equivalent (what the RPC does internally):
SELECT submit_driver_review(
  '<ride_id>',        -- a completed ride UUID
  '<rider_id>',       -- the rider's user UUID
  '<driver_id>',      -- the driver's UUID
  5,                  -- rating
  'Great ride, very polite!',
  ARRAY['Polite','On time']
);

-- Expected result:
-- { "ok": true, "review_id": "some-uuid" }

-- Verify driver rating updated:
SELECT id, name, average_rating, total_reviews
FROM drivers WHERE id = '<driver_id>';
-- total_reviews should be +1, average_rating recalculated
*/

// JS (frontend):
import {
  submitReview,
  handleDriverCancellation,
  updateDriverRating,
  getDriverRatingBreakdown,
  formatStarBreakdown,
} from './reviewEngine.js'

async function test1_normalReview() {
  console.log('\n🧪  TEST 1: Normal review')

  const result = await submitReview({
    rideId:   '<completed-ride-uuid>',
    riderId:  '<rider-uuid>',
    driverId: '<driver-uuid>',
    rating:   5,
    comment:  'Smooth ride, arrived on time.',
    tags:     ['Polite', 'On time'],
  })

  console.assert(result.ok === true, 'Should succeed')
  console.assert(result.reviewId !== null, 'Should return a review ID')
  console.log('  ✅ Result:', result)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 2: Duplicate Review — Same rider tries again
// ═══════════════════════════════════════════════════════════════

/*
-- SQL: call submit_driver_review with the SAME ride_id + rider_id
SELECT submit_driver_review(
  '<same-ride-id>',
  '<same-rider-id>',
  '<driver-id>',
  4,
  'Changed my mind'
);

-- Expected: { "ok": false, "error": "You have already reviewed this ride" }
-- DB state: review count UNCHANGED (unique index prevents insert)
*/

async function test2_duplicateReview() {
  console.log('\n🧪  TEST 2: Duplicate review attempt')

  // First review (fresh)
  await submitReview({
    rideId: '<ride-uuid>', riderId: '<rider-uuid>', driverId: '<driver-uuid>',
    rating: 4,
  })

  // Second review — same rider, same ride
  const duplicate = await submitReview({
    rideId: '<ride-uuid>', riderId: '<rider-uuid>', driverId: '<driver-uuid>',
    rating: 1, comment: 'Trying to spam',
  })

  console.assert(duplicate.ok === false, 'Should reject duplicate')
  console.assert(
    duplicate.error.includes('already reviewed'),
    'Error message should mention duplicate'
  )
  console.log('  ✅ Duplicate correctly rejected:', duplicate.error)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 3: Review Before Completion — Ride still 'accepted'
// ═══════════════════════════════════════════════════════════════

/*
-- SQL:
SELECT submit_driver_review(
  '<accepted-ride-id>',   -- status = 'accepted' not 'completed'
  '<rider-id>',
  '<driver-id>',
  5
);
-- Expected: { "ok": false, "error": "Ride must be completed before reviewing" }
*/

async function test3_reviewBeforeCompletion() {
  console.log('\n🧪  TEST 3: Review before ride completion')

  const result = await submitReview({
    rideId:   '<accepted-ride-uuid>',
    riderId:  '<rider-uuid>',
    driverId: '<driver-uuid>',
    rating:   5,
  })

  console.assert(result.ok === false, 'Should block early review')
  console.log('  ✅ Correctly blocked:', result.error)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 4: Driver Cancellation Penalty
// ═══════════════════════════════════════════════════════════════

/*
-- SQL:
SELECT handle_driver_cancellation(
  '<accepted-ride-id>',
  '<driver-id>'
);
-- Expected: { "ok": true, "message": "Cancellation penalty applied" }

-- Verify:
SELECT id, average_rating, total_reviews, cancellation_count
FROM drivers WHERE id = '<driver-id>';
-- cancellation_count +1, average_rating recalculated with 1-star

SELECT * FROM ride_reviews
WHERE ride_id = '<accepted-ride-id>' AND is_auto_generated = true;
-- Should show 1 auto-generated row with rating=1
*/

async function test4_cancellationPenalty() {
  console.log('\n🧪  TEST 4: Driver cancellation penalty')

  const result = await handleDriverCancellation(
    '<accepted-ride-uuid>',
    '<driver-uuid>'
  )

  console.assert(result.ok === true, 'Should apply penalty successfully')
  console.log('  ✅ Penalty applied:', result.message)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 5: Idempotent Penalty — Cancel twice, penalty once
// ═══════════════════════════════════════════════════════════════

/*
-- Call handle_driver_cancellation TWICE for the same ride.
-- First call: inserts, updates counts
-- Second call: ON CONFLICT DO NOTHING, FOUND=false, skips update

SELECT handle_driver_cancellation('<ride-id>', '<driver-id>');
SELECT handle_driver_cancellation('<ride-id>', '<driver-id>');  -- safe, no-op

-- Verify: cancellation_count is exactly 1, not 2
*/

async function test5_idempotentPenalty() {
  console.log('\n🧪  TEST 5: Idempotent cancellation penalty')

  const r1 = await handleDriverCancellation('<ride-uuid>', '<driver-uuid>')
  const r2 = await handleDriverCancellation('<ride-uuid>', '<driver-uuid>')

  console.log('  First call:', r1.ok, r1.message || r1.error)
  console.log('  Second call:', r2.ok, r2.message || r2.error)
  console.log('  ✅ No double-penalty (check DB: cancellation_count = 1)')
}

// ═══════════════════════════════════════════════════════════════
//  TEST 6: Non-participant Review Attempt
// ═══════════════════════════════════════════════════════════════

/*
-- A user who was NOT on the ride tries to review the driver.
-- Expected: { "ok": false, "error": "You were not a participant in this ride" }
*/

async function test6_nonParticipantReview() {
  console.log('\n🧪  TEST 6: Non-participant review rejection')

  const result = await submitReview({
    rideId:   '<completed-ride-uuid>',
    riderId:  '<random-unrelated-user-uuid>',
    driverId: '<driver-uuid>',
    rating:   1,
    comment:  'Trying to sabotage',
  })

  console.assert(result.ok === false, 'Should reject non-participant')
  console.log('  ✅ Correctly blocked:', result.error)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 7: Rating Breakdown
// ═══════════════════════════════════════════════════════════════

/*
-- SQL:
SELECT get_driver_rating_breakdown('<driver-id>');
-- Returns:
-- {
--   "breakdown":    { "5": 8, "4": 3, "3": 1 },
--   "weighted_avg": 4.7,
--   "total_reviews": 12
-- }
*/

async function test7_ratingBreakdown() {
  console.log('\n🧪  TEST 7: Rating breakdown')

  const result = await getDriverRatingBreakdown('<driver-uuid>')

  if (result.ok) {
    const rows = formatStarBreakdown(result.breakdown, result.totalReviews)
    console.log('  Star breakdown:')
    rows.forEach(r => {
      const bar = '█'.repeat(Math.ceil(r.pct / 5)) || '░'
      console.log(`    ${r.star}★ ${bar} ${r.count} reviews (${r.pct}%) — ${r.label}`)
    })
    console.log(`  Weighted avg (last 30d count 2×): ${result.weightedAvg}`)
    console.log('  ✅ Breakdown rendered')
  }
}

// ═══════════════════════════════════════════════════════════════
//  TEST 8: updateDriverRating() Full Recalculation
// ═══════════════════════════════════════════════════════════════

async function test8_fullRecalculation() {
  console.log('\n🧪  TEST 8: Full recalculation (maintenance utility)')

  const result = await updateDriverRating('<driver-uuid>')

  console.assert(result.ok === true, 'Should recalculate successfully')
  console.assert(result.newAvg >= 1 && result.newAvg <= 5, 'Avg in valid range')
  console.log(`  ✅ Driver avg recalculated: ${result.newAvg} over ${result.total} reviews`)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 9: Invalid Tag Rejection
// ═══════════════════════════════════════════════════════════════

async function test9_invalidTag() {
  console.log('\n🧪  TEST 9: Invalid tag rejection (client-side)')

  const result = await submitReview({
    rideId:   '<ride-uuid>',
    riderId:  '<rider-uuid>',
    driverId: '<driver-uuid>',
    rating:   4,
    tags:     ['Polite', 'HACKED'],   // HACKED is not an allowed tag
  })

  console.assert(result.ok === false, 'Should reject bad tag')
  console.assert(result.error.includes('Invalid tags'), 'Should name the bad tag')
  console.log('  ✅ Bad tag rejected:', result.error)
}

// ═══════════════════════════════════════════════════════════════
//  TEST 10: Zero reviews → default 5.0 rating
// ═══════════════════════════════════════════════════════════════

/*
-- SQL: A brand-new driver with no reviews
SELECT average_rating, total_reviews
FROM drivers
WHERE id = '<new-driver-id>';
-- average_rating = 5.0, total_reviews = 0 (DB defaults)

SELECT get_driver_rating_breakdown('<new-driver-id>');
-- { "breakdown": {}, "weighted_avg": 5.0, "total_reviews": 0 }
*/

// ═══════════════════════════════════════════════════════════════
//  RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

// Uncomment to run (requires real UUIDs substituted above):
// (async () => {
//   await test1_normalReview()
//   await test2_duplicateReview()
//   await test3_reviewBeforeCompletion()
//   await test4_cancellationPenalty()
//   await test5_idempotentPenalty()
//   await test6_nonParticipantReview()
//   await test7_ratingBreakdown()
//   await test8_fullRecalculation()
//   await test9_invalidTag()
//   console.log('\n✅  All test scenarios complete.')
// })()
