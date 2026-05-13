import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED = ['/helpdesk', '/portal']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED.some(p => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  // El token viene en cookie o en header — aquí solo chequeamos cookie
  // La validación real la hace cada page.tsx contra la API
  // El middleware solo bloquea acceso sin cookie de sesión
  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/helpdesk/:path*', '/portal/:path*'],
}
