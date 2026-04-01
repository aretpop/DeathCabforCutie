import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, Users, Clock, Star, IndianRupee } from 'lucide-react'
import ProfileCard from '../components/ProfileCard'

export default function Rides() {
  const [rides, setRides] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    fetchRides()

    const subscription = supabase.channel('public:rides')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        fetchRides()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  const fetchRides = async () => {
    try {
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          users!creator_id(name, rating, avatar_url)
        `)
        .in('status', ['active', 'published'])
        .gt('available_seats', 0)
        .gt('departure_time', new Date().toISOString())
        .order('departure_time', { ascending: true })

      if (error) throw error
      setRides(data || [])
    } catch (error) {
      console.error('Error fetching rides:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading rides...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Available Rickshaws</h2>
        <Link to="/create" className="btn">
          Publish Ride
        </Link>
      </div>

      {rides.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <MapPin size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3>No rides currently available</h3>
          <p style={{ color: 'var(--text-muted)' }}>Be the first to share a rickshaw ride today!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {rides.map(ride => (
            <div key={ride.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <ProfileCard 
                  user={{
                    id: ride.creator_id,
                    name: ride.users?.name || 'Fellow Student',
                    rating: ride.users?.rating,
                    avatar_url: ride.users?.avatar_url
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
                  {ride.pickup_location_name}
                </div>
                <div style={{ borderLeft: '1px dashed var(--border)', height: '10px', marginLeft: '3px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <MapPin size={12} color="var(--accent)" style={{ marginLeft: '-2px' }} />
                  {ride.destination_name}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={14} />
                  {new Date(ride.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Users size={14} />
                  {ride.available_seats} / {ride.max_occupancy} Seats
                </div>
              </div>

              {ride.total_price > 0 && (() => {
                // occupants = passengers joined + publisher (1)
                const joined = ride.max_occupancy - ride.available_seats
                const occupants = joined + 1
                const perPerson = (ride.total_price / Math.max(1, occupants)).toFixed(2)
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(99, 102, 241, 0.12)', borderRadius: '8px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)' }}>
                      <IndianRupee size={13} />
                      Total: <strong style={{ color: 'var(--text)' }}>₹{ride.total_price}</strong>
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                      ₹{perPerson}/person
                    </div>
                  </div>
                )
              })()}

              <Link to={`/ride/${ride.id}`} className="btn" style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem' }}>
                View & Join
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
