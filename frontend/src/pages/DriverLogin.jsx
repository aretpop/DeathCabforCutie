import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, Phone, ArrowLeft, CheckCircle, User, Hash } from 'lucide-react'
import { supabase } from '../supabaseClient'

const STEPS = { PHONE: 'phone', OTP: 'otp', PROFILE: 'profile' }

export default function DriverLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState(STEPS.PHONE)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Profile fields
  const [name, setName] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehicleType, setVehicleType] = useState('Auto')

  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, '')
    return digits.startsWith('91') ? `+${digits}` : `+91${digits}`
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const formatted = formatPhone(phone)

      // 1. Check if the driver is registered by Admin
      const { data: existingDriver, error: lookupErr } = await supabase
        .from('registered_vehicles')
        .select('*')
        .in('mobile_number', [phone, formatted])
        .maybeSingle()

      if (lookupErr && lookupErr.code !== 'PGRST116') throw lookupErr
      
      if (!existingDriver) {
        throw new Error("This phone number is not registered. Please ask an admin to add you first at /admin/drivers")
      }

      // Pre-fill profile state from the admin data so they don't have to retype it
      setName(existingDriver.name || '')
      setVehicleNumber(existingDriver.vehicle_number || '')
      setVehicleType(existingDriver.vehicle_type || 'Auto')

      // 2. Proceed with OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone: formatted })
      if (otpError) throw otpError
      setStep(STEPS.OTP)
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Check your phone number.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const formatted = formatPhone(phone)
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: formatted,
        token: otp,
        type: 'sms',
      })
      if (verifyError) throw verifyError

      // Check if driver profile exists
      const { data: profile } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profile) {
        navigate('/driver-dashboard')
      } else {
        setStep(STEPS.PROFILE)
      }
    } catch (err) {
      setError(err.message || 'Invalid OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProfile = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Session expired. Please restart.')

      const { error: insertError } = await supabase.from('drivers').insert([{
        id: user.id,
        name: name.trim(),
        mobile_number: formatPhone(phone),
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        vehicle_type: vehicleType,
        status: 'available'
      }])

      if (insertError) throw insertError
      navigate('/driver-dashboard')
    } catch (err) {
      setError(err.message || 'Failed to create profile.')
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    maxWidth: '420px',
    margin: '0 auto',
    width: '100%'
  }

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
      <div style={cardStyle}>
        {/* Back button */}
        <button
          onClick={() => step === STEPS.PHONE ? navigate('/login') : setStep(step === STEPS.OTP ? STEPS.PHONE : STEPS.OTP)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem', padding: 0 }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <Car size={36} color="#22c55e" />
          </div>
          <h2 style={{ margin: '0 0 0.5rem' }}>
            {step === STEPS.PHONE && 'Driver Sign In'}
            {step === STEPS.OTP && 'Verify OTP'}
            {step === STEPS.PROFILE && 'Set Up Your Profile'}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
            {step === STEPS.PHONE && 'Enter your phone number to receive a one-time password'}
            {step === STEPS.OTP && `We sent an OTP to ${formatPhone(phone)}`}
            {step === STEPS.PROFILE && 'Almost there! Complete your driver profile to start receiving rides.'}
          </p>
        </div>

        {error && (
          <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div className="glass-card">
          {/* Step 1: Phone */}
          {step === STEPS.PHONE && (
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Phone Number
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    required
                    type="tel"
                    className="input-field"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  Indian mobile number. Country code +91 will be added automatically.
                </p>
              </div>
              <button type="submit" className="btn" disabled={loading} style={{ background: '#22c55e' }}>
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === STEPS.OTP && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Enter 6-digit OTP
                </label>
                <div style={{ position: 'relative' }}>
                  <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="input-field"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    style={{ paddingLeft: '38px', letterSpacing: '0.3rem', textAlign: 'center', fontSize: '1.2rem' }}
                  />
                </div>
              </div>
              <button type="submit" className="btn" disabled={loading || otp.length < 6} style={{ background: '#22c55e' }}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <button
                type="button"
                onClick={() => { setStep(STEPS.PHONE); setOtp('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecorationLine: 'underline', fontSize: '0.85rem' }}
              >
                Resend / Change number
              </button>
            </form>
          )}

          {/* Step 3: Profile Setup */}
          {step === STEPS.PROFILE && (
            <form onSubmit={handleCreateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Your Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Vehicle Number
                </label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={vehicleNumber}
                  onChange={e => setVehicleNumber(e.target.value)}
                  placeholder="e.g. PB12AB1234"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Vehicle Type
                </label>
                <select
                  className="input-field"
                  value={vehicleType}
                  onChange={e => setVehicleType(e.target.value)}
                >
                  <option value="Auto">Auto Rickshaw</option>
                  <option value="Cab">Cab / Car</option>
                </select>
              </div>
              <button type="submit" className="btn" disabled={loading} style={{ background: '#22c55e' }}>
                {loading ? 'Creating Profile...' : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} /> Complete Setup & Continue
                  </span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
