import React, { useState } from 'react'
import { Phone, IndianRupee, QrCode, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react'

/**
 * PaymentPanel
 *
 * Props:
 *   driver  — { name, phone }   (phone = raw number, e.g. "9876543210" or "+919876543210")
 *   fare    — number             (total fare in ₹)
 *   perPerson — number (optional, shown separately when carpooling)
 */
export default function PaymentPanel({ driver, fare, perPerson }) {
  const [copied, setCopied] = useState(false)
  const [qrError, setQrError] = useState(false)

  if (!driver?.phone || !fare) return null

  // Normalise phone: strip leading +91 / 91 prefix, keep 10 digits
  const rawDigits = String(driver.phone).replace(/\D/g, '')
  const phone10   = rawDigits.startsWith('91') && rawDigits.length === 12
    ? rawDigits.slice(2)
    : rawDigits

  const upiId   = `${phone10}@upi`
  const amount  = perPerson ?? fare
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(driver.name || 'Driver')}&am=${amount}&cu=INR&tn=${encodeURIComponent('CampusRides Fare')}`
  const qrUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(upiLink)}`

  const copyUPI = async () => {
    try {
      await navigator.clipboard.writeText(upiId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that block clipboard without interaction
      const el = document.createElement('input')
      el.value = upiId
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header strip */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}>
        <IndianRupee size={18} color="rgba(255,255,255,0.9)" />
        <span style={{ color: 'white', fontWeight: '700', fontSize: '1rem', letterSpacing: '-0.01em' }}>
          Pay Driver
        </span>
        <div style={{
          marginLeft: 'auto',
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '999px',
          padding: '0.2rem 0.6rem',
          fontSize: '0.72rem',
          color: 'white',
          fontWeight: '600',
        }}>
          <ShieldCheck size={12} /> No platform fees
        </div>
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>

        {/* Driver info */}
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            {driver.name || 'Driver'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            <Phone size={13} />
            {phone10}
          </div>
        </div>

        {/* Amount */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: '0.2rem',
          color: 'var(--primary)',
        }}>
          <span style={{ fontSize: '1.4rem', fontWeight: '700' }}>₹</span>
          <span style={{ fontSize: '2.8rem', fontWeight: '800', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {amount}
          </span>
          {perPerson && perPerson !== fare && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
              your share
            </span>
          )}
        </div>

        {/* QR Code */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '10px',
          boxShadow: '0 2px 12px rgba(36,138,82,0.12)',
          border: '1px solid var(--border)',
        }}>
          {qrError ? (
            <div style={{
              width: '220px', height: '220px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem',
            }}>
              <QrCode size={40} style={{ opacity: 0.3 }} />
              <span>QR unavailable</span>
              <span style={{ fontSize: '0.75rem' }}>Use UPI ID below</span>
            </div>
          ) : (
            <img
              src={qrUrl}
              alt="UPI QR Code"
              width={220}
              height={220}
              style={{ display: 'block', borderRadius: '8px' }}
              onError={() => setQrError(true)}
            />
          )}
        </div>

        {/* UPI ID */}
        <div style={{
          width: '100%',
          background: 'rgba(36,138,82,0.07)',
          border: '1px solid rgba(36,138,82,0.2)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>
              UPI ID
            </div>
            <div style={{
              fontWeight: '700',
              fontSize: '0.95rem',
              color: 'var(--text-main)',
              fontFamily: 'monospace',
              userSelect: 'all',
            }}>
              {upiId}
            </div>
          </div>
          <button
            onClick={copyUPI}
            title="Copy UPI ID"
            style={{
              background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(36,138,82,0.08)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(36,138,82,0.2)'}`,
              borderRadius: '8px',
              padding: '0.45rem 0.7rem',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              color: copied ? '#22c55e' : 'var(--primary)',
              fontSize: '0.82rem', fontWeight: '600',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Primary CTA */}
        <a
          href={upiLink}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.85rem',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            color: 'white',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '1rem',
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(36,138,82,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(36,138,82,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(36,138,82,0.3)' }}
        >
          <ExternalLink size={16} />
          Pay ₹{amount} via UPI App
        </a>

        {/* Hint text */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Scan the QR or tap the button to pay in your UPI app
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, opacity: 0.7 }}>
            After payment, you can safely close this screen
          </p>
        </div>

      </div>
    </div>
  )
}
