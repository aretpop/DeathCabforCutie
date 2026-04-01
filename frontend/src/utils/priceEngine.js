// Price Engine — calculates fair fare range based on distance and vehicle type

const BASE_FARE = 30          // ₹ minimum base fare
const PER_KM_RATE = 12        // ₹ per km
const MAX_PRICE_CAP = 500     // ₹ hard cap

export const VEHICLE_MULTIPLIERS = {
  Auto: 1.0,
  Cab: 1.4,
}

/**
 * Haversine formula — returns distance in km between two lat/lng points
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Returns { min, max, suggested, estimated, distanceKm } price in ₹
 */
export function calculatePriceRange(distanceKm, vehicleType = 'Auto') {
  const multiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1.0
  const estimated = (BASE_FARE + distanceKm * PER_KM_RATE) * multiplier
  const min = Math.max(BASE_FARE, Math.round(estimated * 0.85))
  const max = Math.min(MAX_PRICE_CAP, Math.round(estimated * 1.25))
  const suggested = Math.round(estimated)
  return { min, max, suggested, estimated: Math.round(estimated), distanceKm }
}
