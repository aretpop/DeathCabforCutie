import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { User, AlertTriangle, ExternalLink, Upload, Eye, EyeOff, Star, Calendar } from 'lucide-react'

export default function ProfilePage() {
  const { user } = useAuth()
  
  const [name, setName]               = useState('')
  const [avatarUrl, setAvatarUrl]     = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [showIdentity, setShowIdentity] = useState(true)

  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState(null)

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setAvatarUrl(user.avatar_url || '')
      // Default to true if column doesn't exist yet (graceful fallback)
      setShowIdentity(user.show_identity !== false)
    }
  }, [user])

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setAvatarUrl(URL.createObjectURL(file))
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    let finalAvatarUrl = avatarUrl

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop()
      const filePath = `${user.id}/avatar_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selectedFile, { upsert: true })
      
      if (uploadError) {
        setLoading(false)
        setMessage({ type: 'error', text: 'Error uploading image: ' + uploadError.message })
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)
      
      finalAvatarUrl = publicUrl
    }

    const isCompleted = name.trim().length > 0 && finalAvatarUrl.trim().length > 0

    const { error } = await supabase.from('users').update({
      name: name.trim(),
      avatar_url: finalAvatarUrl.trim(),
      profile_completed: isCompleted,
      show_identity: showIdentity
    }).eq('id', user.id)

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({
        type: 'success',
        text: isCompleted
          ? 'Profile saved and completed! Refreshing...'
          : 'Profile saved, but you still need both Name and Avatar to complete it.'
      })
      if (isCompleted) {
        window.location.reload()
      }
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Profile Preview Card ───────────────────────────────────────── */}
      <div className="glass-card" style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1.25rem', position: 'relative',
      }}>
        {/* Avatar preview */}
        <div style={{
          flexShrink: 0, width: '68px', height: '68px', borderRadius: '50%',
          background: 'var(--primary)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden', color: 'white',
          boxShadow: '0 0 0 3px rgba(36,138,82,0.15), 0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <User size={32} />
          )}
        </div>

        {/* Text info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: '700', fontSize: '1.15rem', color: 'var(--text-main)', lineHeight: 1.2 }}>
            {name || 'Your Name'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', color: 'var(--text-muted)', flexWrap: 'nowrap' }}>
            <Star size={13} fill="#fbbf24" color="#fbbf24" />
            <span style={{ fontWeight: '700', color: '#b45309' }}>
              {user?.rating ? user.rating.toFixed(1) : '—'}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{user?.total_reviews || 0} reviews</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <Calendar size={12} />
            <span>Joined {new Date(user?.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>

        {/* View public profile link */}
        <Link
          to={`/profile/${user?.id}`}
          style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.72rem', fontWeight: '600' }}
          title="View public profile"
        >
          <ExternalLink size={16} />
          View
        </Link>
      </div>

      {/* Page heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-muted)' }}>Profile Settings</h2>
      </div>

      {!user?.profile_completed && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <AlertTriangle color="#ef4444" size={24} />
          <div>
            <h4 style={{ margin: 0, color: '#ef4444' }}>Profile Incomplete</h4>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>You must provide a Name and an Avatar Image to publish or request rides.</p>
          </div>
        </div>
      )}

      {message && (
        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', color: message.type === 'error' ? '#ef4444' : '#22c55e', borderRadius: '8px' }}>
          {message.text}
        </div>
      )}

      <form className="glass-card" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'white', position: 'relative' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <User size={64} />
            )}
          </div>
          
          <div>
            <label htmlFor="avatar-upload" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <Upload size={16} /> Choose Image
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        </div>
        
        {/* Email */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Email (Verified)</label>
          <input type="text" className="input-field" value={user?.email || ''} disabled style={{ opacity: 0.7 }} />
        </div>

        {/* Display Name */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Display Name *</label>
          <input required type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rahul Sharma" />
        </div>

        {/* ── Privacy Setting ─────────────────────────────────────── */}
        <div style={{
          padding: '1.25rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {showIdentity ? <Eye size={18} color="var(--primary)" /> : <EyeOff size={18} color="var(--text-muted)" />}
              <span style={{ fontWeight: '500', color: 'var(--text)' }}>Show my identity publicly</span>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              id="show-identity-toggle"
              onClick={() => setShowIdentity(v => !v)}
              aria-checked={showIdentity}
              role="switch"
              style={{
                width: '48px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                background: showIdentity ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.25s',
                flexShrink: 0
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: showIdentity ? '25px' : '3px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.25s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
              }} />
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {showIdentity ? (
              <>
                <strong style={{ color: 'var(--primary)' }}>On:</strong> Your real name and photo are visible in ride listings and your public profile.
              </>
            ) : (
              <>
                <strong style={{ color: '#f59e0b' }}>Off:</strong> You appear as <em>"User"</em> with a generic avatar everywhere.
                Your identity is only revealed to the ride creator when you request to join, and to all participants once you're accepted.
              </>
            )}
          </p>
        </div>
        {/* ───────────────────────────────────────────────────────── */}

        <button type="submit" className="btn" disabled={loading} style={{ marginTop: '1rem' }}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>

      </form>
    </div>
  )
}
