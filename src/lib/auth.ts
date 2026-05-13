import { supabase } from './supabase'
import { randomInt } from 'crypto'

const OTP_TTL_MIN = 30
const SESSION_TTL_MIN = 480
const OTP_RATE_LIMIT = 6

export async function createOtp(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('otp_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', normalized)
    .gte('created_at', oneHourAgo)

  if ((count ?? 0) >= OTP_RATE_LIMIT)
    throw new Error('Demasiados intentos. Espera 30 minutos.')

  await supabase.from('otp_codes').delete().eq('email', normalized)

  const code = String(randomInt(100000, 999999))
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString()

  await supabase.from('otp_codes').insert({ email: normalized, code, expires_at: expiresAt, attempts: 0 })
  return code
}

export async function verifyOtp(email: string, code: string) {
  const normalized = email.toLowerCase().trim()

  const { data: otp } = await supabase
    .from('otp_codes').select('*').eq('email', normalized)
    .order('created_at', { ascending: false }).limit(1).single()

  if (!otp) throw new Error('Código no encontrado')
  if (new Date(otp.expires_at) < new Date()) throw new Error('Código expirado')
  if (String(otp.code).trim() !== String(code).trim()) {
    await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id)
    throw new Error('Código incorrecto')
  }

  await supabase.from('otp_codes').delete().eq('email', normalized)
  return createSession(normalized)
}

export async function createSession(email: string) {
  let { data: user } = await supabase.from('users').select('*').eq('email', email).single()

  if (!user) {
    const { data: newUser } = await supabase.from('users')
      .insert({ email, rol: 'USUARIO', estado: 'ACTIVO' }).select().single()
    user = newUser
  }

  if (!user) throw new Error('Error al crear usuario')
  if (user.estado === 'INACTIVO') throw new Error('Usuario inactivo. Contacta al administrador.')

  await supabase.from('users').update({
    ultimo_acceso: new Date().toISOString(),
    login_count: (user.login_count ?? 0) + 1
  }).eq('email', email)

  const token = `${crypto.randomUUID()}-${Date.now()}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString()

  await supabase.from('sessions').insert({ token, email: user.email, rol: user.rol, expires_at: expiresAt })
  return { token, email: user.email, rol: user.rol }
}

export async function validateToken(token: string) {
  if (!token) throw new Error('Token requerido')

  const { data: session } = await supabase.from('sessions').select('*').eq('token', token).single()
  if (!session) throw new Error('Sesión inválida')
  if (new Date(session.expires_at) < new Date()) {
    await supabase.from('sessions').delete().eq('token', token)
    throw new Error('Sesión expirada')
  }

  const newExpiry = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString()
  await supabase.from('sessions').update({
    last_active: new Date().toISOString(),
    expires_at: newExpiry
  }).eq('token', token)

  return { email: session.email, rol: session.rol, token }
}

export function requireRoles(rol: string, allowed: string[]) {
  if (!allowed.includes(rol)) throw new Error('No tienes permisos para esta acción')
}

export function getToken(req: Request): string {
  return req.headers.get('authorization')?.replace('Bearer ', '') ?? ''
}
