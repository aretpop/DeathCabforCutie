import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function CancelRideButton({ rideId, currentUserId, driverId, onCancelled }) {
  const [loading, setLoading] = useState(false)

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this ride? This will negatively affect your rating.")) return
    
    setLoading(true)
    try {
      // 1. Update ride status
      await supabase.from('rides').update({ status: 'cancelled' }).eq('id', rideId)

      // 1.5. Free the assigned registered vehicle
      if (driverId) {
        await supabase.from('registered_vehicles').update({ status: 'Available' }).eq('id', driverId)
      }
      
      // 2. Fetch approved passengers
      const { data: passengers } = await supabase
        .from('ride_requests')
        .select('user_id')
        .eq('ride_id', rideId)
        .eq('status', 'approved')
      
      // 3. Insert automatic negative reviews for each passenger
      if (passengers && passengers.length > 0) {
        const reviews = passengers.map(p => ({
          ride_id: rideId,
          reviewer_id: p.user_id, // passenger is the reviewer
          reviewee_id: currentUserId, // publisher is the reviewee
          review_type: 'rider_review',
          did_ride_happen: false,
          rating: 1, // Can assume lowest rating or just leave null if "did_ride_happen=false" implies no rating. Using 1 here.
          comment: 'Ride cancelled by publisher.'
        }))
        await supabase.from('ride_reviews').upsert(reviews, { onConflict: 'ride_id, reviewer_id, reviewee_id' })
      }
      
      onCancelled()
    } catch (err) {
      console.error(err)
      alert("Failed to cancel ride.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="btn" style={{ background: '#ef4444', marginTop: '1rem' }} onClick={handleCancel} disabled={loading}>
      {loading ? 'Cancelling...' : 'Cancel Ride'}
    </button>
  )
}
