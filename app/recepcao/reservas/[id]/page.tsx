'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle, XCircle, LogIn, CalendarDays } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-100 text-yellow-700' },
  confirmada: { label: 'Confirmada', color: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',  color: 'bg-red-100 text-red-700' },
  concluida:  { label: 'Concluída',  color: 'bg-gray-100 text-gray-600' },
}

export default function ReservaDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [reservation, setReservation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [staffId, setStaffId] = useState('')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data } = await supabase
        .from('reservations')
        .select(`*, rooms(number, room_types(name, individual_price, duplo_price)), guests(*)`)
        .eq('id', id)
        .single()
      setReservation(data)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function updateStatus(status: string) {
    setUpdating(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', id)
      .select(`*, rooms(number, room_types(name, individual_price, duplo_price)), guests(*)`)
      .single()
    setReservation(data)
    setUpdating(false)
  }

  async function convertToCheckin() {
    // Navegar para o check-in com os dados da reserva pré-preenchidos
    router.push(`/recepcao/checkin?reservation_id=${id}`)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>
  if (!reservation) return <div className="text-center py-12 text-ink-muted">Reserva não encontrada.</div>

  const nights = Math.ceil(
    (new Date(reservation.check_out_planned).getTime() - new Date(reservation.check_in_planned).getTime()) / (1000 * 60 * 60 * 24)
  )
  const cfg = STATUS_CONFIG[reservation.status]
  const isToday = reservation.check_in_planned === new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/recepcao/reservas" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <CalendarDays size={18} className="text-brand-500"/>
            {reservation.guests?.full_name} {reservation.guests?.surname}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
            {isToday && <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded font-medium">Check-in hoje</span>}
          </div>
        </div>
      </div>

      {/* Detalhes da reserva */}
      <div className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Reserva</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Quarto</span>
            <span className="font-medium">{reservation.rooms ? `Nº ${reservation.rooms.number} — ${reservation.rooms.room_types?.name}` : 'A definir'}</span>
          </div>
          <div className="flex justify-between"><span className="text-ink-muted">Origem</span>
            <span className="font-medium capitalize">{reservation.source?.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between"><span className="text-ink-muted">Check-in</span>
            <span className="font-medium">{new Date(reservation.check_in_planned + 'T00:00:00').toLocaleDateString('pt-AO')}</span>
          </div>
          <div className="flex justify-between"><span className="text-ink-muted">Check-out</span>
            <span className="font-medium">{new Date(reservation.check_out_planned + 'T00:00:00').toLocaleDateString('pt-AO')}</span>
          </div>
          <div className="flex justify-between"><span className="text-ink-muted">Noites</span>
            <span className="font-medium">{nights}</span>
          </div>
          {reservation.rooms?.room_types?.individual_price && (
            <div className="flex justify-between"><span className="text-ink-muted">Valor estimado</span>
              <span className="font-semibold text-brand-500">
                {(Number(reservation.rooms.room_types.individual_price) * nights).toLocaleString('pt-AO')} Kz
              </span>
            </div>
          )}
        </div>
        {reservation.notes && (
          <div className="bg-surface-muted rounded-lg p-3 text-sm text-ink-muted">
            <span className="font-medium text-ink">Observações: </span>{reservation.notes}
          </div>
        )}
      </div>

      {/* Dados do hóspede */}
      {reservation.guests && (
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Hóspede</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {reservation.guests.phone && <div className="flex justify-between"><span className="text-ink-muted">Telemóvel</span><span>{reservation.guests.phone}</span></div>}
            {reservation.guests.email && <div className="flex justify-between"><span className="text-ink-muted">E-mail</span><span>{reservation.guests.email}</span></div>}
            {reservation.guests.document_number && <div className="flex justify-between"><span className="text-ink-muted">Documento</span><span>{reservation.guests.document_number}</span></div>}
            {reservation.guests.nationality && <div className="flex justify-between"><span className="text-ink-muted">Nacionalidade</span><span>{reservation.guests.nationality}</span></div>}
          </div>
        </div>
      )}

      {/* Acções */}
      {reservation.status !== 'cancelada' && reservation.status !== 'concluida' && (
        <div className="space-y-2">
          {reservation.status === 'confirmada' && (
            <button onClick={convertToCheckin} disabled={updating}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              <LogIn size={16}/> Converter em Check-in
            </button>
          )}
          {reservation.status === 'pendente' && (
            <button onClick={() => updateStatus('confirmada')} disabled={updating}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-green-500 hover:bg-green-600 text-white flex items-center justify-center gap-2 transition-colors">
              <CheckCircle size={15}/> Confirmar reserva
            </button>
          )}
          <button onClick={() => {
            if (confirm('Tens a certeza que queres cancelar esta reserva?')) updateStatus('cancelada')
          }} disabled={updating}
            className="w-full py-2.5 rounded-lg text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 transition-colors">
            <XCircle size={15}/> Cancelar reserva
          </button>
        </div>
      )}

      {(reservation.status === 'cancelada' || reservation.status === 'concluida') && (
        <div className={`card flex items-center gap-3 text-sm ${reservation.status === 'cancelada' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
          {reservation.status === 'cancelada' ? <XCircle size={16}/> : <CheckCircle size={16}/>}
          <span className="font-medium">
            {reservation.status === 'cancelada' ? 'Esta reserva foi cancelada.' : 'Esta reserva foi concluída.'}
          </span>
        </div>
      )}
    </div>
  )
}
