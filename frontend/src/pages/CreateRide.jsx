import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { calculatePriceRange, MAX_SEATS } from '../utils/priceEngine';
import LocationSearchInput from '../components/LocationSearchInput';
import MapSelector from '../components/MapSelector';
import { ArrowUpDown, AlertCircle, Info, Clock, Route } from 'lucide-react';

export default function CreateRide() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Explicit geo state
  const [pickup, setPickup] = useState(null); // { lat, lng, name }
  const [destination, setDestination] = useState(null); // { lat, lng, name }
  const [pickupNameInput, setPickupNameInput] = useState('');
  const [destNameInput, setDestNameInput] = useState('');

  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration, isFallback }
  const [activeSelect, setActiveSelect] = useState('pickup');

  // Form state
  const [departureTime, setDepartureTime] = useState('');
  const [occupancy, setOccupancy] = useState(3);
  const [vehicleTypeForPrice, setVehicleTypeForPrice] = useState('Auto');
  const [totalPrice, setTotalPrice] = useState('');

  // UI state
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [priceRange, setPriceRange] = useState(null);

  // Sync Input fields when objects change (e.g. from map click)
  useEffect(() => {
    if (pickup) setPickupNameInput(pickup.name || '');
  }, [pickup]);

  useEffect(() => {
    if (destination) setDestNameInput(destination.name || '');
  }, [destination]);

  // Recalculate price range when route updates
  useEffect(() => {
    if (routeInfo && routeInfo.distance) {
      const range = calculatePriceRange(routeInfo.distance, vehicleTypeForPrice);
      setPriceRange(range);
      
      // Auto-set suggested price only if user hasn't overridden excessively or if empty
      // Simplest UX: set automatically when route updates.
      setTotalPrice(range.suggested.toString());
    } else {
      setPriceRange(null);
    }
  }, [routeInfo, vehicleTypeForPrice]);

  const handleSwap = () => {
    const tempLoc = pickup;
    const tempName = pickupNameInput;

    setPickup(destination);
    setPickupNameInput(destNameInput);

    setDestination(tempLoc);
    setDestNameInput(tempName);

    // Swap active selected context if needed
    setActiveSelect(activeSelect === 'pickup' ? 'destination' : 'pickup');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const departureDate = new Date(departureTime);
    if (departureDate <= new Date()) {
      setError("Departure time must be in the future.");
      return;
    }

    if (!user?.profile_completed) {
      setError("You must complete your profile (Name and Avatar) before publishing rides.");
      return;
    }

    if (!pickup?.lat || !destination?.lat) {
      setError("Please set exact location pins for both pickup and destination.");
      return;
    }

    if (!totalPrice || parseFloat(totalPrice) <= 0) {
      setError("Please enter a valid total ride price (must be greater than ₹0).");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Calculate price range for negotiation
      let initialP = parseFloat(totalPrice);
      let minP = priceRange?.min || Math.round(initialP * 0.85);
      let maxP = priceRange?.max || Math.round(initialP * 1.25);

      const { data: rideId, error: rpcError } = await supabase.rpc('create_ride_with_driver', {
        p_creator_id: user.id,
        p_pickup_location_name: pickup.name || pickupNameInput,
        p_pickup_lat: pickup.lat,
        p_pickup_lng: pickup.lng,
        p_destination_name: destination.name || destNameInput,
        p_destination_lat: destination.lat,
        p_destination_lng: destination.lng,
        p_departure_time: new Date(departureTime).toISOString(),
        p_max_occupancy: parseInt(occupancy),
        p_total_price: initialP,
        p_driver_id: null,
        p_external_driver: null,
        p_initial_price: initialP,
        p_min_price: minP,
        p_max_price: maxP,
      });

      if (rpcError) throw rpcError;

      navigate(`/ride/${rideId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Publish a Ride</h2>

      {!user?.profile_completed && (
        <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} />
          <strong>Profile Incomplete:</strong> You must set your Name and Avatar on the Profile page before you can publish a ride.
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', opacity: user?.profile_completed ? 1 : 0.5, pointerEvents: user?.profile_completed ? 'auto' : 'none', alignItems: 'start' }}>
        
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
            <div onClick={() => setActiveSelect('pickup')}>
              <LocationSearchInput 
                label="Pickup Location"
                value={pickupNameInput}
                onChange={setPickupNameInput}
                onSelect={setPickup}
                placeholder="Where from?"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '-0.5rem 0', zIndex: 10 }}>
              <button 
                type="button" 
                onClick={handleSwap}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '50%', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                 title="Swap locations"
              >
                <ArrowUpDown size={16} color="var(--primary)" />
              </button>
            </div>

            <div onClick={() => setActiveSelect('destination')}>
              <LocationSearchInput 
                label="Destination"
                value={destNameInput}
                onChange={setDestNameInput}
                onSelect={setDestination}
                placeholder="Where to?"
              />
            </div>
          </div>

          <div className="responsive-grid-2">
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
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Available Seats <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.8rem' }}>(max {MAX_SEATS})</span>
              </label>
              <input 
                required 
                type="number" 
                min="1" 
                max={MAX_SEATS} 
                className="input-field" 
                value={occupancy} 
                onChange={e => setOccupancy(Math.min(parseInt(e.target.value) || 1, MAX_SEATS))} 
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Vehicle Type</label>
            <select className="input-field" value={vehicleTypeForPrice} onChange={e => setVehicleTypeForPrice(e.target.value)}>
              <option value="Auto">Auto Rickshaw</option>
              <option value="Cab">Cab</option>
            </select>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Fare Details</label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>₹</span>
              <input 
                required 
                type="number" 
                min="20"
                step="1"
                className="input-field" 
                value={totalPrice} 
                onChange={e => setTotalPrice(e.target.value)} 
                placeholder="0"
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  borderColor: priceRange && totalPrice
                    ? parseFloat(totalPrice) >= priceRange.min && parseFloat(totalPrice) <= priceRange.max
                      ? 'rgba(34,197,94,0.5)'
                      : 'rgba(239,68,68,0.5)' // red if outside range
                    : undefined
                }}
              />
            </div>

            {priceRange ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Fair Range Recommendation</span>
                  <span style={{ color: 'var(--primary)', fontWeight: '600' }}>₹{priceRange.min} – ₹{priceRange.max}</span>
                </div>
                {totalPrice && (parseFloat(totalPrice) < priceRange.min || parseFloat(totalPrice) > priceRange.max) && (
                  <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
                    <AlertCircle size={14} /> Warning: Price is outside the recommended range and may lack drivers or buyers.
                  </div>
                )}
                {totalPrice > 0 && (
                  <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                    Estimated contribution per person: ₹{(parseFloat(totalPrice) / Math.max(1, parseInt(occupancy) + 1)).toFixed(2)}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Info size={14} /> Enter pickup and destination to get fare estimates.
              </p>
            )}
          </div>
          
          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '0.5rem', width: '100%', fontSize: '1.1rem', padding: '0.8rem' }}>
            {loading ? 'Publishing...' : 'Broadcast Ride to Market'}
          </button>
        </form>

        {/* Right Map Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          
          <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <button 
              type="button"
              className={activeSelect === 'pickup' ? 'btn' : 'btn btn-secondary'} 
              style={{ flex: 1, padding: '0.5rem 0', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}
              onClick={() => setActiveSelect('pickup')}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }}></div> Pickup
            </button>
            <button 
              type="button"
              className={activeSelect === 'destination' ? 'btn' : 'btn btn-secondary'} 
              style={{ flex: 1, padding: '0.5rem 0', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}
              onClick={() => setActiveSelect('destination')}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div> Destination
            </button>
          </div>

          <MapSelector 
            pickup={pickup} 
            destination={destination} 
            activeSelect={activeSelect}
            onLocationChange={(type, loc) => {
              if (type === 'pickup') {
                setPickup(loc);
                setPickupNameInput(loc.name);
                setActiveSelect('destination'); // Auto advance to destination
              } else {
                setDestination(loc);
                setDestNameInput(loc.name);
              }
            }}
            onRouteCalculated={setRouteInfo}
          />

          {routeInfo && (
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(99, 102, 241, 0.05)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                <Route size={20} color="var(--primary)" />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Distance</span>
                <strong style={{ fontSize: '1.1rem' }}>{routeInfo.distance.toFixed(1)} km</strong>
              </div>
              <div style={{ width: '1px', height: '40px', background: 'var(--border)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                <Clock size={20} color="var(--primary)" />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Est. Time</span>
                <strong style={{ fontSize: '1.1rem' }}>{Math.ceil(routeInfo.duration)} mins</strong>
              </div>
            </div>
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '-0.5rem' }}>
            Click anywhere on the map or drag the markers to adjust {activeSelect}.
          </p>

        </div>
      </div>
    </div>
  );
}
