import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Star, MapPin, Clock, Users, User as UserIcon, Calendar, Settings, IndianRupee } from 'lucide-react'
import ReviewList from '../components/ReviewList'
import { useAuth } from '../contexts/AuthContext'

export default function ProfilePublic() {
  const { id } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [activeRides, setActiveRides] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('as_rider') // 'as_rider' | 'as_publisher'

  useEffect(() => {
    fetchProfileData()
  }, [id])

  const fetchProfileData = async () => {
    setLoading(true)
    try {
      // Fetch user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()
      
      if (userError) throw userError
      setProfile(userData)

      // Fetch their active rides (not completed)
      const { data: ridesData, error: ridesError } = await supabase
        .from('rides')
        .select('*')
        .eq('creator_id', id)
        .in('status', ['published', 'active', 'pending_driver', 'negotiating', 'price_proposed'])
        .order('departure_time', { ascending: true })

      if (ridesError) throw ridesError
      setActiveRides(ridesData || [])

    } catch (err) {
      console.error("Error fetching profile:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading profile...</div>
  if (!profile) return <div style={{ textAlign: 'center', padding: '2rem' }}>User not found</div>

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '2rem', padding: '2rem', position: 'relative' }}>
        
        {user?.id === id && (
          <Link to="/profile/settings" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', color: 'var(--text-muted)' }} title="Edit Profile">
            <Settings size={28} />
          </Link>
        )}

        <div style={{ 
          width: '100px', 
          height: '100px', 
          borderRadius: '50%', 
          background: 'var(--primary)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          overflow: 'hidden',
          color: 'white'
        }}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <UserIcon size={48} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>{profile.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24', fontWeight: 'bold' }}>
              <Star size={16} fill="currentColor" /> {profile.rating?.toFixed(1) || 'No ratings'}
            </span>
            <span>•</span>
            <span>{profile.total_reviews || 0} reviews</span>
            <span>•</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={14} /> 
              Member since {new Date(profile.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Active Rides Section */}
        <div>
          <h3 style={{ marginBottom: '1rem' }}>Active Rides by {profile.name.split(' ')[0]}</h3>
          {activeRides.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No active rides at the moment.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {activeRides.map(ride => (
                <div key={ride.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                      {ride.available_seats} / {ride.max_occupancy}
                    </div>
                  </div>

                  {ride.total_price > 0 && (() => {
                    const joined = ride.max_occupancy - ride.available_seats
                    const occupants = joined + 1
                    const perPerson = (ride.total_price / Math.max(1, occupants)).toFixed(2)
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: 'rgba(99,102,241,0.12)', borderRadius: '6px', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><IndianRupee size={12} /> Total: ₹{ride.total_price}</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₹{perPerson}/person</span>
                      </div>
                    )
                  })()}

                  <Link to={`/ride/${ride.id}`} className="btn" style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', textAlign: 'center' }}>
                    View Ride
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reviews Section */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1rem' }}>Reviews</h3>
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
            <button 
              onClick={() => setActiveTab('as_rider')} 
              style={{ background: 'none', border: 'none', color: activeTab === 'as_rider' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: activeTab === 'as_rider' ? 'bold' : 'normal', cursor: 'pointer', padding: '0.5rem' }}
            >
              Reviews as Rider
            </button>
            <button 
              onClick={() => setActiveTab('as_publisher')} 
              style={{ background: 'none', border: 'none', color: activeTab === 'as_publisher' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: activeTab === 'as_publisher' ? 'bold' : 'normal', cursor: 'pointer', padding: '0.5rem' }}
            >
              Reviews as Publisher
            </button>
          </div>
          
          <ReviewList userId={id} reviewType={activeTab === 'as_rider' ? 'publisher_review' : 'rider_review'} />
        </div>

      </div>

    </div>
  )
}
