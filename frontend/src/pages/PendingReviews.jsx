import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, Clock, Star, Car, X } from 'lucide-react'

export default function PendingReviews() {
  const { user } = useAuth()
  const [pendingReviews, setPendingReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchPendingReviews()
  }, [user])

  const fetchPendingReviews = async () => {
    setLoading(true)
    try {
      // ── 1. Rides user published (as creator) that need reviews ─
      const { data: publisherRides } = await supabase
        .from('rides')
        .select('id, pickup_location_name, destination_name, departure_time, assigned_driver_id, drivers:assigned_driver_id(name)')
        .eq('creator_id', user.id)
        .in('status', ['awaiting_reviews', 'completed'])

      // ── 2. Rides user joined as approved passenger ─────────────
      const { data: riderRequests } = await supabase
        .from('ride_requests')
        .select(`
          ride_id,
          rides!inner (
            id,
            pickup_location_name,
            destination_name,
            departure_time,
            creator_id,
            status,
            assigned_driver_id,
            drivers:assigned_driver_id(name)
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .in('rides.status', ['awaiting_reviews', 'completed'])

      const riderRides = riderRequests?.map(r => r.rides) || []

      // ── 3. All reviews this user has already submitted ─────────
      const { data: myReviews } = await supabase
        .from('ride_reviews')
        .select('ride_id, reviewee_id, driver_id, review_type')
        .eq('reviewer_id', user.id)

      // Peer review map: ride_id → Set of reviewee_ids
      const peerReviewMap = new Map()
      // Driver review set: Set of ride_ids where user already reviewed driver
      const driverReviewedRides = new Set()

      myReviews?.forEach(r => {
        if (r.review_type === 'rider_to_driver' && r.driver_id) {
          driverReviewedRides.add(r.ride_id)
        } else {
          if (!peerReviewMap.has(r.ride_id)) peerReviewMap.set(r.ride_id, new Set())
          peerReviewMap.get(r.ride_id).add(r.reviewee_id)
        }
      })

      // ── Batch fetch all approved passengers for publisher rides ──
      const publisherRideIds = (publisherRides || [])
        .filter(pr => ['awaiting_reviews', 'completed'].includes(pr.status ?? 'awaiting_reviews'))
        .map(pr => pr.id)

      let allPassengers = []
      if (publisherRideIds.length > 0) {
        const { data } = await supabase
          .from('ride_requests')
          .select('ride_id, user_id')
          .in('ride_id', publisherRideIds)
          .eq('status', 'approved')
        if (data) allPassengers = data
      }

      const passengersByRide = {}
      allPassengers.forEach(p => {
        if (!passengersByRide[p.ride_id]) passengersByRide[p.ride_id] = []
        passengersByRide[p.ride_id].push(p)
      })

      const pending = []
      const dismissedIds = JSON.parse(localStorage.getItem('dismissed_pending_reviews') || '[]')

      // ── 4. Check publisher pending reviews ─────────────────────
      for (const pr of publisherRides || []) {
        if (!['awaiting_reviews', 'completed'].includes(pr.status ?? 'awaiting_reviews')) continue
        if (dismissedIds.includes(pr.id)) continue

        const passengers = passengersByRide[pr.id] || []

        const hasPendingPeer = passengers.some(
          p => !peerReviewMap.get(pr.id)?.has(p.user_id)
        )
        const hasPendingDriver = pr.assigned_driver_id && !driverReviewedRides.has(pr.id)

        if (hasPendingPeer || hasPendingDriver) {
          pending.push({
            ...pr,
            role: 'Publisher',
            pendingDriver: hasPendingDriver,
            driverName: pr.drivers?.name ?? null,
          })
        }
      }

      // ── 5. Check rider pending reviews ─────────────────────────
      for (const rr of riderRides || []) {
        if (dismissedIds.includes(rr.id)) continue
        const hasPendingPeer = !peerReviewMap.get(rr.id)?.has(rr.creator_id)
        const hasPendingDriver = rr.assigned_driver_id && !driverReviewedRides.has(rr.id)

        if (hasPendingPeer || hasPendingDriver) {
          pending.push({
            ...rr,
            role: 'Rider',
            pendingDriver: hasPendingDriver,
            driverName: rr.drivers?.name ?? null,
          })
        }
      }

      setPendingReviews(pending)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = (rideId) => {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_pending_reviews') || '[]')
    if (!dismissed.includes(rideId)) {
      dismissed.push(rideId)
      localStorage.setItem('dismissed_pending_reviews', JSON.stringify(dismissed))
    }
    setPendingReviews(prev => prev.filter(r => r.id !== rideId))
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading pending reviews...</div>

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Pending Reviews</h2>

      {pendingReviews.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Star size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3>You're all caught up!</h3>
          <p style={{ color: 'var(--text-muted)' }}>You have no pending reviews to submit.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {pendingReviews.map(ride => (
            <div key={`${ride.id}-${ride.role}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Role badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: ride.role === 'Publisher' ? 'var(--primary)' : 'var(--accent)' }}>
                  As {ride.role}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '12px' }}>
                    Action Required
                  </span>
                  <button 
                    type="button" 
                    title="Dismiss notification"
                    onClick={() => handleDismiss(ride.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* What needs reviewing */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {/* Driver badge if pending */}
                {ride.pendingDriver && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    fontSize: '0.8rem', color: 'var(--primary)',
                    background: 'rgba(99,102,241,0.1)', padding: '0.2rem 0.6rem',
                    borderRadius: '999px', alignSelf: 'flex-start'
                  }}>
                    <Car size={12} />
                    Rate driver{ride.driverName ? `: ${ride.driverName}` : ''}
                  </div>
                )}
              </div>

              {/* Route */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.25rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                  {ride.pickup_location_name}
                </div>
                <div style={{ borderLeft: '1px dashed var(--border)', height: '10px', marginLeft: '3px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <MapPin size={12} color="var(--accent)" style={{ marginLeft: '-2px', flexShrink: 0 }} />
                  {ride.destination_name}
                </div>
              </div>

              {/* Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'auto' }}>
                <Clock size={14} />
                {new Date(ride.departure_time).toLocaleDateString()} at{' '}
                {new Date(ride.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              <Link
                to={`/ride/${ride.id}`}
                className="btn"
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', textAlign: 'center', background: 'var(--primary)', boxSizing: 'border-box' }}
              >
                Review Now
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
