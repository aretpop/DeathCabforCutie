import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Check, X, IndianRupee, Navigation } from 'lucide-react'
import RideChat from '../components/RideChat'
import ProfileCard from '../components/ProfileCard'
import CancelRideButton from '../components/CancelRideButton'
import LeaveRideButton from '../components/LeaveRideButton'
import RideReviewPanel from '../components/RideReviewPanel'
import NegotiationPanel from '../components/NegotiationPanel'
import PaymentPanel from '../components/PaymentPanel'
import { getRoute, openNavigation } from '../utils/geoUtils'
import { notifyJoinRequest, notifyJoinAccepted, notifyJoinRejected } from '../utils/notificationService'
import { PRIORITY_CONFIG } from '../utils/priorityEngine'
import { formatRideDateTime } from '../utils/dateUtils'

// Fix default leaf icon issues
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const FitBounds = ({ bounds }) => {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [50, 50] })
  }, [bounds, map])
  return null
}

export default function RideDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [ride, setRide] = useState(null)
  const [requests, setRequests] = useState([])
  const [myRequest, setMyRequest] = useState(null)
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [routeGeometry, setRouteGeometry] = useState(null)

  // Review state
  const [showReview, setShowReview] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  useEffect(() => {
    fetchRideData()
  }, [id])

  // Auto-expire unanswered pending rides if the departure time has passed naturally.
  useEffect(() => {
    if (ride && ride.status === 'pending_driver') {
      if (new Date(ride.departure_time) < new Date()) {
        supabase.from('rides')
          .update({ status: 'cancelled' })
          .eq('id', ride.id)
          .then(() => fetchRideData())
      }
    }
    
    // Fetch route geometry for the map
    if (ride) {
      getRoute({ lat: ride.pickup_lat, lng: ride.pickup_lng }, { lat: ride.destination_lat, lng: ride.destination_lng })
        .then(data => {
          if (data.geometry) setRouteGeometry(data.geometry)
        })
        .catch(err => console.error("Could not fetch route for details map", err))
    }
  }, [ride])

  useEffect(() => {
    // Realtime subscriptions
    const rideSub = supabase.channel(`public:rides:id=eq.${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${id}` }, () => {
        fetchRideData()
      }).subscribe()

    const reqSub = supabase.channel(`public:ride_requests:ride_id=eq.${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `ride_id=eq.${id}` }, () => {
        fetchRequests()
      }).subscribe()

    const offersSub = supabase.channel(`public:ride_offers:ride_id=eq.${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_offers', filter: `ride_id=eq.${id}` }, () => {
        fetchOffers()
      }).subscribe()

    return () => {
      rideSub.unsubscribe()
      reqSub.unsubscribe()
      offersSub.unsubscribe()
    }
  }, [id, user])

  const fetchRideData = async () => {
    try {
      const { data: rideData, error: rErr } = await supabase
        .from('rides')
        .select(`
          *,
          users!creator_id(name, email, avatar_url, rating, show_identity),
          registered_vehicles:driver_id(id, name, mobile_number, vehicle_number, vehicle_type, upi_id),
          drivers:assigned_driver_id(id, name, mobile_number, vehicle_number, vehicle_type, upi_id)
        `)
        .eq('id', id).single()
      if (rErr) throw rErr
      setRide(rideData)

      await Promise.all([fetchRequests(), checkExistingReview(), fetchOffers()])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const checkExistingReview = async () => {
    if (!user) return
    const { data } = await supabase
      .from('ride_reviews')
      .select('id')
      .eq('ride_id', id)
      .eq('reviewer_id', user.id)
      .limit(1)
    if (data && data.length > 0) {
      setHasReviewed(true)
    }
  }

  const fetchRequests = async () => {
    const { data: reqData } = await supabase
      .from('ride_requests')
      .select(`*, users!user_id(name, email, avatar_url, rating, show_identity)`)
      .eq('ride_id', id)
    
    setRequests(reqData || [])
    const mine = reqData?.find(r => r.user_id === user?.id)
    setMyRequest(mine || null)
  }

  const fetchOffers = async () => {
    const { data } = await supabase
      .from('ride_offers')
      .select(`*, users!fk_ride_offers_driver_user(name, rating, avatar_url), drivers!ride_offers_driver_id_fkey(vehicle_number, vehicle_type, mobile_number)`)
      .eq('ride_id', id)
      .not('status', 'in', '("rejected_by_student", "rejected_system")')
    
    const sorted = (data || []).sort((a, b) => {
      if (a.current_price !== b.current_price) return a.current_price - b.current_price
      const aRating = a.users?.rating || 0
      const bRating = b.users?.rating || 0
      return bRating - aRating
    })
    setOffers(sorted)
  }

  const handleJoinRequest = async () => {
    if (!user) return navigate('/login')
    if (!user.profile_completed) return alert("Please complete your profile first.")

    const { data: inserted } = await supabase.from('ride_requests').insert([
      { ride_id: id, user_id: user.id, status: 'pending' }
    ]).select().single()

    // Notify the ride owner
    if (inserted) {
      await notifyJoinRequest({
        ownerId:       ride.creator_id,
        requesterName: user.name || 'Someone',
        rideId:        id,
        senderId:      user.id,
      })
    }
    fetchRequests()
  }

  const handleApprove = async (reqId) => {
    await supabase.from('ride_requests').update({ status: 'approved' }).eq('id', reqId)
    // Notify the passenger
    const req = requests.find(r => r.id === reqId)
    if (req) {
      await notifyJoinAccepted({ passengerId: req.user_id, rideId: id, senderId: user.id })
    }
    fetchRequests()
  }

  const handleReject = async (reqId) => {
    await supabase.from('ride_requests').update({ status: 'rejected' }).eq('id', reqId)
    // Notify the passenger
    const req = requests.find(r => r.id === reqId)
    if (req) {
      await notifyJoinRejected({ passengerId: req.user_id, rideId: id, senderId: user.id })
    }
    fetchRequests()
  }

  const handleCompleteRide = async () => {
    // Check if there are any approved passengers
    const approvedCount = requests.filter(r => r.status === 'approved').length

    // Free the registered vehicle driver so it can be re-assigned
    if (ride.driver_id) {
      await supabase.from('registered_vehicles').update({ status: 'Available' }).eq('id', ride.driver_id)
    }
    
    if (approvedCount === 0) {
      // If no passengers, jump straight to completed
      await supabase.from('rides').update({ status: 'completed' }).eq('id', id)
      setRide({...ride, status: 'completed'})
    } else {
      // If passengers exist, move to awaiting_reviews
      await supabase.from('rides').update({ status: 'awaiting_reviews' }).eq('id', id)
      setRide({...ride, status: 'awaiting_reviews'})
      setShowReview(true)
    }
  }

  if (loading) return <div>Loading...</div>
  if (!ride) return <div>Ride not found</div>

  const isCreator = user?.id === ride.creator_id
  const isApproved = myRequest?.status === 'approved'
  // Driver who accepted the ride via the negotiation flow
  const isAssignedDriver = !!(user?.id && ride.assigned_driver_id && user.id === ride.assigned_driver_id)

  // Status flags
  const NEGOTIATION_STATUSES = ['pending_driver', 'negotiating', 'price_proposed']
  const isNegotiating = NEGOTIATION_STATUSES.includes(ride.status)
  const isPublished = ride.status === 'published'
  const isActive = ride.status === 'active'
  const isCompleted = ride.status === 'completed'
  const isAwaiting = ride.status === 'awaiting_reviews'
  const isCancelled = ride.status === 'cancelled'
  const isRejected = ride.status === 'rejected'
  // Can show passenger interaction only when ride is active/published/completed
  const isLiveRide = isPublished || isActive
  // Creator, approved riders, AND the assigned driver can all chat
  const canChat = (isCreator || isApproved || isAssignedDriver) && !isCancelled && !isNegotiating

  // ── Privacy logic ──────────────────────────────────────────────────────────
  // Publisher's identity is visible when:
  //   a) the viewer IS the creator (their own ride)
  //   b) the viewer has an approved / completed request (trusted participant)
  //   c) the publisher themselves has show_identity = true (default)
  const publisherWantsAnon = ride.users?.show_identity === false
  const viewerIsTrusted    = isCreator || isApproved || isCompleted || isAwaiting
  const anonymizePublisher  = publisherWantsAnon && !viewerIsTrusted
  // ──────────────────────────────────────────────────────────────────────────

  const pickupPos = [ride.pickup_lat, ride.pickup_lng]
  const destPos = [ride.destination_lat, ride.destination_lng]
  const bounds = L.latLngBounds([pickupPos, destPos])
  
  // Straight line distance Haversine
  const dist = L.latLng(pickupPos).distanceTo(L.latLng(destPos)) / 1000 // km

  return (
    <div className="responsive-grid" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Left Column: Map & Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ height: '350px', width: '100%', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
            <MapContainer bounds={bounds} style={{ height: '100%', width: '100%', zIndex: 1 }}>
              <TileLayer 
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CartoDB'
              />
              <Marker position={pickupPos} icon={pickupIcon} />
              <Marker position={destPos} icon={destIcon} />
              
              {routeGeometry ? (
                <GeoJSON 
                  key={pickupPos.join(',') + destPos.join(',')} 
                  data={routeGeometry} 
                  style={{ color: "var(--primary, #3b82f6)", weight: 4, opacity: 0.8, lineJoin: 'round' }} 
                />
              ) : (
                <Polyline positions={[pickupPos, destPos]} color="var(--primary)" weight={4} dashArray="10, 10" />
              )}
              
              <FitBounds bounds={bounds} />
            </MapContainer>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Ride Details</h2>
              <ProfileCard
                user={{
                  id: ride.creator_id,
                  name: ride.users?.name,
                  avatar_url: ride.users?.avatar_url,
                  rating: ride.users?.rating
                }}
                anonymize={anonymizePublisher}
              />
            </div>

            {isCancelled && (
              <div style={{ display: 'inline-block', background: '#ef4444', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                RIDE CANCELLED
              </div>
            )}
            {isRejected && (
              <div style={{ display: 'inline-block', background: '#ef4444', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                NEGOTIATION REJECTED
              </div>
            )}
            {isNegotiating && (
              <div style={{ display: 'inline-block', background: '#f59e0b', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                ⏳ AWAITING DRIVER
              </div>
            )}
            {ride.vehicle_type && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '700',
                marginBottom: '1rem', marginLeft: '0.5rem',
                background: ride.vehicle_type === 'cab' ? 'rgba(99,102,241,0.15)' : 'rgba(234,179,8,0.15)',
                color: ride.vehicle_type === 'cab' ? '#818cf8' : '#ca8a04',
                border: `1px solid ${ride.vehicle_type === 'cab' ? 'rgba(99,102,241,0.3)' : 'rgba(234,179,8,0.3)'}`,
              }}>
                {ride.vehicle_type === 'cab' ? '🚕 Cab' : '🛺 Auto Rickshaw'}
              </div>
            )}
            {/* Priority badge */}
            {ride.priority_type && ride.priority_type !== 'NORMAL' && (() => {
              const pc = PRIORITY_CONFIG[ride.priority_type]
              if (!pc) return null
              return (
                <>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '700',
                    marginBottom: '1rem', marginLeft: '0.5rem',
                    background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`,
                  }}>
                    {pc.emoji} {pc.label}
                  </div>
                  {ride.priority_notes && (
                    <div style={{
                      marginBottom: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: pc.bg,
                      border: `1px solid ${pc.border}`,
                      color: pc.color,
                      fontSize: '0.82rem',
                      fontWeight: '600',
                    }}>
                      {pc.emoji} {ride.priority_notes}
                    </div>
                  )}
                </>
              )
            })()}

            <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div><strong>Pickup:</strong> {ride.pickup_location_name}</div>
                <button
                  onClick={() => openNavigation(ride.pickup_lat, ride.pickup_lng)}
                  disabled={!ride.pickup_lat || !ride.pickup_lng}
                  title="Navigate to pickup location"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: 'var(--primary, #3b82f6)', color: 'white',
                    border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem', cursor: 'pointer',
                    opacity: (!ride.pickup_lat || !ride.pickup_lng) ? 0.5 : 1,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => { if (ride.pickup_lat) e.currentTarget.style.opacity = 0.9; }}
                  onMouseLeave={(e) => { if (ride.pickup_lat) e.currentTarget.style.opacity = 1; }}
                >
                  <Navigation size={14} /> Navigate
                </button>
              </div>
              <div><strong>Destination:</strong> {ride.destination_name}</div>
              <div><strong>Approx Distance:</strong> {dist.toFixed(2)} km</div>
              <div><strong>Departure:</strong> {formatRideDateTime(ride.departure_time)}</div>
              <div><strong>Seats:</strong> {ride.available_seats} / {ride.max_occupancy}</div>
              {ride.total_price > 0 && (() => {
                // Occupants = approved passengers + creator (1)
                const joined = ride.max_occupancy - ride.available_seats
                const occupants = joined + 1 // +1 for the publisher
                const perPerson = (ride.total_price / Math.max(1, occupants)).toFixed(2)
                const isLocked = isCompleted || isAwaiting || isCancelled
                return (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                      <IndianRupee size={15} /> Fare Split
                      {isLocked && <span style={{ fontSize: '0.7rem', background: 'rgba(115,115,115,0.2)', color: 'var(--text-muted)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: 'auto' }}>LOCKED</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.4rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>₹{ride.total_price}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.4rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Riders</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{occupants}</div>
                      </div>
                      <div style={{ background: 'rgba(99,102,241,0.25)', borderRadius: '6px', padding: '0.4rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Per Person</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>₹{perPerson}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
              {ride.external_driver && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text)', marginBottom: '0.25rem' }}>
                    <strong>Assigned Driver:</strong> 
                    <span style={{ padding: '0.1rem 0.4rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.75rem', borderRadius: '4px', marginLeft: '6px', verticalAlign: 'middle', fontWeight: 'bold' }}>EXTERNAL</span>
                  </div>
                  <div><strong>Name:</strong> {ride.external_driver.name}</div>
                  <div><strong>Vehicle:</strong> {ride.external_driver.vehicle_number} ({ride.external_driver.vehicle_type})</div>
                  <div><strong>Contact:</strong> 📞 {ride.external_driver.mobile_number}</div>
                </div>
              )}
              {ride.registered_vehicles && !ride.external_driver && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text)', marginBottom: '0.25rem' }}><strong>Assigned Driver:</strong> {ride.registered_vehicles.name}</div>
                  <div><strong>Vehicle:</strong> {ride.registered_vehicles.vehicle_number} ({ride.registered_vehicles.vehicle_type})</div>
                  <div><strong>Contact:</strong> 📞 {ride.registered_vehicles.mobile_number}</div>
                </div>
              )}
              {ride.drivers && !ride.external_driver && !ride.registered_vehicles && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text)', marginBottom: '0.25rem' }}><strong>Assigned Driver:</strong> {ride.drivers.name}</div>
                  <div><strong>Vehicle:</strong> {ride.drivers.vehicle_number} ({ride.drivers.vehicle_type})</div>
                  <div><strong>Contact:</strong> 📞 {ride.drivers.mobile_number}</div>
                </div>
              )}
              {!isCancelled && (
                 <div style={{ marginTop: '0.5rem' }}><strong>Status:</strong> <span style={{ textTransform: 'uppercase', color: (isCompleted || (isAwaiting && hasReviewed)) ? '#22c55e' : 'var(--primary)', fontWeight: 'bold' }}>
                   {(isAwaiting && hasReviewed) ? 'completed' : ride.status.replace('_', ' ')}
                 </span></div>
              )}
            </div>

            {!isCreator && !isCompleted && !isCancelled && !isAwaiting && !isNegotiating && isLiveRide && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                {!myRequest ? (
                  <button className="btn" onClick={handleJoinRequest} disabled={ride.available_seats === 0 || !user?.profile_completed}>
                    {ride.available_seats === 0 ? 'Full' : 'Request to Join'}
                  </button>
                ) : (
                  <div className="btn" style={{ 
                    background: myRequest.status === 'approved' ? '#22c55e' : myRequest.status === 'rejected' ? '#ef4444' : 'var(--bg-card)', 
                    border: '1px solid var(--border)',
                    color: myRequest.status === 'pending' ? 'var(--text-main)' : 'white'
                  }}>
                    Status: <strong style={{ marginLeft: '4px', textTransform: 'capitalize' }}>{myRequest.status}</strong>
                  </div>
                )}
                
                {isApproved && (
                  <LeaveRideButton 
                    rideId={id} 
                    requestId={myRequest.id} 
                    publisherId={ride.creator_id} 
                    passengerId={user.id} 
                    onLeft={() => { setMyRequest({...myRequest, status: 'cancelled'}); fetchRideData() }} 
                  />
                )}
              </div>
            )}

            {isCreator && !isCompleted && !isCancelled && !isAwaiting && (isLiveRide || ride.status === 'pending_driver') && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                {isLiveRide && (
                  <button className="btn" style={{ background: '#22c55e', flex: 1 }} onClick={handleCompleteRide}>
                    Mark Completed
                  </button>
                )}
                <CancelRideButton 
                  rideId={id} 
                  currentUserId={user.id} 
                  driverId={ride.driver_id}
                  onCancelled={() => { setRide({...ride, status: 'cancelled'}) }} 
                />
              </div>
            )}
            
            {( (isAwaiting || isCompleted) && !showReview && (isCreator || isApproved)) && (
               <button className="btn" onClick={() => setShowReview(true)} style={{ marginTop: '1rem', width: '100%', background: 'var(--primary)' }}>
                 ⭐ Leave a Review
               </button>
            )}
            
            {(hasReviewed && (isAwaiting || isCompleted) && !showReview) && (
               <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: '8px', textAlign: 'center' }}>
                 You've submitted some or all reviews for this ride.
               </div>
            )}

            {showReview && (isAwaiting || isCompleted) && (
              <RideReviewPanel 
                ride={ride} 
                currentUser={user} 
                requests={requests} 
                onReviewSubmitted={() => { setShowReview(false); setHasReviewed(true) }} 
              />
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Interaction */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* Negotiation Panels */}
        {isNegotiating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>{isCreator ? 'Driver Offers' : 'Your Offer'}</h3>
            
            {isCreator && offers.length === 0 && (
              <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Waiting for drivers to submit offers...
              </div>
            )}
            
            {isCreator && offers.map((offer, index) => (
              <NegotiationPanel
                key={offer.id}
                ride={ride}
                offer={offer}
                isBestOffer={index === 0 && offer.status !== 'rejected_by_driver'}
                onRideUpdate={() => { fetchRideData() }}
                isDriverView={false}
              />
            ))}

            {!isCreator && user?.role === 'driver' && (
              <NegotiationPanel
                ride={ride}
                offer={offers.find(o => o.driver_id === user.id) || null}
                onRideUpdate={() => { fetchRideData() }}
                isDriverView={true}
              />
            )}
          </div>
        )}

        {/* Creator Control Panel — shown only for live rides */}
        {isCreator && !isCancelled && isLiveRide && (
          <div className="glass-card">
            <h3 style={{ marginBottom: '1rem' }}>Passenger Requests</h3>
            {requests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No requests yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {requests.map(req => (
                  <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <ProfileCard 
                      user={{
                        id: req.user_id,
                        name: req.users?.name,
                        avatar_url: req.users?.avatar_url,
                        rating: req.users?.rating
                      }}
                      anonymize={false}
                    />
                    {req.status === 'pending' ? (
                       <div style={{ display: 'flex', gap: '0.5rem' }}>
                         <button onClick={() => handleApprove(req.id)} style={{ padding: '0.25rem', background: '#22c55e', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white' }} disabled={ride.available_seats === 0}><Check size={16} /></button>
                         <button onClick={() => handleReject(req.id)} style={{ padding: '0.25rem', background: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white' }}><X size={16} /></button>
                       </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: req.status === 'approved' ? '#22c55e' : req.status === 'cancelled' ? '#ef4444' : '#ef4444', textTransform: 'capitalize' }}>
                        {req.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Approved Participants ─────────────────────────────────────────────
            Visible to every confirmed member of the ride (creator + approved
            passengers). Real names and avatars are always shown here — this is
            the trust layer once someone has been accepted into the ride.
        ─────────────────────────────────────────────────────────────────────── */}
        {(isCreator || isApproved) && !isCancelled && (isLiveRide || isCompleted || isAwaiting) && (() => {
          const approved = requests.filter(r => r.status === 'approved')
          if (approved.length === 0) return null
          return (
            <div className="glass-card">
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>✅</span> Ride Participants
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: 'auto' }}>
                  {approved.length + 1} people
                </span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Publisher row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <ProfileCard
                    user={{
                      id: ride.creator_id,
                      name: ride.users?.name,
                      avatar_url: ride.users?.avatar_url,
                      rating: ride.users?.rating
                    }}
                    anonymize={false}
                    subtitle="Publisher"
                  />
                </div>
                {/* Approved passengers */}
                {approved.map(req => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                    <ProfileCard
                      user={{
                        id: req.user_id,
                        name: req.users?.name,
                        avatar_url: req.users?.avatar_url,
                        rating: req.users?.rating
                      }}
                      anonymize={false}
                      subtitle="Passenger"
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── UPI Payment Panel ──────────────────────────────────────────────────
            Show once a driver is assigned & ride is in a payable state.
            Visible to the publisher AND approved passengers.
        ─────────────────────────────────────────────────────────────────────── */}
        {(isCreator || isApproved) && (isActive || isAwaiting || isCompleted) && (() => {
          // Resolve driver from whichever source is available (assigned > legacy > external)
          const driverRaw = ride.drivers || ride.registered_vehicles || null
          const externalRaw = ride.external_driver || null
          const source = driverRaw || externalRaw
          if (!source) return null

          const driverForPayment = {
            name:   source.name || 'Driver',
            phone:  source.mobile_number || null,
            upi_id: source.upi_id || null,
          }
          // Must have at least a UPI ID or a phone to generate payment link
          if (!driverForPayment.upi_id && !driverForPayment.phone) return null

          // Confirmed riders = approved requests + 1 (the publisher)
          const approvedCount  = requests.filter(r => r.status === 'approved').length
          const confirmedTotal = approvedCount + 1

          return (
            <PaymentPanel
              driver={driverForPayment}
              totalFare={ride.total_price || 0}
              riderCount={confirmedTotal}
            />
          )
        })()}

        {/* Chat Interface */}
        <RideChat 
          rideId={id} 
          currentUserId={user?.id}
          driverUserId={ride.assigned_driver_id || null}
          canChat={canChat} 
          isCompleted={isCompleted || isCancelled} 
        />

      </div>
    </div>
  )
}
