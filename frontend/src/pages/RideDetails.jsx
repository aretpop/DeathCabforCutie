import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Check, X } from 'lucide-react'
import RideChat from '../components/RideChat'
import ProfileCard from '../components/ProfileCard'
import CancelRideButton from '../components/CancelRideButton'
import LeaveRideButton from '../components/LeaveRideButton'
import RideReviewPanel from '../components/RideReviewPanel'

// Fix default leaf icon issues
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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
  const [loading, setLoading] = useState(true)

  // Review state
  const [showReview, setShowReview] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  useEffect(() => {
    fetchRideData()

    // Realtime subscriptions
    const rideSub = supabase.channel(`public:rides:id=eq.${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${id}` }, (payload) => {
        setRide(payload.new)
      }).subscribe()

    const reqSub = supabase.channel(`public:ride_requests:ride_id=eq.${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `ride_id=eq.${id}` }, () => {
        fetchRequests()
      }).subscribe()

    return () => {
      rideSub.unsubscribe()
      reqSub.unsubscribe()
    }
  }, [id, user])

  const fetchRideData = async () => {
    try {
      const { data: rideData, error: rErr } = await supabase
        .from('rides')
        .select(`*, users!creator_id(name, email, avatar_url, rating), drivers(*)`)
        .eq('id', id).single()
      if (rErr) throw rErr
      setRide(rideData)

      await Promise.all([fetchRequests(), checkExistingReview()])
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
      .select(`*, users!user_id(name, email, avatar_url, rating)`)
      .eq('ride_id', id)
    
    setRequests(reqData || [])
    const mine = reqData?.find(r => r.user_id === user?.id)
    setMyRequest(mine || null)
  }

  const handleJoinRequest = async () => {
    if (!user) return navigate('/login')
    if (!user.profile_completed) return alert("Please complete your profile first.")
    
    await supabase.from('ride_requests').insert([
      { ride_id: id, user_id: user.id, status: 'pending' }
    ])
    fetchRequests()
  }

  const handleApprove = async (reqId) => {
    await supabase.from('ride_requests').update({ status: 'approved' }).eq('id', reqId)
    // Seat decrement is now handled by DB trigger trg_update_ride_seats
    fetchRequests()
  }

  const handleReject = async (reqId) => {
    await supabase.from('ride_requests').update({ status: 'rejected' }).eq('id', reqId)
    fetchRequests()
  }

  const handleCompleteRide = async () => {
    // Check if there are any approved passengers
    const approvedCount = requests.filter(r => r.status === 'approved').length
    
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
  
  const isCompleted = ride.status === 'completed'
  const isAwaiting = ride.status === 'awaiting_reviews'
  const isCancelled = ride.status === 'cancelled'
  const canChat = (isCreator || isApproved) && !isCancelled

  const pickupPos = [ride.pickup_lat, ride.pickup_lng]
  const destPos = [ride.destination_lat, ride.destination_lng]
  const bounds = L.latLngBounds([pickupPos, destPos])
  
  // Straight line distance Haversine
  const dist = L.latLng(pickupPos).distanceTo(L.latLng(destPos)) / 1000 // km

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
      {/* Left Column: Map & Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ height: '350px', width: '100%' }}>
            <MapContainer bounds={bounds} style={{ height: '100%', width: '100%', zIndex: 1 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={pickupPos} />
              <Marker position={destPos} />
              <Polyline positions={[pickupPos, destPos]} color="var(--primary)" weight={4} dashArray="10, 10" />
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
              />
            </div>

            {isCancelled && (
              <div style={{ display: 'inline-block', background: '#ef4444', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                RIDE CANCELLED
              </div>
            )}

            <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <div><strong>Pickup:</strong> {ride.pickup_location_name}</div>
              <div><strong>Destination:</strong> {ride.destination_name}</div>
              <div><strong>Approx Distance:</strong> {dist.toFixed(2)} km</div>
              <div><strong>Departure:</strong> {new Date(ride.departure_time).toLocaleString()}</div>
              <div><strong>Seats:</strong> {ride.available_seats} / {ride.max_occupancy}</div>
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
              {ride.drivers && !ride.external_driver && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text)', marginBottom: '0.25rem' }}><strong>Assigned Driver:</strong> {ride.drivers.name}</div>
                  <div><strong>Vehicle:</strong> {ride.drivers.vehicle_number} ({ride.drivers.vehicle_type})</div>
                  <div><strong>Contact:</strong> 📞 {ride.drivers.mobile_number}</div>
                </div>
              )}
              {!isCancelled && (
                 <div style={{ marginTop: '0.5rem' }}><strong>Status:</strong> <span style={{ textTransform: 'uppercase', color: isCompleted ? '#22c55e' : 'var(--primary)', fontWeight: 'bold' }}>{ride.status}</span></div>
              )}
            </div>

            {!isCreator && !isCompleted && !isCancelled && !isAwaiting && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                {!myRequest ? (
                  <button className="btn" onClick={handleJoinRequest} disabled={ride.available_seats === 0 || !user?.profile_completed}>
                    {ride.available_seats === 0 ? 'Full' : 'Request to Join'}
                  </button>
                ) : (
                  <div className="btn" style={{ background: myRequest.status === 'approved' ? '#22c55e' : myRequest.status === 'rejected' ? '#ef4444' : 'var(--bg-card)', border: '1px solid var(--border)' }}>
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

            {isCreator && !isCompleted && !isCancelled && !isAwaiting && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button className="btn" style={{ background: '#22c55e', flex: 1 }} onClick={handleCompleteRide}>
                  Mark Completed
                </button>
                <CancelRideButton 
                  rideId={id} 
                  currentUserId={user.id} 
                  onCancelled={() => { setRide({...ride, status: 'cancelled'}) }} 
                />
              </div>
            )}
            
            {(isAwaiting && !showReview && !hasReviewed && (isCreator || isApproved)) && (
               <button className="btn" onClick={() => setShowReview(true)} style={{ marginTop: '1rem', width: '100%', background: 'var(--primary)' }}>
                 {isCreator ? 'Review Passengers' : 'Submit Ride Review'}
               </button>
            )}
            
            {(hasReviewed && isAwaiting) && (
               <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: '8px', textAlign: 'center' }}>
                 Your review has been submitted. Waiting for others...
               </div>
            )}
            
            {(hasReviewed && isCompleted) && (
               <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: '8px', textAlign: 'center' }}>
                 Ride is Completed!
               </div>
            )}

            {showReview && !hasReviewed && isAwaiting && (
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
        
        {/* Creator Control Panel */}
        {isCreator && !isCancelled && (
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

        {/* Chat Interface */}
        <RideChat 
          rideId={id} 
          currentUserId={user?.id} 
          canChat={canChat} 
          isCompleted={isCompleted || isCancelled} 
        />

      </div>
    </div>
  )
}
