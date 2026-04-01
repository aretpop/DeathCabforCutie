import React from 'react'
import { MapPin, Clock, IndianRupee, Navigation } from 'lucide-react'
import NegotiationPanel from './NegotiationPanel'

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

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${statusColor}30`,
        borderRadius: '16px',
        overflow: 'hidden',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {/* Pickup → Destination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <MapPin size={14} color="#22c55e" />
            <span style={{ fontWeight: '600' }}>{ride.pickup_location_name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <Navigation size={14} color="#ef4444" />
            <span style={{ fontWeight: '600' }}>{ride.destination_name}</span>
          </div>
        </div>
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
          <Clock size={13} />
          {new Date(ride.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <IndianRupee size={13} />
          Range: ₹{ride.min_price} – ₹{ride.max_price}
        </div>
      </div>

      {/* Negotiation Panel */}
      <div style={{ padding: '1.25rem' }}>
        <NegotiationPanel ride={ride} offer={ride.offer} onRideUpdate={onUpdate} isDriverView={true} />
      </div>
    </div>
  )
}
