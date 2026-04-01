import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { calculatePriceRange, haversineDistance, VEHICLE_MULTIPLIERS } from '../utils/priceEngine'

// Fix default leaf icon issues
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const LocationMarker = ({ position, setPosition, label }) => {
  useMapEvents({
    click(e) {
      if (label === 'pickup') {
        setPosition(p => ({ ...p, pickup: e.latlng }))
      } else if (label === 'destination') {
        setPosition(p => ({ ...p, destination: e.latlng }))
      }
    },
  })
  return position ? <Marker position={position} /> : null
}

export default function CreateRide() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [pickupName, setPickupName] = useState('')
  const [destName, setDestName] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [occupancy, setOccupancy] = useState(3)
  const [totalPrice, setTotalPrice] = useState('')
  const [error, setError] = useState(null)
  
  const [positions, setPositions] = useState({ pickup: null, destination: null })
  const [activeSelect, setActiveSelect] = useState('pickup')
  const [loading, setLoading] = useState(false)
  // Price engine states
  const [priceRange, setPriceRange] = useState(null)  // { min, max, suggested }
  const [vehicleTypeForPrice, setVehicleTypeForPrice] = useState('Auto')

  // Recalculate price range when positions change
  useEffect(() => {
    if (positions.pickup && positions.destination) {
      const dist = haversineDistance(
        positions.pickup.lat, positions.pickup.lng,
        positions.destination.lat, positions.destination.lng
      )
      const range = calculatePriceRange(dist, vehicleTypeForPrice)
      setPriceRange(range)
      // Auto-set suggested price
      if (!totalPrice) setTotalPrice(range.suggested.toString())
    } else {
      setPriceRange(null)
    }
  }, [positions, vehicleTypeForPrice])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const departureDate = new Date(departureTime)
    if (departureDate <= new Date()) {
      setError("Departure time must be in the future.")
      return
    }

    if (!user?.profile_completed) {
      setError("You must complete your profile (Name and Avatar) before publishing rides.")
      return
    }

    // New validation for empty ride details
    if (!pickupName.trim() || !destName.trim() || !departureTime) {
      setError("Please fill in all ride details (Pickup Name, Destination Name, Departure Time).")
      return
    }

    if (!totalPrice || parseFloat(totalPrice) <= 0) {
      setError("Please enter a valid total ride price (must be greater than ₹0).")
      return
    }

    if (!positions.pickup || !positions.destination) {
      setError("Please click on the map to set both pickup and destination markers.")
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Calculate price range for negotiation
      let initialP = parseFloat(totalPrice)
      let minP = priceRange?.min || Math.round(initialP * 0.85)
      let maxP = priceRange?.max || Math.round(initialP * 1.25)

      const { data: rideId, error: rpcError } = await supabase.rpc('create_ride_with_driver', {
        p_creator_id: user.id,
        p_pickup_location_name: pickupName,
        p_pickup_lat: positions.pickup.lat,
        p_pickup_lng: positions.pickup.lng,
        p_destination_name: destName,
        p_destination_lat: positions.destination.lat,
        p_destination_lng: positions.destination.lng,
        p_departure_time: new Date(departureTime).toISOString(),
        p_max_occupancy: parseInt(occupancy),
        p_total_price: initialP,
        p_driver_id: null,
        p_external_driver: null,
        p_initial_price: initialP,
        p_min_price: minP,
        p_max_price: maxP,
      })

      if (rpcError) throw rpcError

      navigate(`/ride/${rideId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Request a Ride</h2>
      </div>

      {!user?.profile_completed && (
        <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
          <strong>Profile Incomplete:</strong> You must set your Name and Avatar on the Profile page before you can publish a ride.
        </div>
      )}

      {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}

      <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', opacity: user?.profile_completed ? 1 : 0.5, pointerEvents: user?.profile_completed ? 'auto' : 'none' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Pickup Location Name</label>
            <input 
              required 
              type="text" 
              className="input-field" 
              value={pickupName} 
              onChange={e => setPickupName(e.target.value)} 
              placeholder="e.g. Main Gate" 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Destination Name</label>
            <input 
              required 
              type="text" 
              className="input-field" 
              value={destName} 
              onChange={e => setDestName(e.target.value)} 
              placeholder="e.g. Science Block" 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Departure Time</label>
            <input 
              required 
              type="datetime-local" 
              className="input-field" 
              value={departureTime} 
              onChange={e => setDepartureTime(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Available Seats (Capacity)</label>
            <input 
              required 
              type="number" 
              min="0" 
              max="6" 
              className="input-field" 
              value={occupancy} 
              onChange={e => setOccupancy(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Vehicle Type</label>
            <select className="input-field" value={vehicleTypeForPrice} onChange={e => setVehicleTypeForPrice(e.target.value)}>
              <option value="Auto">Auto Rickshaw</option>
              <option value="Cab">Cab</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Ride Price (₹)</label>
            <input 
              required 
              type="number" 
              min="1"
              step="1"
              className="input-field" 
              value={totalPrice} 
              onChange={e => setTotalPrice(e.target.value)} 
              placeholder="e.g. 120"
              style={{
                borderColor: priceRange && totalPrice
                  ? parseFloat(totalPrice) >= priceRange.min && parseFloat(totalPrice) <= priceRange.max
                    ? 'rgba(34,197,94,0.5)'
                    : 'rgba(239,68,68,0.5)'
                  : undefined
              }}
            />
            {priceRange && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '8px', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600' }}>📊 Recommended:</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>₹{priceRange.min} – ₹{priceRange.max}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>· Suggested: ₹{priceRange.suggested}</span>
                {totalPrice && (parseFloat(totalPrice) < priceRange.min || parseFloat(totalPrice) > priceRange.max) && (
                  <div style={{ color: '#ef4444', marginTop: '0.25rem' }}>⚠️ Price is outside the recommended range</div>
                )}
              </div>
            )}
            {totalPrice > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Estimated per person: ₹{(parseFloat(totalPrice) / Math.max(1, parseInt(occupancy) + 1)).toFixed(2)}
              </p>
            )}
          </div>
          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '1rem', width: '100%', fontSize: '1.1rem' }}>
            {loading ? 'Publishing...' : 'Broadcast to Marketplace'}
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              type="button"
              className={activeSelect === 'pickup' ? 'btn' : 'btn btn-secondary'} 
              style={{ flex: 1, padding: '0.5rem' }}
              onClick={() => setActiveSelect('pickup')}
            >
              Set Pickup
            </button>
            <button 
              type="button"
              className={activeSelect === 'destination' ? 'btn' : 'btn btn-secondary'} 
              style={{ flex: 1, padding: '0.5rem' }}
              onClick={() => setActiveSelect('destination')}
            >
              Set Destination
            </button>
          </div>
          <div style={{ flex: 1, minHeight: '300px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={[28.6139, 77.2090]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              {activeSelect === 'pickup' && <LocationMarker position={positions.pickup} setPosition={setPositions} label="pickup" />}
              {activeSelect === 'destination' && <LocationMarker position={positions.destination} setPosition={setPositions} label="destination" />}
              {positions.pickup && activeSelect !== 'pickup' && <Marker position={positions.pickup} opacity={0.5} />}
              {positions.destination && activeSelect !== 'destination' && <Marker position={positions.destination} opacity={0.5} />}
            </MapContainer>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Click on the map to place the {activeSelect} marker.
          </p>
        </div>
      </div>
    </div>
  )
}
