import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, Clock, IndianRupee, Users } from 'lucide-react'

export default function RideHistory() {
  const { user } = useAuth()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchHistory()
  }, [user])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      // 1. Rides they published
      const { data: publishedData } = await supabase
        .from('rides')
        .select('*')
        .eq('creator_id', user.id)

      const published = (publishedData || []).map(r => ({ ...r, role: 'Publisher' }))

      // 2. Rides they requested and were approved for
      const { data: requestedData } = await supabase
        .from('ride_requests')
        .select(`
          status,
          rides!inner(*)
        `)
        .eq('user_id', user.id)
        .in('status', ['approved', 'cancelled']) // skip pending/rejected to avoid clutter, focus on actual rides

      const joined = (requestedData || []).map(r => ({ 
        ...r.rides, 
        role: 'Rider', 
        myRequestStatus: r.status 
      }))

      // Merge and sort newest first (created_at desc)
      const combined = [...published, ...joined]
      
      // Deduplicate just in case 
      const unique = Array.from(new Map(combined.map(item => [item.id + item.role, item])).values())
      unique.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      setHistory(unique)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading history...</div>

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>My Ride History</h2>

      {history.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Clock size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3>No ride history yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>You haven't participated in any rides.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {history.map((ride, idx) => {
            const isCompleted = ride.status === 'completed' || ride.status === 'awaiting_reviews'
            const isCancelled = ride.status === 'cancelled' || ride.myRequestStatus === 'cancelled'
            
            return (
              <div key={`${ride.id}-${idx}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: ride.role === 'Publisher' ? 'var(--primary)' : 'var(--accent)' }}>
                    As {ride.role}
                  </strong>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    background: isCancelled ? 'rgba(239, 68, 68, 0.1)' : isCompleted ? 'rgba(34, 197, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                    color: isCancelled ? '#ef4444' : isCompleted ? '#22c55e' : 'var(--primary)',
                    textTransform: 'uppercase'
                  }}>
                    {isCancelled ? 'Cancelled' : isCompleted ? 'Completed' : ride.status.replace('_', ' ')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '0.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    {ride.pickup_location_name}
                  </div>
                  <div style={{ borderLeft: '1px dashed var(--border)', height: '10px', marginLeft: '3px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <MapPin size={12} color="var(--accent)" style={{ marginLeft: '-2px', flexShrink: 0 }} />
                    {ride.destination_name}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={14} />
                    {new Date(ride.departure_time).toLocaleDateString()} at {new Date(ride.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  
                  {ride.total_price > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <IndianRupee size={12} />
                      <strong>₹{ride.total_price}</strong> Total
                    </div>
                  )}
                </div>

                <Link to={`/ride/${ride.id}`} className="btn btn-secondary" style={{ marginTop: '0.5rem', textAlign: 'center', padding: '0.5rem' }}>
                  View Details
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
