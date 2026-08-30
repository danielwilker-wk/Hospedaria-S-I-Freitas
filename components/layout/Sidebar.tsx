'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  LogIn,
  BedDouble,
  Coffee,
  WashingMachine,
  FileText,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import clsx from 'clsx'

const nav = [
  { href: '/dashboard',      label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/quartos',        label: 'Mapa de Quartos',  icon: BedDouble },
  { href: '/check-in',       label: 'Check-in',         icon: LogIn },
  { href: '/pequeno-almoco', label: 'Pequeno-Almoço',   icon: Coffee },
  { href: '/lavandaria',     label: 'Lavandaria',       icon: WashingMachine },
  { href: '/relatorio',      label: 'Relatório Diário', icon: FileText },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-surface border-r border-surface-border">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-surface-border">
        {/* Ícone laranja */}
        <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            {/* Seta estilizada baseada no logo */}
            <path d="M11 2 L18 9 H14.5 V13.5 C14.5 16.5 12.5 18 10.5 18 C7 18 5 15.5 5 12.5 C5 9 7.5 7 10.5 7 V2 Z"
              fill="white" opacity="0.9"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink leading-tight truncate">S&I Freitas</p>
          <p className="text-[10px] text-ink-light leading-tight truncate">Gestão Hoteleira</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors duration-100',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-brand-50 text-brand-500'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Rodapé — logout */}
      <div className="px-2 py-3 border-t border-surface-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm font-medium text-ink-muted hover:bg-red-50 hover:text-red-600 transition-colors duration-100"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Terminar sessão
        </button>
      </div>
    </aside>
  )
}
