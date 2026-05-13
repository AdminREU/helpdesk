import { NextResponse } from 'next/server'
import { validateToken, getToken } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { email, rol } = await validateToken(getToken(req))
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single()
    return NextResponse.json({ ok: true, user, rol })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 401 }) }
}

export async function PATCH(req: Request) {
  try {
    const { email } = await validateToken(getToken(req))
    const { nombre } = await req.json()
    await supabase.from('users').update({ nombre }).eq('email', email)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }) }
}
