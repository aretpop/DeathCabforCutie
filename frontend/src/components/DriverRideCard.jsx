import React, { useState } from 'react'
import { MapPin, Clock, IndianRupee, Navigation, Route, Car, CheckCircle2, Calendar, MessageCircle } from 'lucide-react'
import NegotiationPanel from './NegotiationPanel'
import { navigateToPickup, navigateRide } from '../utils/geoUtils'
import { supabase } from '../supabaseClient'
import { PRIORITY_CONFIG } from '../utils/priorityEngine'
import { formatRideDateTime } from '../utils/dateUtils'
import { useNotifications } from '../contexts/NotificationContext'

const STATUS_COLORS = {
  pending_driver: '#f59e0b',
  negotiating: '#6366f1',
  price_proposed: '#a78bfa',
  published: '#22c55e',
  rejected: '#ef4444',
}

const STATUS_LABELS = {
  pending_driver: 'New Request',
  negotiating: 'Negotiating',
  price_proposed: 'Your Offer Pending',
  published: 'Accepted',
  rejected: 'Rejected',
}

export default function DriverRideCard({ ride, onUpdate }) {
  const [hasReachedPickup, setHasReachedPickup] = useState(ride.status === 'active')
  const [completing, setCompleting] = useState(false)
  const isAccepted = ['published', 'active'].includes(ride.status)
  
  const { getUnreadChatCount } = useNotifications()
  const unreadCount = getUnreadChatCount(ride.id)

  // ── Mark ride as completed (driver side) ───────────────────────────────────
  // Mirrors the creator-side handleCompleteRide in RideDetails.jsx:
  //   • Frees the registered vehicle (if assigned)
  //   • If passengers exist → awaiting_reviews (so reviews can be submitted)
  //   • If no passengers    → completed immediately
  const handleCompleteRide = async () => {
    if (completing) return
    const ok = window.confirm('Mark this ride as completed?')
    if (!ok) return
    setCompleting(true)
    try {
      // Free the registered vehicle so it's available for new rides
      if (ride.driver_id) {
        await supabase
          .from('registered_vehicles')
          .update({ status: 'Available' })
          .eq('id', ride.driver_id)
      }

      // Check how many approved passengers are on the ride
      const { data: reqs } = await supabase
        .from('ride_requests')
        .select('id')
        .eq('ride_id', ride.id)
        .eq('status', 'approved')

      const hasPassengers = (reqs?.length ?? 0) > 0
      const newStatus = hasPassengers ? 'awaiting_reviews' : 'completed'

      await supabase
        .from('rides')
        .update({ status: newStatus })
        .eq('id', ride.id)

      onUpdate?.()
    } catch (err) {
      console.error('[DriverRideCard] handleCompleteRide error:', err)
      alert('Could not mark ride as completed. Please try again.')
    } finally {
      setCompleting(false)
    }
  }

  const dist = (() => {
    const R = 6371
    const dLat = ((ride.destination_lat - ride.pickup_lat) * Math.PI) / 180
    const dLng = ((ride.destination_lng - ride.pickup_lng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((ride.pickup_lat * Math.PI) / 180) *
        Math.cos((ride.destination_lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1)
  })()

  const statusColor = STATUS_COLORS[ride.status] || 'var(--text-muted)'
  const statusLabel = STATUS_LABELS[ride.status] || ride.status

  // Priority
  const pType  = ride.priority_type || 'NORMAL'
  const pCfg   = PRIORITY_CONFIG[pType] || PRIORITY_CONFIG.NORMAL
  const hasPriority = pType !== 'NORMAL'
  const isEmergency = pType === 'EMERGENCY'

  return (
    <>
      {/* Pulse keyframe for emergency */}
      <style>{`
        @keyframes priority-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>
    <div
      style={{
        background: hasPriority ? pCfg.bg : 'var(--bg-card)',
        border: `1px solid ${hasPriority ? pCfg.border : statusColor + '30'}`,
        borderRadius: '16px',
        overflow: 'hidden',
        animation: isEmergency ? 'priority-pulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      {/* Card Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Priority badge — full-width strip for emergency */}
        {hasPriority && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.25rem 0.7rem', borderRadius: '999px',
            background: pCfg.bg, border: `1px solid ${pCfg.border}`,
            color: pCfg.color, fontSize: '0.75rem', fontWeight: '800',
            marginBottom: '0.5rem',
            letterSpacing: '0.03em',
          }}>
            {pCfg.emoji} {pCfg.label.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, paddingRight: '1rem' }}>
          {/* Pickup → Destination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              <MapPin size={14} color="#22c55e" />
              <span style={{ fontWeight: '600' }}>{ride.pickup_location_name}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <MapPin size={14} color="#ef4444" />
            <span style={{ fontWeight: '600' }}>{ride.destination_name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
          <div style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: `${statusColor}20`,
            color: statusColor,
            fontSize: '0.75rem',
            fontWeight: '700',
            textTransform: 'uppercase'
          }}>
            {statusLabel}
          </div>
          {ride.vehicle_type && (
            <div style={{
              padding: '0.15rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: '600',
              background: ride.vehicle_type === 'cab' ? 'rgba(99,102,241,0.15)' : 'rgba(234,179,8,0.15)',
              color: ride.vehicle_type === 'cab' ? '#818cf8' : '#ca8a04',
              border: `1px solid ${ride.vehicle_type === 'cab' ? 'rgba(99,102,241,0.3)' : 'rgba(234,179,8,0.3)'}`,
            }}>
              {ride.vehicle_type === 'cab' ? '🚕 Cab' : '🛺 Auto'}
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        padding: '0.75rem 1.25rem',
        display: 'flex',
        gap: '1.5rem',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Navigation size={13} />
          {dist} km
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Calendar size={13} />
          {formatRideDateTime(ride.departure_time)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <IndianRupee size={13} />
          Range: ₹{ride.min_price} – ₹{ride.max_price}
        </div>
      </div>

      {/* Priority note callout */}
      {hasPriority && ride.priority_notes && (
        <div style={{
          margin: '0 1.25rem',
          padding: '0.6rem 0.85rem',
          borderRadius: '8px',
          background: pCfg.bg,
          border: `1px solid ${pCfg.border}`,
          color: pCfg.color,
          fontSize: '0.82rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.4rem',
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{pCfg.emoji}</span>
          <span style={{ opacity: 0.95 }}>{ride.priority_notes}</span>
        </div>
      )}

      {/* Negotiation Panel */}
      <div style={{ padding: '1.25rem' }}>
        <NegotiationPanel ride={ride} offer={ride.offer} onRideUpdate={onUpdate} isDriverView={true} />
      </div>

      {/* Driver Navigation + Completion CTAs (Visible only for accepted rides) */}
      {isAccepted && (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

          {/* Go to Pickup */}
          <button
            onClick={() => {
              navigateToPickup(ride.pickup_lat, ride.pickup_lng);
              setHasReachedPickup(true);
            }}
            disabled={!ride.pickup_lat || !ride.pickup_lng}
            title={!ride.pickup_lat ? 'Location unavailable' : 'Navigate to pickup location'}
            style={{
              flex: 1, minWidth: '140px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: 'var(--primary, #3b82f6)', color: '#fff',
              border: 'none', borderRadius: '8px', padding: '0.75rem',
              fontWeight: '600', cursor: 'pointer',
              opacity: !ride.pickup_lat ? 0.5 : 1, transition: '0.2s',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
          >
            <Car size={18} /> Go to Pickup
          </button>

          {/* Start Ride */}
          <button
            onClick={() => navigateRide(ride.pickup_lat, ride.pickup_lng, ride.destination_lat, ride.destination_lng)}
            disabled={!ride.destination_lat || (!hasReachedPickup && ride.status !== 'active')}
            title={!ride.destination_lat ? 'Location unavailable' : 'Start ride to destination'}
            style={{
              flex: 1, minWidth: '140px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: (!hasReachedPickup && ride.status !== 'active') ? 'rgba(255,255,255,0.05)' : '#22c55e',
              color: (!hasReachedPickup && ride.status !== 'active') ? 'var(--text-muted)' : '#fff',
              border: 'none', borderRadius: '8px', padding: '0.75rem',
              fontWeight: '600',
              cursor: (!hasReachedPickup && ride.status !== 'active') ? 'not-allowed' : 'pointer',
              opacity: !ride.destination_lat ? 0.5 : 1, transition: '0.2s',
              boxShadow: (!hasReachedPickup && ride.status !== 'active') ? 'none' : '0 4px 6px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => { if (hasReachedPickup || ride.status === 'active') e.currentTarget.style.filter = 'brightness(1.1)' }}
            onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
          >
            <Route size={18} /> Start Ride
          </button>

          {/* ── Chat with Riders ── */}
          <button
            onClick={() => window.location.href = `/ride/${ride.id}`}
            title="Chat with riders"
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
              border: '1.5px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '8px', padding: '0.75rem',
              fontWeight: '700', cursor: 'pointer',
              transition: '0.2s',
              fontSize: '0.95rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)' }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <MessageCircle size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-6px',
                  background: '#ef4444', color: 'white',
                  borderRadius: '999px', fontSize: '0.6rem', fontWeight: 'bold',
                  padding: '2px 5px', border: '1px solid var(--bg-card)'
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
            Chat with Riders
          </button>

          {/* ── Mark as Completed ── */}
          <button
            onClick={handleCompleteRide}
            disabled={completing}
            title="Mark this ride as completed"
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: completing ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.15)',
              color: '#22c55e',
              border: '1.5px solid rgba(34,197,94,0.4)',
              borderRadius: '8px', padding: '0.75rem',
              fontWeight: '700', cursor: completing ? 'not-allowed' : 'pointer',
              transition: '0.2s',
              fontSize: '0.95rem',
            }}
            onMouseEnter={(e) => { if (!completing) e.currentTarget.style.background = 'rgba(34,197,94,0.25)' }}
            onMouseLeave={(e) => { if (!completing) e.currentTarget.style.background = 'rgba(34,197,94,0.15)' }}
          >
            <CheckCircle2 size={18} />
            {completing ? 'Completing...' : 'Mark as Completed'}
          </button>

        </div>
      )}
    </div>
    </>
  )
}
