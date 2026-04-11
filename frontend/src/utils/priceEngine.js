// ============================================================
//  priceEngine.js  —  Dynamic Ride-Sharing Pricing Engine
//  Mirrors production logic used in systems like Uber / Ola
// ============================================================

// ──────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────

/** Minimum guaranteed fare per seat regardless of any discount */
export const MIN_RIDE_PRICE = 30          // ₹

/** Fixed component added to every ride before per-km billing */
export const BASE_FARE = 25               // ₹

/** Default cost per kilometre before multipliers */
export const PER_KM_RATE = 10            // ₹ / km

/** Hard ceiling on the total surge multiplier */
export const MAX_SURGE_MULTIPLIER = 2.5

/**
 * Hard cap on bookable seats per ride across the entire app.
 * Enforced in both the engine and the CreateRide UI.
 */
export const MAX_SEATS = 8

/** Vehicle-type base multipliers (applied before surge) */
export const VEHICLE_MULTIPLIERS = {
  Auto: 1.0,
  Cab:  1.4,
}

/** Absolute upper cap on a single ride fare (total vehicle) */
export const MAX_PRICE_CAP = 5000        // ₹

// ──────────────────────────────────────────────────────────
//  Peak Hour Windows  (24-h format, inclusive ranges)
// ──────────────────────────────────────────────────────────
const PEAK_WINDOWS = [
  { start: 8,  end: 11, multiplier: 1.15 }, // Morning rush
  { start: 17, end: 21, multiplier: 1.20 }, // Evening rush
]

// ──────────────────────────────────────────────────────────
//  1.  Surge / Demand Multiplier
// ──────────────────────────────────────────────────────────
/**
 * Calculates the demand-based surge multiplier.
 *
 * Logic:
 *   demand_factor = demand / supply
 *   Linearly normalized into [1.0, MAX_SURGE_MULTIPLIER].
 *   demand_factor ≤ 1  → supply ≥ demand → no surge (1.0×)
 *   demand_factor ≥ 3  → fully saturated → MAX_SURGE_MULTIPLIER
 *
 * Edge case: supply = 0  → treat as fully saturated (max surge).
 *
 * @param {number} demand  - Number of active ride requests in the area
 * @param {number} supply  - Number of available drivers in the area
 * @returns {{ multiplier: number, demandFactor: number }}
 */
export function calculateSurgeMultiplier(demand, supply) {
  // Guard: no drivers available → maximum surge
  if (supply <= 0) {
    return { multiplier: MAX_SURGE_MULTIPLIER, demandFactor: Infinity }
  }

  // Guard: no demand at all → no surge
  if (demand <= 0) {
    return { multiplier: 1.0, demandFactor: 0 }
  }

  const demandFactor = demand / supply

  // Below or at parity → normal pricing
  if (demandFactor <= 1.0) {
    return { multiplier: 1.0, demandFactor }
  }

  // Linearly scale demandFactor from [1, 3] → multiplier [1.0, MAX_SURGE_MULTIPLIER]
  const SATURATION_THRESHOLD = 3.0
  const normalized = Math.min(demandFactor, SATURATION_THRESHOLD)
  const ratio      = (normalized - 1.0) / (SATURATION_THRESHOLD - 1.0) // 0 → 1
  const multiplier = 1.0 + ratio * (MAX_SURGE_MULTIPLIER - 1.0)

  return {
    multiplier:   parseFloat(multiplier.toFixed(2)),
    demandFactor: parseFloat(demandFactor.toFixed(2)),
  }
}

// ──────────────────────────────────────────────────────────
//  2.  Peak Hour Multiplier
// ──────────────────────────────────────────────────────────
/**
 * Returns the peak-hour multiplier for a given Date (or now).
 *
 * If the hour falls inside multiple windows the highest multiplier wins.
 *
 * @param {Date} [date=new Date()]
 * @returns {{ multiplier: number, isPeak: boolean, windowLabel: string|null }}
 */
export function calculatePeakMultiplier(date = new Date()) {
  const hour = date.getHours() // 0–23 local time

  let bestMultiplier = 1.0
  let windowLabel    = null

  for (const win of PEAK_WINDOWS) {
    if (hour >= win.start && hour <= win.end) {
      if (win.multiplier > bestMultiplier) {
        bestMultiplier = win.multiplier
        windowLabel    = `${win.start}:00–${win.end}:00`
      }
    }
  }

  return {
    multiplier: parseFloat(bestMultiplier.toFixed(2)),
    isPeak:     bestMultiplier > 1.0,
    windowLabel,
  }
}

// ──────────────────────────────────────────────────────────
//  3.  Occupancy Multiplier  (NEW)
// ──────────────────────────────────────────────────────────
/**
 * Penalises underfilled vehicles so early bookers bear more cost,
 * and incentivises filling seats (full vehicle → no penalty).
 *
 * Formula:
 *   occupancy_ratio      = seats_filled / total_seats          [0 → 1]
 *   occupancy_multiplier = 1 + 0.5 × (1 − occupancy_ratio)   [1.0 → 1.5]
 *
 *   The 0.5 factor keeps the penalty moderate (max +50 % instead of +100 %).
 *
 * Examples:
 *   1/4 filled → ratio 0.25  → multiplier 1.375  (37.5 % penalty)
 *   2/4 filled → ratio 0.50  → multiplier 1.250  (25 % penalty)
 *   4/4 filled → ratio 1.00  → multiplier 1.000  (no penalty)
 *
 * Edge cases:
 *   seats_filled = 0     → treated as 1 (avoid zero division; first booker pays full)
 *   seats_filled > total → capped at total (overbooking guard)
 *   total_seats  > MAX_SEATS → clamped to MAX_SEATS
 *
 * @param {number} seatsFilled   - Seats currently occupied (incl. current user)
 * @param {number} totalSeats    - Vehicle capacity
 * @returns {{ multiplier: number, occupancyRatio: number }}
 */
export function calculateOccupancyMultiplier(seatsFilled, totalSeats) {
  // Clamp total seats to the app-wide hard cap
  const clampedTotal = Math.min(Math.max(totalSeats, 1), MAX_SEATS)

  // Overbooking guard: filled can never exceed total
  const clampedFilled = Math.min(Math.max(seatsFilled, 1), clampedTotal)

  const occupancyRatio = clampedFilled / clampedTotal
  // 0.5 dampening factor: max penalty is +50% (full empty) not +100%
  const multiplier     = 1 + 0.5 * (1 - occupancyRatio)

  return {
    multiplier:    parseFloat(multiplier.toFixed(4)),
    occupancyRatio: parseFloat(occupancyRatio.toFixed(4)),
  }
}

// ──────────────────────────────────────────────────────────
//  4.  Seat Price Calculator  (NEW)
// ──────────────────────────────────────────────────────────
/**
 * Distributes the total (post-surge, post-peak, post-occupancy) ride cost
 * proportionally across seats, then applies the user's seat count.
 *
 * Formula:
 *   price_per_seat   = adjusted_total / seats_filled
 *   user_price       = price_per_seat × seats_requested_by_user
 *
 * Edge cases:
 *   seats_requested  = 0               → treated as 1
 *   seats_requested  > seats_filled    → capped at seats_filled
 *   result < MIN_RIDE_PRICE × seats    → floored at minimum
 *
 * @param {number} adjustedTotal          - Total ride cost after all multipliers
 * @param {number} seatsFilled            - Total occupied seats in vehicle
 * @param {number} seatsRequestedByUser   - Seats this user is booking
 * @returns {{
 *   pricePerSeat:      number,
 *   finalPriceForUser: number,
 * }}
 */
export function calculateSeatPrice(adjustedTotal, seatsFilled, seatsRequestedByUser) {
  const safeTotal     = Math.max(adjustedTotal, 0)
  const safeFilled    = Math.max(seatsFilled, 1)
  const safeRequested = Math.min(Math.max(seatsRequestedByUser, 1), safeFilled)

  const pricePerSeat    = safeTotal / safeFilled
  const rawUserPrice    = pricePerSeat * safeRequested

  // Enforce minimum fare per seat booked
  const minForUser      = MIN_RIDE_PRICE * safeRequested
  const finalPriceForUser = Math.max(minForUser, parseFloat(rawUserPrice.toFixed(2)))

  return {
    pricePerSeat:      parseFloat(pricePerSeat.toFixed(2)),
    finalPriceForUser: parseFloat(finalPriceForUser.toFixed(2)),
  }
}

// ──────────────────────────────────────────────────────────
//  5.  Master Price Calculator  (updated)
// ──────────────────────────────────────────────────────────
/**
 * Calculates the complete fare breakdown for a seat-based shared ride.
 *
 * Full pipeline:
 *   1. base_component    = baseFare + (distance × ratePerKm)
 *   2. vehicle_adjusted  = base_component × vehicleMultiplier
 *   3. after_surge       = vehicle_adjusted × surgeMultiplier
 *   4. after_peak        = after_surge × peakMultiplier          (capped at MAX_PRICE_CAP)
 *   5. after_occupancy   = after_peak × occupancyMultiplier
 *   6. price_per_seat    = after_occupancy / seats_filled
 *   7. user_price        = price_per_seat × seats_requested      (floored at MIN_RIDE_PRICE × seats)
 *
 * @param {Object} params
 * @param {number}  params.distance              - Trip distance in km
 * @param {number}  [params.baseFare]            - Fixed base fare (₹)
 * @param {number}  [params.ratePerKm]           - Per-km rate (₹)
 * @param {number}  [params.demand]              - Ride requests in area
 * @param {number}  [params.supply]              - Available drivers
 * @param {Date}    [params.currentTime]         - For peak detection
 * @param {string}  [params.vehicleType]         - 'Auto' | 'Cab'
 * @param {number}  [params.totalSeats]          - Vehicle capacity (max MAX_SEATS)
 * @param {number}  [params.seatsFilled]         - Seats currently booked (incl. this user)
 * @param {number}  [params.seatsRequestedByUser]- Seats this user wants
 *
 * — Legacy compat params (still accepted, ignored when seat params present) —
 * @param {number}  [params.passengers]          - Falls back to seatsFilled if set
 *
 * @returns {{
 *   totalRidePrice:       number,
 *   occupancyAdjusted:    number,
 *   pricePerSeat:         number,
 *   finalPriceForUser:    number,
 *   surgeMultiplier:      number,
 *   peakMultiplier:       number,
 *   occupancyMultiplier:  number,
 *   occupancyRatio:       number,
 *   isPeakHour:           boolean,
 *   demandFactor:         number,
 *   breakdown: {
 *     baseFare:           number,
 *     distanceCost:       number,
 *     vehicleAdjusted:    number,
 *     afterSurge:         number,
 *     afterPeak:          number,
 *     afterOccupancy:     number,
 *   }
 * }}
 */
export function calculateFinalPrice({
  distance,
  baseFare              = BASE_FARE,
  ratePerKm             = PER_KM_RATE,
  demand                = 1,
  supply                = 1,
  currentTime           = new Date(),
  vehicleType           = 'Auto',
  // Seat-based params (new)
  totalSeats            = 4,
  seatsFilled           = 1,
  seatsRequestedByUser  = 1,
  // Legacy compat
  passengers,
} = {}) {

  // ── Edge-case guards ──────────────────────────────────────
  if (distance < 0) distance = 0

  // Back-compat: if only `passengers` supplied, map to seat model
  if (passengers != null && seatsFilled === 1) {
    seatsFilled          = Math.max(passengers, 1)
    seatsRequestedByUser = 1
  }

  // Clamp seats to app-wide max
  totalSeats           = Math.min(Math.max(totalSeats, 1), MAX_SEATS)
  seatsFilled          = Math.min(Math.max(seatsFilled, 1), totalSeats)
  seatsRequestedByUser = Math.min(Math.max(seatsRequestedByUser, 1), seatsFilled)

  // ── Vehicle multiplier ────────────────────────────────────
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1.0

  // ── Step 1: Base component ────────────────────────────────
  const distanceCost    = parseFloat((distance * ratePerKm).toFixed(2))
  const baseComponent   = parseFloat((baseFare + distanceCost).toFixed(2))
  const vehicleAdjusted = parseFloat((baseComponent * vehicleMultiplier).toFixed(2))

  // ── Step 2: Surge multiplier ──────────────────────────────
  const { multiplier: surgeMultiplier, demandFactor } =
    calculateSurgeMultiplier(demand, supply)
  const afterSurge = parseFloat((vehicleAdjusted * surgeMultiplier).toFixed(2))

  // ── Step 3: Peak-hour multiplier ──────────────────────────
  const { multiplier: peakMultiplier, isPeak: isPeakHour } =
    calculatePeakMultiplier(currentTime)
  const afterPeak = parseFloat((afterSurge * peakMultiplier).toFixed(2))

  // ── Step 4: Cap total ride price ──────────────────────────
  const totalRidePrice = Math.min(afterPeak, MAX_PRICE_CAP)

  // ── Step 5: Occupancy multiplier ──────────────────────────
  const { multiplier: occupancyMultiplier, occupancyRatio } =
    calculateOccupancyMultiplier(seatsFilled, totalSeats)
  const afterOccupancy = parseFloat(
    Math.min(totalRidePrice * occupancyMultiplier, MAX_PRICE_CAP).toFixed(2)
  )

  // ── Step 6: Split by seats ────────────────────────────────
  const { pricePerSeat, finalPriceForUser } =
    calculateSeatPrice(afterOccupancy, seatsFilled, seatsRequestedByUser)

  return {
    totalRidePrice:      parseFloat(totalRidePrice.toFixed(2)),
    occupancyAdjusted:   afterOccupancy,
    pricePerSeat,
    finalPriceForUser,
    surgeMultiplier,
    peakMultiplier,
    occupancyMultiplier,
    occupancyRatio:      parseFloat(occupancyRatio.toFixed(4)),
    isPeakHour,
    demandFactor:        isFinite(demandFactor) ? demandFactor : 99,
    breakdown: {
      baseFare:        parseFloat(baseFare.toFixed(2)),
      distanceCost,
      vehicleAdjusted,
      afterSurge,
      afterPeak:       parseFloat(afterPeak.toFixed(2)),
      afterOccupancy,
    },
  }
}

// ──────────────────────────────────────────────────────────
//  6.  Haversine Distance Helper  (unchanged)
// ──────────────────────────────────────────────────────────
/**
 * Returns straight-line distance in km between two lat/lng points.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ──────────────────────────────────────────────────────────
//  7.  Legacy API shim  (backward-compatible, unchanged sig)
// ──────────────────────────────────────────────────────────
/**
 * Returns { min, max, suggested, estimated, distanceKm, surgeMultiplier, isPeakHour }
 * Wraps calculateFinalPrice() so existing call-sites keep working unchanged.
 */
export function calculatePriceRange(
  distanceKm,
  vehicleType = 'Auto',
  { demand = 1, supply = 1, passengers = 1, currentTime = new Date() } = {}
) {
  const result = calculateFinalPrice({
    distance:    distanceKm,
    demand,
    supply,
    passengers,
    currentTime,
    vehicleType,
  })

  const estimated = result.finalPriceForUser
  const max       = Math.min(MAX_PRICE_CAP, Math.round(estimated * 1.25))
  const min       = Math.max(MIN_RIDE_PRICE, Math.round(estimated * 0.85))

  return {
    min,
    max,
    suggested:       Math.round(estimated),
    estimated:       Math.round(estimated),
    distanceKm,
    surgeMultiplier: result.surgeMultiplier,
    isPeakHour:      result.isPeakHour,
  }
}
