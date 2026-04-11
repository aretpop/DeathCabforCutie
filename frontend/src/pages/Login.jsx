import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { MapPin } from 'lucide-react'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            prompt: 'select_account',
          },
          redirectTo: window.location.origin,
          // Restrict to campus domain if supported by cloud config, 
          // else we handle it in AuthContext/Router after redirect
        }
      })
      if (error) throw error
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <MapPin size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
        <h1 style={{ marginBottom: '0.5rem' }}>Campus Rideshare</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Exclusive rickshaw sharing for students. Sign in with your campus email address.</p>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>{error}</div>}

        <button 
          className="btn" 
          style={{ width: '100%' }} 
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  )
}
