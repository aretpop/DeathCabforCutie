import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function DriverStatusWidget() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDrivers()
    
    // Subscribe to driver status changes in real-time
    const subscription = supabase.channel('public:registered_vehicles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registered_vehicles' }, () => {
        fetchDrivers()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  const fetchDrivers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('registered_vehicles')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) throw error
      setDrivers(data || [])
    } catch (err) {
      console.error('Error fetching drivers dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading Driver Status...</div>

  // Separate drivers into Available and Reserved for better visual breakdown
  const availableDrivers = drivers.filter(d => d.status === 'Available')
  const reservedDrivers = drivers.filter(d => d.status === 'Reserved')

  return (
    <div className="glass-card" style={{ marginBottom: '2rem' }}>
      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Available Rickshaws & Cabs</span>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          {availableDrivers.length} Available / {drivers.length} Total
        </span>
      </h3>
      
      {drivers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No drivers currently registered.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {drivers.map(driver => {
            const isAvailable = driver.status === 'Available'
            return (
              <div 
                key={driver.id} 
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: isAvailable ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${isAvailable ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 'bold' }}>{driver.name}</span>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: isAvailable ? '#22c55e' : '#ef4444',
                    marginTop: '4px'
                  }} />
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {driver.vehicle_number} ({driver.vehicle_type})
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  📞 {driver.mobile_number}
                </div>
                <div style={{ 
                  marginTop: '0.5rem', 
                  fontSize: '0.8rem', 
                  fontWeight: 'bold',
                  color: isAvailable ? '#22c55e' : '#ef4444'
                }}>
                  {driver.status.toUpperCase()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
