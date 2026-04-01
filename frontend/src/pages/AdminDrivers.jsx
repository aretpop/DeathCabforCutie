import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Form State
  const [name, setName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehicleType, setVehicleType] = useState('Auto')

  useEffect(() => {
    fetchDrivers()
    
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
      const { data, error: err } = await supabase
        .from('registered_vehicles')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) throw err
      setDrivers(data || [])
    } catch (err) {
      console.error('Error fetching drivers:', err)
      setError('Failed to load drivers.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    
    try {
      const { error: insertError } = await supabase.from('registered_vehicles').insert([{
        name,
        mobile_number: mobileNumber,
        vehicle_number: vehicleNumber,
        vehicle_type: vehicleType,
        status: 'Available'
      }])

      if (insertError) throw insertError
      
      // Reset form
      setName('')
      setMobileNumber('')
      setVehicleNumber('')
      setVehicleType('Auto')
      
    } catch (err) {
      setError(err.message || 'Failed to add driver. Check if mobile or vehicle number is already registered.')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this driver?")) return
    try {
      const { error: delError } = await supabase.from('registered_vehicles').delete().eq('id', id)
      if (delError) throw delError
    } catch (err) {
      alert("Failed to delete. " + err.message)
    }
  }

  const handleStatusToggle = async (driver) => {
    const newStatus = driver.status === 'Available' ? 'Reserved' : 'Available'
    try {
      const { error: updErr } = await supabase.from('registered_vehicles').update({ status: newStatus }).eq('id', driver.id)
      if (updErr) throw updErr
    } catch (err) {
      alert("Failed to toggle status. " + err.message)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Registered Vehicles (Admin)</h2>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Register New Vehicle / Driver</h3>
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Full Name</label>
            <input required type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ramesh Kumar" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Mobile Number</label>
            <input required type="text" className="input-field" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="e.g. 9876543210" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Vehicle Number</label>
            <input required type="text" className="input-field" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="e.g. PB12 AB 1234" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Vehicle Type</label>
            <select className="input-field" value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
              <option value="Auto">Auto Rickshaw</option>
              <option value="Cab">Cab</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn">Register Driver</button>
          </div>
        </form>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1rem' }}>Registered Vehicles</h3>
        {loading ? <p>Loading drivers...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 0' }}>Name</th>
                <th style={{ padding: '0.75rem 0' }}>Vehicle Info</th>
                <th style={{ padding: '0.75rem 0' }}>Mobile</th>
                <th style={{ padding: '0.75rem 0' }}>Status</th>
                <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>No drivers registered yet.</td></tr>
              ) : drivers.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem 0', fontWeight: 'bold' }}>{d.name}</td>
                  <td style={{ padding: '1rem 0' }}>{d.vehicle_number} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({d.vehicle_type})</span></td>
                  <td style={{ padding: '1rem 0' }}>{d.mobile_number}</td>
                  <td style={{ padding: '1rem 0' }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '12px', 
                      fontSize: '0.85rem', 
                      background: d.status === 'Available' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: d.status === 'Available' ? '#22c55e' : '#ef4444'
                    }}>
                      {d.status === 'Available' ? '🟢 Available' : '🔴 Reserved'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                     <button onClick={() => handleStatusToggle(d)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem' }}>
                       Toggle Status
                     </button>
                     <button onClick={() => handleDelete(d.id)} style={{ background: '#ef4444', border: 'none', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                       Delete
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
