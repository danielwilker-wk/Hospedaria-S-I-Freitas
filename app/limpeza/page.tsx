'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, CheckCircle, AlertTriangle } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type RoomInCleaning = {
  id: string
  number: string
  room_types?: { name: string }
}

export default function LimpezaPage() {
  const [staffId, setStaffId] = useState('')
  const [rooms, setRooms] = useState<RoomInCleaning[]>([])
  const [loading, setLoading] = useState(true)

  const [reportingRoomId, setReportingRoomId] = useState<string | null>(null)
  const [issueDescription, setIssueDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('rooms')
      .select('id, number, room_types(name)')
      .eq('property_id', PROPERTY_ID)
      .eq('status', 'limpeza')
      .order('number')
    setRooms((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStaffId(session.user.id)
    })
    load()
  }, [])

  async function finalizarLimpeza(roomId: string) {
    setSaving(true)
    const supabase = createClient()

    await supabase.from('housekeeping_records').insert({
      property_id: PROPERTY_ID,
      room_id: roomId,
      staff_id: staffId,
      cleaning_done: true,
      maintenance_needed: false,
      verified_by: staffId,
    })

    await supabase.from('rooms').update({ status: 'vago' }).eq('id', roomId)

    setSaving(false)
    load()
  }

  async function reportarAvaria(roomId: string) {
    if (!issueDescription.trim()) return
    setSaving(true)
    const supabase = createClient()

    await supabase.from('housekeeping_records').insert({
      property_id: PROPERTY_ID,
      room_id: roomId,
      staff_id: staffId,
      cleaning_done: false,
      maintenance_needed: true,
      maintenance_notes: issueDescription,
      verified_by: staffId,
    })

    await supabase.from('maintenance_requests').insert({
      property_id: PROPERTY_ID,
      room_id: roomId,
      description: issueDescription,
      reported_by: staffId,
      status: 'pendente',
    })

    await supabase.from('rooms').update({ status: 'manutencao' }).eq('id', roomId)

    setReportingRoomId(null)
    setIssueDescription('')
    setSaving(false)
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Sparkles size={20} className="text-brand-500" /> Limpeza
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Quartos à espera de limpeza após check-out</p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : rooms.length === 0 ? (
        <div className="card text-center py-10">
          <CheckCircle size={28} className="text-green-500 mx-auto mb-2" />
          <p className="text-sm text-ink-muted">Nenhum quarto à espera de limpeza neste momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <div key={room.id} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">Quarto {room.number}</p>
                  <p className="text-xs text-ink-muted">{room.room_types?.name}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                  Aguarda limpeza
                </span>
              </div>

              {reportingRoomId === room.id ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Descreve a avaria encontrada (ex: lâmpada fundida, torneira a pingar...)"
                    value={issueDescription}
                    onChange={e => setIssueDescription(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => reportarAvaria(room.id)}
                      disabled={saving || !issueDescription.trim()}
                      className="btn-primary flex-1 py-2 text-sm"
                    >
                      {saving ? 'A enviar...' : 'Enviar para Manutenção'}
                    </button>
                    <button
                      onClick={() => { setReportingRoomId(null); setIssueDescription('') }}
                      className="btn-secondary px-4 py-2 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => finalizarLimpeza(room.id)}
                    disabled={saving}
                    className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle size={15} /> Limpeza Concluída
                  </button>
                  <button
                    onClick={() => setReportingRoomId(room.id)}
                    className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5 text-amber-700"
                  >
                    <AlertTriangle size={15} /> Reportar Avaria
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
