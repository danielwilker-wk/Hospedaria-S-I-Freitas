import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'S&I Freitas — Gestão Hoteleira',
  description: 'Sistema de gestão interna da Hospedaria S&I Freitas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  )
}
