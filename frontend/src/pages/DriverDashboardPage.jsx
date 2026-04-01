import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import DriverRideCard from '../components/DriverRideCard'
import { Car, Bell, RefreshCw, CheckCircle, Power } from 'lucide-react'

const TABS = [
  { id: 'new', label: 'New Requests', icon: Bell, statuses: ['pending_driver'] },
  { id: 'negotiating', label: 'Negotiations', icon: RefreshCw, statuses: ['negotiating', 'price_proposed'] },
  { id: 'accepted', label: 'Accepted Rides', icon: CheckCircle, statuses: ['published', 'active'] },
]

export default function DriverDashboardPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('new')
  const [rides, setRides] = useState([])
  const [loading, setLoading] = useState(true)
  const [driverStatus, setDriverStatus] = useState('available')

  useEffect(() => {
    if (!user?.id) return
    fetchRides()
    fetchDriverStatus()

    // Realtime subscription for rides assigned to this driver natively or to their legacy ID
    // Cannot easily map both inside the string filter, so we omit filter and check payload
    let legacyId = null
    
    const resolveLegacyAndSub = async () => {
      const mobile = user.phone || user.mobile_number
      if (mobile) {
        const raw = mobile.replace(/\\D/g, '')
        const noCode = raw.startsWith('91') ? raw.slice(2) : raw
        const res = await supabase.from('registered_vehicles').select('id').in('mobile_number', [`+91${noCode}`, noCode, mobile]).maybeSingle()
        if (res.data) legacyId = res.data.id
      }

      const sub = supabase.channel(`driver-rides-merged-${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'rides'
        }, (payload) => {
          if (payload.new && (payload.new.assigned_driver_id === user.id || payload.new.driver_id === legacyId || payload.new.status === 'pending_driver')) {
            fetchRides()
          }
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ride_offers',
          filter: `driver_id=eq.${user.id}`
        }, () => {
          fetchRides()
        })
        .subscribe()
      
      return sub
    }

    let subInstance = null
    resolveLegacyAndSub().then(sub => subInstance = sub)

    return () => { if (subInstance) subInstance.unsubscribe() }
  }, [user?.id])

  const fetchRides = async () => {
    if (!user?.id) return
    setLoading(true)

    // 1. Resolve their associated legacy ID if they were registered by an admin
    let legacyId = null
    const mobile = user.phone || user.mobile_number
    if (mobile) {
      const rawDigits = mobile.replace(/\\D/g, '')
      const withoutCode = rawDigits.startsWith('91') ? rawDigits.slice(2) : rawDigits
      const withCode = `+91${withoutCode}`

      const { data: legacyDriver } = await supabase
        .from('registered_vehicles')
        .select('id')
        .in('mobile_number', [withCode, withoutCode, mobile])
        .maybeSingle()
      
      if (legacyDriver) legacyId = legacyDriver.id
    }

    // 2. Query rides for either user.id OR legacyId, PLUS any open marketplace rides
    let queryArgs = `assigned_driver_id.eq.${user.id},status.eq.pending_driver`
    if (legacyId) {
      queryArgs += `,driver_id.eq.${legacyId}`
    }

    const { data, error } = await supabase
      .from('rides')
      .select(`*, users!creator_id(name, avatar_url, rating)`)
      .or(queryArgs)
      .not('status', 'in', '("cancelled","completed","awaiting_reviews","rejected")')
      .order('created_at', { ascending: false })

    const { data: offersData } = await supabase
      .from('ride_offers')
      .select('*')
      .eq('driver_id', user.id)
    
    const myOffers = offersData || []

    if (!error) {
       // Overwrite local driver view perspective smoothly
       const enhancedRides = (data || []).map(r => {
         const myOffer = myOffers.find(o => o.ride_id === r.id)
         let meta = r.status
         if (myOffer && r.status === 'pending_driver') {
           if (['pending_student', 'pending_driver'].includes(myOffer.status)) meta = 'negotiating'
           if (['rejected_by_student', 'rejected_by_driver', 'rejected_system'].includes(myOffer.status)) meta = 'rejected'
         }
         return { ...r, driverMetaStatus: meta, offer: myOffer }
       })
       setRides(enhancedRides)
    }
    setLoading(false)
  }

  const fetchDriverStatus = async () => {
    const { data } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', user.id)
      .single()
    if (data) setDriverStatus(data.status)
  }

  const toggleStatus = async () => {
    const newStatus = driverStatus === 'available' ? 'offline' : 'available'
    const { error } = await supabase
      .from('drivers')
      .update({ status: newStatus })
      .eq('id', user.id)
    if (!error) setDriverStatus(newStatus)
  }

  const dismissedRides = JSON.parse(localStorage.getItem('dismissed_rides') || '[]')
  // Hide open marketplace requests from offline drivers, and auto-expire ancient requests
  const visibleRides = rides.filter(r => {
    if (r.driverMetaStatus === 'rejected') return false
    if (r.status === 'pending_driver' && driverStatus === 'offline') return false
    if (r.status === 'pending_driver' && dismissedRides.includes(r.id)) return false
    // automatically expire requests if their departure time has passed in the past 1 minute
    if (r.status === 'pending_driver' && r.departure_time && new Date(r.departure_time) < new Date()) {
      return false
    }
    return true
  })

  const activeStatuses = TABS.find(t => t.id === activeTab)?.statuses || []
  const filteredRides = visibleRides.filter(r => activeStatuses.includes(r.driverMetaStatus))

  const countFor = (tab) => visibleRides.filter(r => tab.statuses.includes(r.driverMetaStatus)).length

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Driver Dashboard</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            Welcome back, {user?.name || 'Driver'}
          </p>
        </div>
        <button
          onClick={toggleStatus}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '999px',
            border: '2px solid',
            borderColor: driverStatus === 'available' ? '#22c55e' : 'rgba(255,255,255,0.2)',
            background: driverStatus === 'available' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
            color: driverStatus === 'available' ? '#22c55e' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.85rem'
          }}
        >
          <Power size={14} />
          {driverStatus === 'available' ? 'Online' : 'Offline'}
        </button>
      </div>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const count = countFor(tab)
          return (
            <div key={tab.id} className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
              <Icon size={20} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>{count}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tab.label}</div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const count = countFor(tab)
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: isActive ? '600' : '400',
                fontSize: '0.9rem',
                marginBottom: '-1px',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={15} />
              {tab.label}
              {count > 0 && (
                <span style={{
                  background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  borderRadius: '999px',
                  padding: '0 6px',
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  minWidth: '18px',
                  textAlign: 'center'
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Ride Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading rides...
        </div>
      ) : filteredRides.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }} className="glass-card">
          <Car size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>
            {activeTab === 'new' && 'No new ride requests at the moment.'}
            {activeTab === 'negotiating' && 'No active negotiations.'}
            {activeTab === 'accepted' && 'No accepted rides yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredRides.map(ride => (
            <DriverRideCard
              key={ride.id}
              ride={ride}
              onUpdate={fetchRides}
            />
          ))}
        </div>
      )}
    </div>
  )
}
