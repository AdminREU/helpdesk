import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Helpdesk Ultralam',
  description: 'Sistema de soporte técnico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
