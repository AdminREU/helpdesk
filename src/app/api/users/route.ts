import { NextResponse } from 'next/server'
import { validateToken, requireRoles, getToken } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { rol } = await validateToken(getToken(req))
    requireRoles(rol, ['HELPDESK','ADMIN'])
    const { searchParams } = new URL(req.url)
    let query = supabase.from('users').select('*').order('created_at', { ascending: false })
    if (searchParams.get('rol')) query = query.eq('rol', searchParams.get('rol')!)
    if (searchParams.get('estado')) query = query.eq('estado', searchParams.get('estado')!)
    const { data } = await query
    return NextResponse.json({ ok: true, users: data })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 401 }) }
}

export async function POST(req: Request) {
  try {
    const { rol } = await validateToken(getToken(req))
    requireRoles(rol, ['ADMIN'])
    const body = await req.json()
    const { data, error } = await supabase.from('users').insert({ email: body.email.toLowerCase().trim(), nombre: body.nombre, rol: body.rol ?? 'USUARIO', estado: 'ACTIVO' }).select().single()
    if (error) throw error
    return NextResponse.json({ ok: true, user: data })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }) }
}
