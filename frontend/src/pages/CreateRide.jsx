import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { calculatePriceRange, MAX_SEATS } from '../utils/priceEngine';
import LocationSearchInput from '../components/LocationSearchInput';
import MapSelector from '../components/MapSelector';
import PriceBreakdownPanel from '../components/PriceBreakdownPanel';
import { ArrowUpDown, AlertCircle, Info, Clock, Route, Zap, Shield } from 'lucide-react';
import { PRESET_LOCATIONS } from '../config/locations';
import { PRIORITY_CONFIG, PRIORITY_TYPES, DAILY_LIMITS, calculatePriorityScore } from '../utils/priorityEngine';

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
  const [rideMode, setRideMode] = useState('carpool'); // 'solo' | 'carpool'
  const [occupancy, setOccupancy] = useState(3);
  const [vehicleTypeForPrice, setVehicleTypeForPrice] = useState('Auto');
  const [totalPrice, setTotalPrice] = useState('');
  const [priorityType, setPriorityType] = useState('NORMAL');
  const [priorityNotes, setPriorityNotes] = useState('');

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

  // Clear price range when route is removed
  // (PriceBreakdownPanel drives the range update via onSuggestedPrice when a route exists)
  useEffect(() => {
    if (!routeInfo || !routeInfo.distance) {
      setPriceRange(null);
      setTotalPrice('');
    }
  }, [routeInfo]);

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

    // ── Abuse check for elevated priority types ───────────────────────────
    if (priorityType !== 'NORMAL') {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const { count } = await supabase
        .from('priority_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('priority_type', priorityType)
        .gte('created_at', todayStart.toISOString());
      const limit = DAILY_LIMITS[priorityType] || 2;
      if ((count || 0) >= limit) {
        setError(`You've reached the daily limit (${limit}) for ${PRIORITY_CONFIG[priorityType].label} rides. This helps prevent misuse.`);
        setLoading(false);
        return;
      }
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
        p_max_occupancy: parseInt(occupancy) || 0,
        p_total_price: initialP,
        p_driver_id: null,
        p_external_driver: null,
        p_initial_price: initialP,
        p_min_price: minP,
        p_max_price: maxP,
      });

      if (rpcError) throw rpcError;

      // Store vehicle_type + priority fields on the ride
      const rideVehicleType = vehicleTypeForPrice === 'Cab' ? 'cab' : 'autorickshaw';
      const score = calculatePriorityScore(priorityType, routeInfo?.distance ?? null, 0);
      await supabase.from('rides').update({
        vehicle_type:    rideVehicleType,
        priority_type:   priorityType,
        priority_notes:  priorityNotes.trim() || null,
        priority_score:  score,
      }).eq('id', rideId);

      // Log elevated priority usage for abuse tracking
      if (priorityType !== 'NORMAL') {
        await supabase.from('priority_usage_log').insert([{
          user_id:       user.id,
          priority_type: priorityType,
          ride_id:       rideId,
        }]);
      }

      navigate(`/ride/${rideId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', opacity: user?.profile_completed ? 1 : 0.5, pointerEvents: user?.profile_completed ? 'auto' : 'none', alignItems: 'start' }} className="create-ride-grid">
        
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '0.25rem' }}>
          
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500' }}>
              Ride Mode
            </label>
            <div style={{
              display: 'flex',
              background: 'var(--bg-card)',
              padding: '4px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: rideMode === 'carpool' ? '50%' : '4px',
                width: 'calc(50% - 4px)',
                background: 'var(--primary)',
                borderRadius: '8px',
                transition: 'all 0.3s ease'
              }} />
              <button
                type="button"
                onClick={() => { setRideMode('solo'); setOccupancy(0); }}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  border: 'none',
                  background: 'transparent',
                  color: rideMode === 'solo' ? 'white' : 'var(--text)',
                  fontWeight: rideMode === 'solo' ? '600' : 'normal',
                  position: 'relative',
                  zIndex: 1,
                  cursor: 'pointer',
                  transition: 'color 0.3s ease',
                  fontSize: '0.9rem'
                }}
              >
                Travel Solo
              </button>
              <button
                type="button"
                onClick={() => { setRideMode('carpool'); setOccupancy(Math.max(1, parseInt(occupancy) || 3)); }}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  border: 'none',
                  background: 'transparent',
                  color: rideMode === 'carpool' ? 'white' : 'var(--text)',
                  fontWeight: rideMode === 'carpool' ? '600' : 'normal',
                  position: 'relative',
                  zIndex: 1,
                  cursor: 'pointer',
                  transition: 'color 0.3s ease',
                  fontSize: '0.9rem'
                }}
              >
                Carpool
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Info size={12} style={{ color: 'var(--primary)' }} /> 
              {rideMode === 'solo' 
                ? 'Private ride. Will not be broadcasted for others to join.'
                : 'Share the ride. Other users can join to split the cost.'}
            </p>
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
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Vehicle Type</label>
              <select className="input-field" value={vehicleTypeForPrice} onChange={e => setVehicleTypeForPrice(e.target.value)}>
                <option value="Auto">Auto Rickshaw</option>
                <option value="Cab">Cab</option>
              </select>
            </div>
          </div>

          {rideMode === 'carpool' && (
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
                onChange={e => setOccupancy(Math.max(1, Math.min(parseInt(e.target.value) || 1, MAX_SEATS)))} 
              />
            </div>
          )}

          <div style={{ padding: '1rem', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Price for Trip (₹)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>₹</span>
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
                      : 'rgba(239,68,68,0.5)'
                    : undefined,
                }}
              />
            </div>
            {!routeInfo && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Info size={12} /> Set route → get auto-suggested price.
              </p>
            )}
            {totalPrice && priceRange && (parseFloat(totalPrice) < priceRange.min || parseFloat(totalPrice) > priceRange.max) && (
              <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.4rem', fontSize: '0.78rem' }}>
                <AlertCircle size={12} /> Outside recommended range — may affect bookings.
              </div>
            )}
          </div>

          {/* ── Priority Type ───────────────────────────────────────── */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>
              <Shield size={15} color="var(--primary)" /> Ride Priority
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {PRIORITY_TYPES.map(type => {
                const cfg = PRIORITY_CONFIG[type];
                const active = priorityType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setPriorityType(type); if (type === 'NORMAL') setPriorityNotes(''); }}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '10px',
                      border: active
                        ? `2px solid ${cfg.border || 'var(--primary)'}`
                        : '2px solid var(--border)',
                      background: active ? (cfg.bg || 'rgba(99,102,241,0.1)') : 'transparent',
                      color: active ? (cfg.color || 'var(--primary)') : 'var(--text-muted)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      fontWeight: active ? '700' : '400',
                      transition: 'all 0.15s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem',
                    }}
                  >
                    <span>{cfg.emoji} {cfg.label}</span>
                    {active && type !== 'NORMAL' && (
                      <span style={{ fontSize: '0.72rem', opacity: 0.8, fontWeight: '400' }}>{cfg.description}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Notes field for medical / emergency */}
            {PRIORITY_CONFIG[priorityType]?.needsNotes && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Priority Note <span style={{ opacity: 0.6 }}>(optional but recommended)</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={priorityNotes}
                  onChange={e => setPriorityNotes(e.target.value)}
                  placeholder={priorityType === 'EMERGENCY' ? 'e.g. Fell from stairs, need urgent transport' : 'e.g. Heart patient, doctor appointment'}
                  maxLength={120}
                  style={{ borderColor: PRIORITY_CONFIG[priorityType].border }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  ⚠️ Misuse of emergency priority is tracked and may restrict future access.
                </p>
              </div>
            )}
          </div>

          {/* ── Sticky Broadcast Button ──────────────────────────────── */}
          <div className="sticky-action-footer">
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Publishing...' : '📡 Broadcast Ride to Market'}
            </button>
          </div>
        </form>

        {/* Right Map Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          
          {/* Pickup / Destination mode toggle */}
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

          {/* ── Quick-pick preset chips ───────────────────────────────────── */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '0.6rem 0.75rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginBottom: '0.5rem',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              fontWeight: '600',
              letterSpacing: '0.05em',
            }}>
              <Zap size={12} />
              QUICK LOCATIONS — sets {activeSelect === 'pickup' ? 'PICKUP' : 'DESTINATION'}
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
            }}>
              {PRESET_LOCATIONS.map((loc) => {
                const isPickupActive   = activeSelect === 'pickup'   && pickup?.name   === loc.name;
                const isDestActive     = activeSelect === 'destination' && destination?.name === loc.name;
                const isActive         = isPickupActive || isDestActive;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      if (activeSelect === 'pickup') {
                        setPickup(loc);
                        setPickupNameInput(loc.name);
                        setActiveSelect('destination');
                      } else {
                        setDestination(loc);
                        setDestNameInput(loc.name);
                      }
                    }}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: isActive ? '600' : '400',
                      cursor: 'pointer',
                      border: isActive
                        ? `1.5px solid ${activeSelect === 'pickup' ? '#22c55e' : 'var(--primary)'}`
                        : '1.5px solid var(--border)',
                      background: isActive
                        ? activeSelect === 'pickup'
                          ? 'rgba(34,197,94,0.12)'
                          : 'rgba(99,102,241,0.12)'
                        : 'var(--bg-subtle)',
                      color: isActive ? (activeSelect === 'pickup' ? '#22c55e' : 'var(--primary)') : 'var(--text-muted)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {loc.name}
                  </button>
                );
              })}
            </div>
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

          {/* Price Breakdown — sits cleanly below the map */}
          <PriceBreakdownPanel
            distanceKm={routeInfo?.distance ?? null}
            vehicleType={vehicleTypeForPrice}
            seats={occupancy !== '' ? parseInt(occupancy) : 0}
            departureTime={departureTime}
            onSuggestedPrice={(price, min, max) => {
              // Panel is the single source of truth — it already accounts for
              // departure time (peak hours), vehicle type, and seat count.
              setTotalPrice(price.toString());
              setPriceRange({ min, max, suggested: price });
            }}
          />

        </div>
      </div>
    </div>
  );
}
