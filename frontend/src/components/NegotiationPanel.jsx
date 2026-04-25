import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowUp, ArrowDown, Check, X, Clock, IndianRupee, RefreshCw, Star, Trophy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { notifyDriverAssigned } from '../utils/notificationService'

const MAX_ROUNDS = 3

const STATUS_CONFIG = {
  pending_student: { color: '#a78bfa', label: 'Reviewing Offer', icon: IndianRupee },
  pending_driver: { color: '#6366f1', label: 'Offer Received', icon: Clock },
  accepted: { color: '#22c55e', label: 'Offer Accepted', icon: Check },
  rejected_by_student: { color: '#ef4444', label: 'Rejected', icon: X },
  rejected_by_driver: { color: '#ef4444', label: 'Rejected', icon: X },
  rejected_system: { color: '#ef4444', label: 'Offer Expired', icon: X },
}

function PriceBar({ current, min, max }) {
  const pct = Math.min(100, Math.max(0, ((current - min) / Math.max(1, max - min)) * 100))
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
        <span>Min ₹{min}</span>
        <span>Max ₹{max}</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #22c55e, #6366f1)',
          borderRadius: '999px',
          transition: 'width 0.4s ease'
        }} />
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '12px', height: '12px',
          background: 'var(--primary)',
          borderRadius: '50%',
          border: '2px solid white'
        }} />
      </div>
    </div>
  )
}

export default function NegotiationPanel({ ride, offer, isBestOffer = false, onRideUpdate, isDriverView = false }) {
  const { user } = useAuth()
  const [counterPrice, setCounterPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isStudent = !isDriverView && user?.id === ride.creator_id
  const isDriver = isDriverView

  const currentPrice = offer ? offer.current_price : (ride.current_price || ride.initial_price)
  const minPrice = ride.min_price || 0
  const maxPrice = ride.max_price || 0
  const round = offer ? offer.negotiation_round : (ride.negotiation_round || 0)
  
  // Base status if no offer exists
  let status = 'pending_driver'
  if (offer) status = offer.status
  if (ride.status === 'published' && offer && offer.status !== 'accepted') status = 'rejected_system'

  let statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG['pending_driver']
  let StatusIcon = statusConfig.icon

  // Dynamic name injection
  const studentName = ride?.users?.name || 'Student'
  const driverName = offer?.users?.name || (isDriver ? user?.name : 'Driver')
  const driverRating = offer?.users?.rating

  const processAcceptance = async (acceptedOfferId, finalDriverId, finalPrice) => {
    // Delegate entirely to the atomic RPC which:
    //   • Locks the ride row (prevents race conditions)
    //   • Checks for time-overlap with driver's existing rides (+ 10-min buffer)
    //   • Accepts the ride and rejects all other offers — all in one transaction
    const { error: rpcError } = await supabase.rpc('accept_ride_offer', {
      p_ride_id:           ride.id,
      p_driver_id:         finalDriverId,
      p_accepted_offer_id: acceptedOfferId ?? null,
      p_final_price:       finalPrice
    })

    if (rpcError) {
      // The DB raises: RAISE EXCEPTION 'machine_code' USING DETAIL = 'human text'
      // rpcError.message = machine code, rpcError.details = friendly message
      const code = rpcError.message?.trim()

      if (code === 'ride_overlap') {
        throw new Error(
          rpcError.details || 'You already have a ride scheduled during this time.'
        )
      }
      if (code === 'ride_already_assigned') {
        throw new Error(
          rpcError.details || 'This ride was just taken by another driver. Please refresh.'
        )
      }
      // Generic fallback — prefer details over raw message if available
      throw new Error(rpcError.details || rpcError.message || 'Failed to accept ride. Please try again.')
    }
  }

  const upsertOffer = async (updates) => {
    setLoading(true)
    setError(null)
    try {
      if (!offer) {
        // Driver's first bid!
        const { error: insErr } = await supabase.from('ride_offers').insert([{
          ride_id: ride.id,
          driver_id: user.id,
          current_price: updates.current_price,
          negotiation_round: updates.negotiation_round,
          status: updates.status
        }])
        if (insErr) throw insErr
      } else {
        const { error: updErr } = await supabase.from('ride_offers')
          .update({
            current_price: updates.current_price,
            negotiation_round: updates.negotiation_round,
            status: updates.status
          })
          .eq('id', offer.id)
        if (updErr) throw updErr
      }

      // Add a chat log globally
      if (updates.message) {
        await supabase.from('chat_messages').insert([{
          ride_id: ride.id,
          sender_id: user?.id,
          content: updates.message,
          message_type: 'price_offer',
          proposed_price: updates.current_price
        }])
      }

      if (onRideUpdate) onRideUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const checkDriverAvailability = async (driverId) => {
    // Ensure driver is truly available
    const { data } = await supabase.from('drivers').select('status').eq('id', driverId).single()
    if (data?.status !== 'available') {
      setError("This driver is no longer available.")
      return false
    }
    return true
  }

  // ── STUDENT ACTIONS ──────────────────────────────────
  const studentAccept = async () => {
    setLoading(true)
    setError(null)
    const isAvail = await checkDriverAvailability(offer.driver_id)
    if (!isAvail) { setLoading(false); return }

    try {
      await processAcceptance(offer.id, offer.driver_id, currentPrice)
      await supabase.from('chat_messages').insert([{
        ride_id: ride.id, sender_id: user?.id,
        content: `✅ ${studentName} accepted ${driverName}'s offer of ₹${currentPrice}.`,
        message_type: 'system'
      }])
      // System message: driver joins the unified chat room
      await supabase.from('chat_messages').insert([{
        ride_id: ride.id, sender_id: user?.id,
        content: `🚗 ${driverName} has joined the chat. Coordinate directly here!`,
        message_type: 'system'
      }])
      // Notify ride creator + all approved passengers that a driver was assigned
      const { data: approvedReqs } = await supabase
        .from('ride_requests').select('user_id').eq('ride_id', ride.id).eq('status', 'approved')
      const recipientIds = [ride.creator_id, ...(approvedReqs || []).map(r => r.user_id)]
      await notifyDriverAssigned({ userIds: recipientIds, driverName, rideId: ride.id })
      if (onRideUpdate) onRideUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const studentReject = () => upsertOffer({
    current_price: currentPrice,
    negotiation_round: round,
    status: 'rejected_by_student',
    message: `❌ ${studentName} rejected ${driverName}'s offer.`
  })

  const studentCounter = () => {
    const price = parseFloat(counterPrice)
    if (isNaN(price) || price < minPrice || price >= currentPrice) {
      setError(`Counter must be between ₹${minPrice} and ₹${currentPrice - 1}`)
      return
    }
    upsertOffer({
      status: 'pending_driver',
      current_price: price,
      negotiation_round: round + 1,
      message: `💬 ${studentName} countered ${driverName} with ₹${price}`
    })
    setCounterPrice('')
  }

  // ── DRIVER ACTIONS ────────────────────────────────────
  const driverAccept = async () => {
    setLoading(true)
    setError(null)
    const isAvail = await checkDriverAvailability(user?.id)
    if (!isAvail) { setLoading(false); return }

    try {
      await processAcceptance(offer?.id, user?.id, currentPrice)
      await supabase.from('chat_messages').insert([{
        ride_id: ride.id, sender_id: user?.id,
        content: `✅ ${driverName} accepted ${studentName}'s offer of ₹${currentPrice}.`,
        message_type: 'system'
      }])
      // System message: driver joins the unified chat room
      await supabase.from('chat_messages').insert([{
        ride_id: ride.id, sender_id: user?.id,
        content: `🚗 ${driverName} has joined the chat. Coordinate directly here!`,
        message_type: 'system'
      }])
      // Notify ride creator + all approved passengers that a driver was assigned
      const { data: approvedReqs } = await supabase
        .from('ride_requests').select('user_id').eq('ride_id', ride.id).eq('status', 'approved')
      const recipientIds = [ride.creator_id, ...(approvedReqs || []).map(r => r.user_id)]
      await notifyDriverAssigned({ userIds: recipientIds, driverName: user?.name || driverName, rideId: ride.id })
      if (onRideUpdate) onRideUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const driverReject = () => {
    if (!offer) {
       // Just dismiss it locally
       const dismissed = JSON.parse(localStorage.getItem('dismissed_rides') || '[]')
       dismissed.push(ride.id)
       localStorage.setItem('dismissed_rides', JSON.stringify(dismissed))
       window.location.href = '/driver-dashboard'
    } else {
       upsertOffer({
         current_price: currentPrice,
         negotiation_round: round,
         status: 'rejected_by_driver',
         message: `❌ ${driverName} retracted their engagement.`
       })
    }
  }

  const driverProposeOrCounter = () => {
    const price = parseFloat(counterPrice)
    if (isNaN(price) || price <= currentPrice || price > maxPrice) {
      setError(`Counter must be between ₹${currentPrice + 1} and ₹${maxPrice}`)
      return
    }
    upsertOffer({
      status: 'pending_student',
      current_price: price,
      negotiation_round: round + 1,
      message: `💰 ${driverName} proposed ₹${price}`
    })
    setCounterPrice('')
  }

  const isMaxRounds = round >= MAX_ROUNDS
  const isDone = ride.status === 'published' || status.startsWith('rejected') || status === 'accepted'

  return (
    <div className="glass-card" style={{ 
      border: `1px solid ${statusConfig.color}40`, 
      position: 'relative',
      boxShadow: isBestOffer ? `0 0 15px ${statusConfig.color}30` : 'none'
    }}>
      
      {isBestOffer && !isDone && (
        <div style={{ position: 'absolute', top: '-12px', right: '15px', background: 'var(--primary)', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
          <Trophy size={12} /> BEST OFFER
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: `${statusConfig.color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <StatusIcon size={20} color={statusConfig.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: '700', color: statusConfig.color }}>
              {isStudent ? driverName : `${studentName} — ${statusConfig.label}`}
            </div>
            {isStudent && offer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#f59e0b', fontSize: '0.8rem', fontWeight: '600', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '6px' }}>
                <Star size={12} fill="currentColor" /> {driverRating || 'New'}
              </div>
            )}
          </div>
          {isStudent && offer?.drivers && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', flexDirection: 'column' }}>
              <span>{offer.drivers.vehicle_number} ({offer.drivers.vehicle_type})</span>
              <span>📞 {offer.drivers.mobile_number}</span>
            </div>
          )}
          {!isDone && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Round {round}/{MAX_ROUNDS}
            </div>
          )}
        </div>
      </div>

      {/* Price Display */}
      {offer && (
        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{isStudent ? 'Proposed Fare' : 'Current Negotiated Price'}</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text)' }}>₹{currentPrice}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div>Range</div>
              <div style={{ fontWeight: '600', color: 'var(--text)' }}>₹{minPrice} – ₹{maxPrice}</div>
            </div>
          </div>
          <PriceBar current={currentPrice} min={minPrice} max={maxPrice} />
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* ── STUDENT VIEW ── */}
      {isStudent && !isDone && offer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          {status === 'pending_student' && (
            <>
              <div style={{ padding: '0.75rem', background: 'rgba(167,139,250,0.1)', borderRadius: '8px', color: '#a78bfa', fontSize: '0.9rem', textAlign: 'center' }}>
                🚖 {driverName} proposes <strong>₹{currentPrice}</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn" style={{ flex: 1, background: '#22c55e' }} onClick={studentAccept} disabled={loading}>
                  <Check size={16} style={{ marginRight: '4px' }} /> Accept ₹{currentPrice}
                </button>
                <button className="btn" style={{ flex: 1, background: '#ef4444' }} onClick={studentReject} disabled={loading}>
                  <X size={16} style={{ marginRight: '4px' }} /> Reject
                </button>
              </div>

              {!isMaxRounds && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                    <input
                      type="number"
                      className="input-field"
                      value={counterPrice}
                      onChange={e => { setCounterPrice(e.target.value); setError(null) }}
                      placeholder={`Between ${minPrice} – ${currentPrice}`}
                      min={minPrice}
                      max={currentPrice - 1}
                      step="1"
                      style={{ paddingLeft: '28px' }}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={studentCounter} disabled={loading || !counterPrice}>
                    <ArrowDown size={14} style={{ marginRight: '4px' }} /> Counter
                  </button>
                </div>
              )}
            </>
          )}

          {status === 'pending_driver' && (
            <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '8px', color: '#6366f1', fontSize: '0.9rem', textAlign: 'center' }}>
              ⏳ Sent counter offer of ₹{currentPrice}. Waiting for {driverName} to respond...
            </div>
          )}

        </div>
      )}

      {/* ── DRIVER VIEW ── */}
      {isDriver && !isDone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
           
          {(!offer || status === 'pending_driver') && (
            <>
              <div style={{ padding: '0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', color: '#f59e0b', fontSize: '0.9rem', textAlign: 'center' }}>
                {offer ? `🔔 ${studentName} countered with ₹${currentPrice}` : `🔔 New ride request from ${studentName}! Base fare: ₹${currentPrice}`}
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn" style={{ flex: 1, background: '#22c55e' }} onClick={driverAccept} disabled={loading}>
                  <Check size={16} style={{ marginRight: '4px' }} /> Accept ₹{currentPrice}
                </button>
                <button className="btn" style={{ flex: 1, background: '#ef4444' }} onClick={driverReject} disabled={loading}>
                  <X size={16} style={{ marginRight: '4px' }} /> {offer ? 'Reject' : 'Decline'}
                </button>
              </div>

              {!isMaxRounds && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                    <input
                      type="number"
                      className="input-field"
                      value={counterPrice}
                      onChange={e => { setCounterPrice(e.target.value); setError(null) }}
                      placeholder={`${currentPrice + 1} – ${maxPrice}`}
                      min={currentPrice + 1}
                      max={maxPrice}
                      step="1"
                      style={{ paddingLeft: '28px' }}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={driverProposeOrCounter} disabled={loading || !counterPrice}>
                    <ArrowUp size={14} style={{ marginRight: '4px' }} /> Propose
                  </button>
                </div>
              )}
            </>
          )}

          {status === 'pending_student' && (
            <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '8px', color: '#6366f1', fontSize: '0.9rem', textAlign: 'center' }}>
              ⏳ Your proposal of ₹{currentPrice} has been sent. Waiting for {studentName}...
            </div>
          )}
        </div>
      )}

      {/* Completed/Expiring state */}
      {(isDone || isMaxRounds) && (
        <div style={{
          padding: '1rem',
          background: (status.startsWith('rejected') || (isMaxRounds && !isDone)) ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          borderRadius: '8px',
          textAlign: 'center',
          color: (status.startsWith('rejected') || (isMaxRounds && !isDone)) ? '#ef4444' : '#22c55e',
          fontWeight: '600'
        }}>
          {status === 'rejected_system' && '❌ Offer Expired (Ride assigned to someone else)'}
          {status === 'rejected_by_driver' && `❌ ${driverName} retreated from negotiation.`}
          {status === 'rejected_by_student' && `❌ ${studentName} rejected this offer.`}
          {status === 'accepted' && `✅ Offer accepted natively! Final price: ₹${offer?.current_price || currentPrice}`}
          {(isMaxRounds && !isDone) && '❌ Max negotiation rounds reached.'}
        </div>
      )}
    </div>
  )
}
