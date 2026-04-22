import React, { useState, useEffect } from 'react'
import { IndianRupee, QrCode, Copy, Check, ShieldCheck, Users, Smartphone, Monitor } from 'lucide-react'

// ── UPI App configs ─────────────────────────────────────────────────────────
const UPI_APPS = [
  {
    id: 'gpay',
    name: 'Google Pay',
    short: 'GPay',
    pkg: 'com.google.android.apps.nbu.paisa.user',
    color: '#4285F4',
    bg: 'rgba(66,133,244,0.1)',
    border: 'rgba(66,133,244,0.3)',
    logo: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.4-.1-2.7-.5-4z" fill="#FFC107"/>
        <path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 11.7z" fill="#FF3D00"/>
        <path d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 35.9 27 37 24 37c-6.1 0-11.2-4-13-9.4l-7 5.4C7.7 40.6 15.3 45 24 45z" fill="#4CAF50"/>
        <path d="M44.5 20H24v8.5h11.8c-.9 2.7-2.7 5-5.2 6.5l6.6 5.6C41.1 37.4 44.5 31.4 44.5 24c0-1.4-.1-2.7-.5-4z" fill="#1976D2"/>
      </svg>
    ),
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    short: 'PhonePe',
    pkg: 'com.phonepe.app',
    color: '#5f259f',
    bg: 'rgba(95,37,159,0.1)',
    border: 'rgba(95,37,159,0.3)',
    logo: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="10" fill="#5f259f"/>
        <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">Pe</text>
      </svg>
    ),
  },
  {
    id: 'paytm',
    name: 'Paytm',
    short: 'Paytm',
    pkg: 'net.one97.paytm',
    color: '#00BAF2',
    bg: 'rgba(0,186,242,0.1)',
    border: 'rgba(0,186,242,0.3)',
    logo: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="10" fill="#00BAF2"/>
        <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">PAY</text>
      </svg>
    ),
  },
  {
    id: 'generic',
    name: 'Other UPI App',
    short: 'UPI',
    pkg: null,
    color: '#248A52',
    bg: 'rgba(36,138,82,0.1)',
    border: 'rgba(36,138,82,0.3)',
    logo: (
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'linear-gradient(135deg,#248A52,#257287)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: '10px', fontWeight: '800',
      }}>UPI</div>
    ),
  },
]

/**
 * PaymentPanel
 *
 * Props:
 *   driver       — { name, mobile_number, upi_id }
 *   totalFare    — number  (full ride price ₹)
 *   riderCount   — number  (confirmed riders including publisher)
 */
export default function PaymentPanel({ driver, totalFare, riderCount }) {
  const [copied, setCopied] = useState(false)
  const [qrError, setQrError] = useState(false)
  const [toast, setToast] = useState(null)   // { msg, timeout }
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile on mount
  useEffect(() => {
    const check = () => setIsMobile(
      /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)
    )
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!driver || !totalFare) return null

  // ── Resolve UPI ID ─────────────────────────────────────────────────────────
  let upiId = driver.upi_id?.trim() || null
  if (!upiId && driver.mobile_number) {
    const rawDigits = String(driver.mobile_number).replace(/\D/g, '')
    const phone10   = rawDigits.startsWith('91') && rawDigits.length === 12
      ? rawDigits.slice(2) : rawDigits
    upiId = `${phone10}@upi`
  }
  if (!upiId) return null

  // ── Fare split ─────────────────────────────────────────────────────────────
  const confirmedRiders = Math.max(1, riderCount || 1)
  const perPerson       = Math.ceil((totalFare / confirmedRiders) * 100) / 100  // round up to 2dp

  // ── Build link factory ─────────────────────────────────────────────────────
  const encodedName = encodeURIComponent(driver.name || 'Driver')
  const encodedNote = encodeURIComponent('CampusRides Fare')

  const baseParams  = `pa=${encodeURIComponent(upiId)}&pn=${encodedName}&am=${perPerson}&cu=INR&tn=${encodedNote}`
  const genericLink = `upi://pay?${baseParams}`
  const intentLink  = (pkg) =>
    `intent://pay?${baseParams}#Intent;scheme=upi;package=${pkg};end`

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=14&data=${encodeURIComponent(genericLink)}`

  // ── Copy ───────────────────────────────────────────────────────────────────
  const copyUPI = async () => {
    try { await navigator.clipboard.writeText(upiId) }
    catch {
      const el = document.createElement('input')
      el.value = upiId
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── App payment handler ────────────────────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const payWith = (app) => {
    const link = app.pkg ? intentLink(app.pkg) : genericLink
    window.location.href = link
    // After 2.2s, if still here, show fallback hint
    setTimeout(() => {
      showToast(`If ${app.name} didn't open, scan the QR code below or copy the UPI ID.`)
    }, 2200)
  }

  // ── Separator ─────────────────────────────────────────────────────────────
  const Sep = () => (
    <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />
  )

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden', maxWidth: '420px', margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
        padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
      }}>
        <IndianRupee size={18} color="rgba(255,255,255,0.9)" />
        <span style={{ color: 'white', fontWeight: '700', fontSize: '1rem' }}>Pay Driver</span>
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem',
          background: 'rgba(255,255,255,0.2)', borderRadius: '999px',
          padding: '0.2rem 0.6rem', fontSize: '0.7rem', color: 'white', fontWeight: '600',
        }}>
          <ShieldCheck size={11} /> No platform fees
        </div>
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── Driver + amount ──────────────────────────────────────────── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
            {driver.name || 'Driver'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Pay your share of the ride fare
          </div>

          {/* Fare breakdown */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: '0.5rem', marginBottom: '1rem',
          }}>
            {[
              { label: 'TOTAL FARE', val: `₹${totalFare}` },
              { label: 'RIDERS', val: confirmedRiders, icon: <Users size={9} style={{ marginRight: 2 }} /> },
              { label: 'YOUR SHARE', val: `₹${perPerson}`, highlight: true },
            ].map(({ label, val, icon, highlight }) => (
              <div key={label} style={{
                background: highlight ? 'rgba(36,138,82,0.1)' : 'rgba(36,138,82,0.05)',
                border: `1px solid ${highlight ? 'rgba(36,138,82,0.25)' : 'rgba(36,138,82,0.12)'}`,
                borderRadius: '10px', padding: '0.55rem 0.3rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.62rem', color: highlight ? 'var(--primary)' : 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon}{label}
                </div>
                <div style={{ fontWeight: '800', fontSize: highlight ? '1.05rem' : '0.95rem', color: highlight ? 'var(--primary)' : 'var(--text-main)' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Amount hero */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.15rem', color: 'var(--primary)' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: '700' }}>₹</span>
            <span style={{ fontSize: '3rem', fontWeight: '900', lineHeight: 1, letterSpacing: '-0.04em' }}>{perPerson}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.2rem', alignSelf: 'flex-end', paddingBottom: '0.3rem' }}>your share</span>
          </div>
        </div>

        <Sep />

        {/* ── UPI App Buttons ──────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Smartphone size={13} /> CHOOSE PAYMENT APP
          </div>

          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '8px', padding: '0.6rem 0.8rem', marginBottom: '0.75rem',
              fontSize: '0.8rem', color: '#b45309',
            }}>
              <Monitor size={14} />
              Scan the QR below using your phone — app buttons work on mobile only
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {UPI_APPS.map(app => (
              <button
                key={app.id}
                onClick={() => payWith(app)}
                disabled={!isMobile}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.8rem 1rem',
                  background: isMobile ? app.bg : 'rgba(0,0,0,0.03)',
                  border: `1.5px solid ${isMobile ? app.border : 'var(--border)'}`,
                  borderRadius: '12px',
                  cursor: isMobile ? 'pointer' : 'not-allowed',
                  opacity: isMobile ? 1 : 0.5,
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (isMobile) e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = '' }}
              >
                <div style={{ flexShrink: 0 }}>{app.logo}</div>
                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: isMobile ? app.color : 'var(--text-muted)', flex: 1 }}>
                  Pay with {app.name}
                </span>
                <span style={{ fontSize: '1rem', opacity: 0.5 }}>→</span>
              </button>
            ))}
          </div>
        </div>

        <Sep />

        {/* ── QR Code ──────────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <QrCode size={13} /> QR CODE FALLBACK
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              background: 'white', borderRadius: '16px', padding: '10px',
              boxShadow: '0 2px 14px rgba(36,138,82,0.12)',
              border: '1px solid var(--border)', display: 'inline-block',
            }}>
              {qrError ? (
                <div style={{
                  width: '240px', height: '240px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem',
                }}>
                  <QrCode size={44} style={{ opacity: 0.25 }} />
                  <span>QR unavailable</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Use UPI ID below</span>
                </div>
              ) : (
                <img
                  src={qrUrl}
                  alt="Scan to pay via UPI"
                  width={240} height={240}
                  style={{ display: 'block', borderRadius: '8px' }}
                  onError={() => setQrError(true)}
                />
              )}
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
            Open any UPI app → Scan &amp; Pay ₹{perPerson}
          </p>
        </div>

        <Sep />

        {/* ── UPI ID + Copy ─────────────────────────────────────────────── */}
        <div style={{
          background: 'rgba(36,138,82,0.06)', border: '1px solid rgba(36,138,82,0.18)',
          borderRadius: '10px', padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>
              UPI ID
            </div>
            <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-main)', fontFamily: 'monospace', userSelect: 'all', wordBreak: 'break-all' }}>
              {upiId}
            </div>
          </div>
          <button
            onClick={copyUPI}
            style={{
              flexShrink: 0,
              background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(36,138,82,0.08)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(36,138,82,0.2)'}`,
              borderRadius: '8px', padding: '0.45rem 0.75rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
              color: copied ? '#22c55e' : 'var(--primary)',
              fontSize: '0.82rem', fontWeight: '600', transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy ID'}
          </button>
        </div>

        {/* ── Footer note ───────────────────────────────────────────────── */}
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, opacity: 0.75 }}>
          Pay directly to driver using your preferred UPI app
          <br />After payment, you can safely close this screen.
        </p>

      </div>

      {/* ── Toast notification ─────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: 'white',
          padding: '0.75rem 1.25rem', borderRadius: '12px',
          fontSize: '0.85rem', maxWidth: '320px', textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 9999, lineHeight: 1.5,
          animation: 'slideUp 0.25s ease',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
