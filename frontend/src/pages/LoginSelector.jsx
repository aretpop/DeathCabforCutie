import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, GraduationCap, ArrowRight } from 'lucide-react'

export default function LoginSelector() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'var(--bg)'
    }}>
      {/* Logo / Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{
          fontSize: '2.5rem',
          fontWeight: '800',
          background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem'
        }}>
          CampusRides
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          IIT Ropar's campus ride-sharing platform
        </p>
      </div>

      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Welcome! Who are you?</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', textAlign: 'center' }}>
        Choose how you'd like to continue
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '600px'
      }}>
        {/* Student Card */}
        <button
          onClick={() => navigate('/login/student')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '2rem',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: 'var(--text)',
            textAlign: 'center'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--primary)'
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'
            e.currentTarget.style.transform = 'translateY(-4px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <GraduationCap size={32} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.2rem', marginBottom: '0.4rem' }}>I'm a Student</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Sign in with your @iitrpr.ac.in Google account to publish or join rides
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontWeight: '600', fontSize: '0.9rem' }}>
            Continue with Google <ArrowRight size={16} />
          </div>
        </button>

        {/* Driver Card */}
        <button
          onClick={() => navigate('/login/driver')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '2rem',
            background: 'rgba(34, 197, 94, 0.06)',
            border: '2px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: 'var(--text)',
            textAlign: 'center'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#22c55e'
            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.12)'
            e.currentTarget.style.transform = 'translateY(-4px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.25)'
            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.06)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Car size={32} color="#22c55e" />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.2rem', marginBottom: '0.4rem' }}>I'm a Driver</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Sign in with your phone number to receive ride requests and negotiate prices
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#22c55e', fontWeight: '600', fontSize: '0.9rem' }}>
            Continue with Phone OTP <ArrowRight size={16} />
          </div>
        </button>
      </div>
    </div>
  )
}
