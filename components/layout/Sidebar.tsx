'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  BedDouble,
  ClipboardList,
  UserSearch,
  LogIn,
  LogOut as LogOutIcon,
  UtensilsCrossed,
  Wine,
  Package,
  Sparkles,
  Wrench,
  FileText,
  Archive,
  BarChart3,
  Users,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import clsx from 'clsx'

type LeafItem = { href: string; label: string; icon: any }
type GroupItem = { label: string; icon: any; basePath: string; children: LeafItem[] }
type NavItem = LeafItem | GroupItem

function isGroup(item: NavItem): item is GroupItem {
  return 'children' in item
}

const nav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quartos', label: 'Mapa de Quartos', icon: BedDouble },
  {
    label: 'Receção',
    icon: ClipboardList,
    basePath: '/recepcao',
    children: [
      { href: '/recepcao/hospedes', label: 'Hóspedes', icon: UserSearch },
      { href: '/recepcao/checkin', label: 'Check-in', icon: LogIn },
      { href: '/recepcao/checkout', label: 'Check-out', icon: LogOutIcon },
    ],
  },
  {
    label: 'Sala de Refeições',
    icon: UtensilsCrossed,
    basePath: '/sala-refeicoes',
    children: [
      { href: '/sala-refeicoes/menu', label: 'Gerir Menu', icon: UtensilsCrossed },
      { href: '/sala-refeicoes/restaurante', label: 'Restaurante', icon: UtensilsCrossed },
      { href: '/sala-refeicoes/bar', label: 'Bar', icon: Wine },
      { href: '/sala-refeicoes/bar/stock', label: 'Stock do Bar', icon: Package },
      { href: '/frigobar/produtos', label: 'Frigobar', icon: Package },
      { href: '/funcionarios', label: 'Funcionários', icon: Users },
    ],
  },
  { href: '/limpeza', label: 'Limpeza', icon: Sparkles },
  { href: '/manutencao', label: 'Manutenção', icon: Wrench },
  { href: '/relatorio', label: 'Relatório Diário', icon: FileText },
  { href: '/relatorio-mensal', label: 'Relatório Mensal', icon: BarChart3 },
  { href: '/arquivo-checkout', label: 'Arquivo Check-out', icon: Archive },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    nav.forEach(item => {
      if (isGroup(item)) initial[item.label] = pathname.startsWith(item.basePath)
    })
    return initial
  })

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-surface border-r border-surface-border">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-surface-border">
        <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
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
        {nav.map(item => {
          if (isGroup(item)) {
            const open = openGroups[item.label]
            const groupActive = pathname.startsWith(item.basePath)
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors duration-100',
                    groupActive
                      ? 'text-brand-500'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  )}
                >
                  <item.icon size={15} strokeWidth={1.75} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    size={13}
                    className={clsx('transition-transform duration-150', open && 'rotate-180')}
                  />
                </button>
                {open && (
                  <div className="ml-3 pl-3 border-l border-surface-border space-y-0.5 mt-0.5 mb-1">
                    {item.children.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={clsx(
                          'flex items-center gap-2.5 px-3 py-1.5 rounded text-sm font-medium transition-colors duration-100',
                          isActive(child.href)
                            ? 'bg-brand-50 text-brand-500'
                            : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                        )}
                      >
                        <child.icon size={14} strokeWidth={1.75} />
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors duration-100',
                isActive(item.href)
                  ? 'bg-brand-50 text-brand-500'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              )}
            >
              <item.icon size={15} strokeWidth={1.75} />
              {item.label}
            </Link>
          )
        })}
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
