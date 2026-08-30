import { createClient } from '@/lib/supabase/server'
import { BedDouble, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import type { RoomOccupancy } from '@/types'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const statusLabel: Record<string, string> = {
  vago: 'Vago',
  ocupado: 'Ocupado',
  limpeza: 'Limpeza',
  manutencao: 'Manutenção',
}

export default async function DashboardPage() {
  const supabase = createClient()

  // Ocupação actual via a vista criada no Supabase
  const { data: rooms } = await supabase
    .from('v_room_occupancy')
    .select('*')
    .returns<RoomOccupancy[]>()

  // Resumo do dia anterior (o mais recente disponível)
  const { data: summary } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('property_id', PROPERTY_ID)
    .order('summary_date', { ascending: false })
    .limit(1)
    .single()

  const total = rooms?.length ?? 0
  const ocupados = rooms?.filter(r => r.room_status === 'ocupado').length ?? 0
  const vagos = rooms?.filter(r => r.room_status === 'vago').length ?? 0
  const limpeza = rooms?.filter(r => r.room_status === 'limpeza').length ?? 0
  const manutencao = rooms?.filter(r => r.room_status === 'manutencao').length ?? 0
  const ocupacao = total > 0 ? Math.round((ocupados / total) * 100) : 0

  const today = new Date().toLocaleDateString('pt-AO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted capitalize">{today}</p>
      </div>

      {/* Estatísticas de ocupação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-brand-500">{ocupacao}%</div>
          <div className="text-xs text-ink-muted mt-0.5">Taxa de ocupação</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-500">{ocupados}</div>
          <div className="text-xs text-ink-muted mt-0.5">Quartos ocupados</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-500">{vagos}</div>
          <div className="text-xs text-ink-muted mt-0.5">Quartos vagos</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-yellow-500">{limpeza + manutencao}</div>
          <div className="text-xs text-ink-muted mt-0.5">Em limpeza / manutenção</div>
        </div>
      </div>

      {/* Resumo financeiro do dia anterior */}
      {summary && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <TrendingUp size={15} className="text-brand-500" />
              Resumo — {new Date(summary.summary_date).toLocaleDateString('pt-AO')}
            </h2>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              summary.status === 'enviado' ? 'bg-green-100 text-green-700' :
              summary.status === 'revisto' ? 'bg-blue-100 text-blue-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-ink-light text-xs">Alojamento</p>
              <p className="font-semibold">{summary.total_revenue_rooms.toLocaleString('pt-AO')} Kz</p>
            </div>
            <div>
              <p className="text-ink-light text-xs">Lavandaria</p>
              <p className="font-semibold">{summary.total_revenue_laundry.toLocaleString('pt-AO')} Kz</p>
            </div>
            <div>
              <p className="text-ink-light text-xs">Restaurante</p>
              <p className="font-semibold">{summary.total_revenue_restaurant.toLocaleString('pt-AO')} Kz</p>
            </div>
            <div>
              <p className="text-ink-light text-xs font-medium">Total geral</p>
              <p className="font-bold text-brand-500">{summary.total_revenue_overall.toLocaleString('pt-AO')} Kz</p>
            </div>
          </div>
          <div className="text-xs text-ink-light border-t border-surface-border pt-2">
            {summary.total_checkins} check-in(s) · {summary.total_checkouts} check-out(s)
          </div>
        </div>
      )}

      {/* Grelha de quartos */}
      <div className="card">
        <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          <BedDouble size={15} className="text-brand-500" />
          Mapa de quartos
        </h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {rooms?.sort((a, b) => Number(a.room_number) - Number(b.room_number))
            .map(room => (
              <div
                key={room.room_number}
                title={`${room.room_type}${room.guest_name ? ` — ${room.guest_name}` : ''}`}
                className={`rounded p-2 text-center cursor-default select-none border transition-colors ${
                  room.room_status === 'vago'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : room.room_status === 'ocupado'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : room.room_status === 'limpeza'
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}
              >
                <div className="text-sm font-bold">{room.room_number}</div>
                <div className="text-xs truncate">{statusLabel[room.room_status]}</div>
              </div>
            ))}
        </div>
        {/* Legenda */}
        <div className="flex flex-wrap gap-3 mt-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-400 inline-block"/> Vago</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block"/> Ocupado</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400 inline-block"/> Limpeza</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-400 inline-block"/> Manutenção</span>
        </div>
      </div>
    </div>
  )
}
