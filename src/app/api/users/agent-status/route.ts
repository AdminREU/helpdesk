import { NextResponse } from 'next/server'
import { validateToken, getToken } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    await validateToken(getToken(req))
    const { data } = await supabase.from('users').select('email, nombre, agent_status').in('rol', ['HELPDESK','ADMIN']).eq('estado','ACTIVO')
    return NextResponse.json({ ok: true, agents: data ?? [] })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 401 }) }
}

export async function PATCH(req: Request) {
  try {
    const { email } = await validateToken(getToken(req))
    const { status } = await req.json()
    await supabase.from('users').update({ agent_status: status }).eq('email', email)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }) }
}
