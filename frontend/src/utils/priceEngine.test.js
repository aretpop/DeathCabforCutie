/**
 * priceEngine.test.js
 * Run with:  node src/utils/priceEngine.test.js
 */

import {
  calculateSurgeMultiplier,
  calculatePeakMultiplier,
  calculateOccupancyMultiplier,
  calculateSeatPrice,
  calculateFinalPrice,
  calculatePriceRange,
  haversineDistance,
  MIN_RIDE_PRICE,
  MAX_SURGE_MULTIPLIER,
  MAX_PRICE_CAP,
  MAX_SEATS,
} from './priceEngine.js'

// ─────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────
let passed = 0, failed = 0

function assert(condition, label) {
  if (condition) { console.log(`  ✅  ${label}`); passed++ }
  else           { console.error(`  ❌  FAIL: ${label}`); failed++ }
}
function approx(a, b, tol = 0.05) { return Math.abs(a - b) <= tol }

// ═════════════════════════════════════════════════
//  1. calculateSurgeMultiplier
// ═════════════════════════════════════════════════
console.log('\n📊  calculateSurgeMultiplier')

{
  const r = calculateSurgeMultiplier(3, 10)
  assert(r.multiplier === 1.0, 'supply >> demand → 1.0×')
  assert(r.demandFactor === 0.30, 'ratio correct')
}
{
  const r = calculateSurgeMultiplier(5, 5)
  assert(r.multiplier === 1.0, 'parity → 1.0×')
}
{
  const r = calculateSurgeMultiplier(20, 5)
  assert(r.multiplier === MAX_SURGE_MULTIPLIER, 'saturated → max surge')
}
{
  const r = calculateSurgeMultiplier(10, 5)  // ratio=2, midpoint of [1,3]
  assert(approx(r.multiplier, 1.75), `moderate demand → ~1.75× (got ${r.multiplier})`)
}
{
  const r = calculateSurgeMultiplier(10, 0)
  assert(r.multiplier === MAX_SURGE_MULTIPLIER, 'supply=0 → max surge')
  assert(r.demandFactor === Infinity, 'supply=0 → Infinity')
}
{
  const r = calculateSurgeMultiplier(0, 10)
  assert(r.multiplier === 1.0, 'demand=0 → no surge')
}

// ═════════════════════════════════════════════════
//  2. calculatePeakMultiplier
// ═════════════════════════════════════════════════
console.log('\n⏰  calculatePeakMultiplier')

{
  const d = new Date(); d.setHours(9, 0, 0, 0)
  const r = calculatePeakMultiplier(d)
  assert(r.isPeak && r.multiplier === 1.25, '9 AM → 1.25×')
}
{
  const d = new Date(); d.setHours(18, 0, 0, 0)
  const r = calculatePeakMultiplier(d)
  assert(r.isPeak && r.multiplier === 1.30, '6 PM → 1.30×')
}
{
  const d = new Date(); d.setHours(14, 0, 0, 0)
  const r = calculatePeakMultiplier(d)
  assert(!r.isPeak && r.multiplier === 1.0, '2 PM → off-peak 1.0×')
}
{
  const d = new Date(); d.setHours(0, 0, 0, 0)
  assert(!calculatePeakMultiplier(d).isPeak, 'midnight → off-peak')
}

// ═════════════════════════════════════════════════
//  3. calculateOccupancyMultiplier  (NEW)
// ═════════════════════════════════════════════════
console.log('\n🪑  calculateOccupancyMultiplier')

{
  // 1/4 seats filled → ratio 0.25 → multiplier 1.75
  const r = calculateOccupancyMultiplier(1, 4)
  assert(approx(r.multiplier, 1.75), `1/4 filled → 1.75× (got ${r.multiplier})`)
  assert(approx(r.occupancyRatio, 0.25), '1/4 → ratio 0.25')
}
{
  // 2/4 seats filled → ratio 0.5 → multiplier 1.5
  const r = calculateOccupancyMultiplier(2, 4)
  assert(approx(r.multiplier, 1.5), `2/4 filled → 1.50× (got ${r.multiplier})`)
  assert(approx(r.occupancyRatio, 0.5), '2/4 → ratio 0.50')
}
{
  // 4/4 seats filled → full → multiplier 1.0 (no penalty)
  const r = calculateOccupancyMultiplier(4, 4)
  assert(approx(r.multiplier, 1.0), `4/4 filled → 1.00× (got ${r.multiplier})`)
  assert(approx(r.occupancyRatio, 1.0), '4/4 → ratio 1.00')
}
{
  // EDGE: seatsFilled = 0 → treated as 1
  const r = calculateOccupancyMultiplier(0, 4)
  assert(r.multiplier >= 1.0, 'seats_filled=0 → no crash, ≥1×')
}
{
  // EDGE: overbooking guard — filled > total → clamped
  const r = calculateOccupancyMultiplier(10, 4)
  assert(approx(r.occupancyRatio, 1.0), 'overbooking → ratio clamped to 1')
  assert(approx(r.multiplier, 1.0), 'overbooking → multiplier 1×')
}
{
  // EDGE: totalSeats > MAX_SEATS → clamped
  const r = calculateOccupancyMultiplier(8, 100)
  assert(r.occupancyRatio > 0 && r.multiplier > 0, `totalSeats>MAX_SEATS clamped (ratio ${r.occupancyRatio})`)
}

// ═════════════════════════════════════════════════
//  4. calculateSeatPrice  (NEW)
// ═════════════════════════════════════════════════
console.log('\n💺  calculateSeatPrice')

{
  // 4 filled, total₹200 → ₹50/seat → 1 seat = ₹50
  const r = calculateSeatPrice(200, 4, 1)
  assert(r.pricePerSeat === 50, `pricePerSeat = ₹50 (got ${r.pricePerSeat})`)
  assert(r.finalPriceForUser === 50, `1 seat = ₹50 (got ${r.finalPriceForUser})`)
}
{
  // Same ride, user books 2 seats
  const r = calculateSeatPrice(200, 4, 2)
  assert(r.finalPriceForUser === 100, `2 seats = ₹100 (got ${r.finalPriceForUser})`)
}
{
  // Min fare floor: tiny total → floor kicks in
  const r = calculateSeatPrice(10, 4, 1)
  assert(r.finalPriceForUser >= MIN_RIDE_PRICE, `min fare floor enforced (got ₹${r.finalPriceForUser})`)
}
{
  // EDGE: seatsRequested > seatsFilled → capped
  const r = calculateSeatPrice(200, 4, 10)
  assert(r.finalPriceForUser <= 200, 'overbooking seats → price capped')
}
{
  // EDGE: seatsFilled = 0 → treated as 1 (no division by zero)
  const r = calculateSeatPrice(200, 0, 1)
  assert(r.pricePerSeat > 0, 'seatsFilled=0 → no NaN')
}

// ═════════════════════════════════════════════════
//  5. calculateFinalPrice — seat scenarios
// ═════════════════════════════════════════════════
console.log('\n💰  calculateFinalPrice — seat-based scenarios')

const offPeak = new Date(); offPeak.setHours(14, 0, 0, 0)
const baseParams = { distance: 10, demand: 5, supply: 5, currentTime: offPeak }

{
  // LOW occupancy: 1 of 4 seats filled
  const r = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 1, seatsRequestedByUser: 1 })
  // base = (30+120) = 150, surge=1.0, peak=1.0, occupancy=1.75 → afterOccupancy=262.5, /1seat = 262.5
  assert(r.occupancyMultiplier === 1.75, `1/4 occ → 1.75× (got ${r.occupancyMultiplier})`)
  assert(approx(r.finalPriceForUser, 262.5, 1), `1/4 user price ≈₹262.5 (got ₹${r.finalPriceForUser})`)
}

{
  // MEDIUM occupancy: 2 of 4 seats filled
  const r = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 2, seatsRequestedByUser: 1 })
  // afterOccupancy = 150*1.5 = 225, /2 seats = ₹112.5
  assert(r.occupancyMultiplier === 1.5, `2/4 occ → 1.50× (got ${r.occupancyMultiplier})`)
  assert(approx(r.finalPriceForUser, 112.5, 1), `2/4 user price ≈₹112.5 (got ₹${r.finalPriceForUser})`)
}

{
  // FULL occupancy: 4 of 4 seats filled
  const r = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 4, seatsRequestedByUser: 1 })
  // afterOccupancy = 150*1.0 = 150, /4 seats = ₹37.5
  assert(r.occupancyMultiplier === 1.0, `4/4 occ → 1.00× (got ${r.occupancyMultiplier})`)
  assert(approx(r.finalPriceForUser, 37.5, 1), `4/4 user price ≈₹37.5 (got ₹${r.finalPriceForUser})`)
}

{
  // Incentive check: more passengers = cheaper per seat
  const low  = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 1, seatsRequestedByUser: 1 })
  const full = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 4, seatsRequestedByUser: 1 })
  assert(full.finalPriceForUser < low.finalPriceForUser, 'full ride cheaper per user than underfilled')
}

{
  // User books 2 seats in a 4-seat full ride
  const r = calculateFinalPrice({ ...baseParams, totalSeats: 4, seatsFilled: 4, seatsRequestedByUser: 2 })
  // afterOccupancy=150, /4*2 = 75
  assert(approx(r.finalPriceForUser, 75, 1), `2-seat booking in full ride ≈₹75 (got ₹${r.finalPriceForUser})`)
}

{
  // Surge + peak + occupancy combined
  const morning = new Date(); morning.setHours(9, 0, 0, 0)
  const r = calculateFinalPrice({
    distance: 10, demand: 15, supply: 5, currentTime: morning,
    totalSeats: 4, seatsFilled: 1, seatsRequestedByUser: 1,
  })
  assert(r.surgeMultiplier === MAX_SURGE_MULTIPLIER, 'surge at max')
  assert(r.isPeakHour, 'peak detected')
  assert(r.occupancyMultiplier === 1.75, 'occupancy penalty applied')
  // (30+120)*2.5*1.25*1.75 = 820.3125
  assert(approx(r.finalPriceForUser, 820.3, 1), `combined multipliers ≈₹820 (got ₹${r.finalPriceForUser})`)
}

{
  // EDGE: MAX_SEATS cap enforced (totalSeats > 8)
  const r = calculateFinalPrice({ ...baseParams, totalSeats: 20, seatsFilled: 8, seatsRequestedByUser: 1 })
  assert(r.occupancyRatio === 1.0, 'totalSeats>MAX_SEATS clamped → ratio=1')
}

{
  // EDGE: supply=0 + seats
  const r = calculateFinalPrice({ distance: 5, supply: 0, demand: 10, totalSeats: 4, seatsFilled: 2 })
  assert(r.surgeMultiplier === MAX_SURGE_MULTIPLIER, 'supply=0 → max surge enforced')
}

{
  // EDGE: price cap
  const r = calculateFinalPrice({ distance: 1000, demand: 30, supply: 5, totalSeats: 1, seatsFilled: 1, vehicleType: 'Cab' })
  assert(r.totalRidePrice <= MAX_PRICE_CAP, `price cap enforced (got ₹${r.totalRidePrice})`)
}

{
  // Legacy compat: old `passengers` param still works
  const legacy = calculateFinalPrice({ distance: 10, passengers: 3, currentTime: offPeak })
  assert(typeof legacy.finalPriceForUser === 'number', 'legacy passengers param still works')
}

// ═════════════════════════════════════════════════
//  6. calculatePriceRange legacy shim
// ═════════════════════════════════════════════════
console.log('\n🔁  calculatePriceRange (legacy shim)')
{
  const r = calculatePriceRange(10)
  assert(r.min <= r.suggested && r.suggested <= r.max, 'min ≤ suggested ≤ max')
  assert(r.distanceKm === 10, 'distanceKm echoed')
  assert(typeof r.surgeMultiplier === 'number', 'exposes surgeMultiplier')
}

// ═════════════════════════════════════════════════
//  7. MAX_SEATS constant
// ═════════════════════════════════════════════════
console.log('\n🔒  MAX_SEATS constant')
{
  assert(MAX_SEATS === 8, `MAX_SEATS = 8 (got ${MAX_SEATS})`)
}

// ═════════════════════════════════════════════════
//  8. haversineDistance
// ═════════════════════════════════════════════════
console.log('\n🌐  haversineDistance')
{
  assert(approx(haversineDistance(28.6139, 77.209, 28.6139, 77.209), 0, 0.001), 'same point → 0 km')
}
{
  const d = haversineDistance(28.6139, 77.209, 19.076, 72.877)
  assert(d > 1100 && d < 1300, `Delhi→Mumbai ~1148 km (got ${d.toFixed(0)} km)`)
}

// ═════════════════════════════════════════════════
//  Summary
// ═════════════════════════════════════════════════
console.log(`\n${'─'.repeat(52)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
