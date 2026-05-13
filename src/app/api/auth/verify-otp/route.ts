import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json()
    if (!email || !code) return NextResponse.json({ ok: false, error: 'Faltan campos' }, { status: 400 })
    const session = await verifyOtp(email, code)
    return NextResponse.json({ ok: true, ...session })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 401 })
  }
}
