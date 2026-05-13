'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'email' | 'code' | 'loading'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [dark, setDark] = useState(false)

  const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'Helpdesk'

  useEffect(() => {
    setDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    const stored = localStorage.getItem('hd_token') ?? document.cookie.match(/auth_token=([^;]+)/)?.[1]
    if (stored) {
      fetch('/api/auth/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stored }) })
        .then(r => r.json()).then(d => {
          if (d.ok) router.replace(d.rol === 'USUARIO' ? '/portal' : '/helpdesk')
        }).catch(() => {})
    }
  }, [router])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/auth/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setStep('code')
      setCountdown(60)
    } catch (err: any) {
      setError(err.message ?? 'Error al enviar el código')
    } finally { setSending(false) }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      localStorage.setItem('hd_token', d.token)
      document.cookie = `auth_token=${d.token}; path=/; max-age=${8 * 3600}`
      setStep('loading')
      router.replace(d.rol === 'USUARIO' ? '/portal' : '/helpdesk')
    } catch (err: any) {
      setError(err.message ?? 'Código incorrecto')
    } finally { setSending(false) }
  }

  const bg = dark ? '#0f172a' : '#f7f6f3'
  const surface = dark ? '#1e293b' : '#ffffff'
  const text = dark ? '#f1f5f9' : '#191919'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? '#334155' : '#e5e4e0'
  const inputBg = dark ? '#0f172a' : '#f7f6f3'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: '15px', borderRadius: '8px',
    border: `1px solid ${border}`, background: inputBg, color: text,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    letterSpacing: step === 'code' ? '6px' : 'normal',
    textAlign: step === 'code' ? 'center' : 'left',
  }

  const primaryBtn = !sending ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : (dark ? '#334155' : '#e5e4e0')
  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600, borderRadius: '8px',
    border: 'none', cursor: sending ? 'not-allowed' : 'pointer', marginTop: '8px',
    background: primaryBtn, color: sending ? muted : '#fff', transition: 'all .2s',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: '24px' }}>
      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: '18px', padding: '40px 36px', maxWidth: '400px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.12)' }}>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: text, margin: '0 0 4px' }}>{APP}</h1>
          <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
            {step === 'email' && 'Ingresa tu correo para recibir un código de acceso'}
            {step === 'code' && `Código enviado a ${email}`}
            {step === 'loading' && 'Iniciando sesión...'}
          </p>
        </div>

        {step === 'email' && (
          <form onSubmit={sendOtp}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Correo electrónico</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@empresa.com" required autoFocus style={inputStyle}
            />
            {error && <p style={{ fontSize: '13px', color: '#ef4444', margin: '8px 0 0' }}>{error}</p>}
            <button type="submit" disabled={sending} style={btnStyle}>
              {sending ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Código de 6 dígitos</label>
            <input
              type="text" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" maxLength={6} required autoFocus inputMode="numeric"
              style={inputStyle}
            />
            {error && <p style={{ fontSize: '13px', color: '#ef4444', margin: '8px 0 0' }}>{error}</p>}
            <button type="submit" disabled={sending || code.length < 6} style={{
              ...btnStyle,
              background: (sending || code.length < 6) ? (dark ? '#334155' : '#e5e4e0') : 'linear-gradient(135deg,#3b82f6,#6366f1)',
              color: (sending || code.length < 6) ? muted : '#fff',
              cursor: (sending || code.length < 6) ? 'not-allowed' : 'pointer',
            }}>
              {sending ? 'Verificando...' : 'Ingresar'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              {countdown > 0
                ? <span style={{ fontSize: '13px', color: muted }}>Reenviar en {countdown}s</span>
                : <button type="button" onClick={() => { setStep('email'); setCode(''); setError('') }}
                    style={{ fontSize: '13px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Cambiar correo o reenviar
                  </button>
              }
            </div>
          </form>
        )}

        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: '32px', height: '32px', border: `3px solid ${border}`, borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </div>
    </div>
  )
}
