'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, Plus, CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const SOURCE_LABELS: Record<string, string> = {
  telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail',
  booking_com: 'Booking.com', presencial: 'Presencial',
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-100 text-yellow-700' },
  confirmada: { label: 'Confirmada', color: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',  color: 'bg-red-100 text-red-700' },
  concluida:  { label: 'Concluída',  color: 'bg-gray-100 text-gray-600' },
}

export default function ReservasPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'confirmada'>('pendente')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }

      const { data } = await supabase
        .from('reservations')
        .select(`
          *, 
          rooms(number, room_types(name)),
          guests(full_name, surname, phone)
        `)
        .eq('property_id', PROPERTY_ID)
        .order('check_in_planned', { ascending: true })

      setReservations(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = reservations.filter(r =>
    filter === 'todas' ? true : r.status === filter
  )

  const counts = {
    pendente: reservations.filter(r => r.status === 'pendente').length,
    confirmada: reservations.filter(r => r.status === 'confirmada').length,
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <CalendarDays size={20} className="text-brand-500" /> Reservas de Quartos
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {counts.pendente} pendente(s) · {counts.confirmada} confirmada(s)
          </p>
        </div>
        <Link href="/recepcao/reservas/nova" className="btn-primary flex items-center gap-1.5">
          <Plus size={15}/> Nova reserva
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['pendente', 'confirmada', 'todas'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted hover:text-ink'
            }`}>
            {f === 'todas' ? 'Todas' : STATUS_CONFIG[f].label}
            {f !== 'todas' && counts[f] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                filter === f ? 'bg-white/20' : 'bg-surface-border'
              }`}>{counts[f]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-ink-muted">
          <CalendarDays size={32} className="mx-auto mb-2 opacity-30"/>
          <p>Sem reservas {filter !== 'todas' ? STATUS_CONFIG[filter]?.label.toLowerCase() + 's' : ''}.</p>
          <Link href="/recepcao/reservas/nova" className="btn-primary inline-flex items-center gap-1.5 mt-4 text-sm">
            <Plus size={14}/> Criar primeira reserva
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const cfg = STATUS_CONFIG[r.status]
            const isToday = r.check_in_planned === new Date().toISOString().split('T')[0]
            return (
              <Link key={r.id} href={`/recepcao/reservas/${r.id}`}
                className={`card flex items-center justify-between hover:border-brand-300 hover:shadow-md transition-all group ${isToday ? 'border-brand-300 bg-brand-50/30' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                    r.status === 'confirmada' ? 'bg-green-100 text-green-700' :
                    r.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {r.rooms?.number ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">
                      {r.guests?.full_name} {r.guests?.surname}
                      {isToday && <span className="ml-2 text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded">Hoje</span>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {r.rooms?.room_types?.name ?? 'Quarto a definir'} ·
                      Check-in: {new Date(r.check_in_planned + 'T00:00:00').toLocaleDateString('pt-AO')} →
                      {new Date(r.check_out_planned + 'T00:00:00').toLocaleDateString('pt-AO')} ·
                      {SOURCE_LABELS[r.source]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                  <ChevronRight size={15} className="text-ink-light group-hover:text-brand-500 transition-colors"/>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
