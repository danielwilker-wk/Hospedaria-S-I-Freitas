'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, CheckCircle, AlertTriangle, Search, ShirtIcon, Plus } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type RoomInCleaning = {
  id: string
  number: string
  room_types?: { name: string }
}

type ActiveStayOption = {
  id: string
  room_id: string
  rooms: { number: string }
  guests: { full_name: string; surname: string | null }
}

export default function LimpezaPage() {
  const [staffId, setStaffId] = useState('')
  const [rooms, setRooms] = useState<RoomInCleaning[]>([])
  const [loading, setLoading] = useState(true)

  const [reportingRoomId, setReportingRoomId] = useState<string | null>(null)
  const [issueDescription, setIssueDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [showLaundryForm, setShowLaundryForm] = useState(false)
  const [staySearch, setStaySearch] = useState('')
  const [stayResults, setStayResults] = useState<ActiveStayOption[]>([])
  const [selectedStay, setSelectedStay] = useState<ActiveStayOption | null>(null)
  const [laundryDescription, setLaundryDescription] = useState('')
  const [laundryValue, setLaundryValue] = useState('')
  const [savingLaundry, setSavingLaundry] = useState(false)
  const [laundrySuccess, setLaundrySuccess] = useState(false)

  async function searchStays(e: React.FormEvent) {
    e.preventDefault()
    if (!staySearch.trim()) return
    const supabase = createClient()
    const { data } = await supabase
      .from('stays')
      .select('id, room_id, rooms(number), guests(full_name, surname)')
      .eq('property_id', PROPERTY_ID)
      .eq('status', 'ativo')

    const q = staySearch.trim().toLowerCase()
    const filtered = (data ?? []).filter((s: any) =>
      s.rooms?.number?.toLowerCase().includes(q) ||
      s.guests?.full_name?.toLowerCase().includes(q) ||
      s.guests?.surname?.toLowerCase().includes(q)
    )
    setStayResults(filtered as any)
  }

  async function registarLavandaria() {
    if (!selectedStay || !laundryValue) return
    setSavingLaundry(true)
    const supabase = createClient()
    const { error } = await supabase.from('laundry_records').insert({
      property_id: PROPERTY_ID,
      stay_id: selectedStay.id,
      room_id: selectedStay.room_id,
      description: laundryDescription || null,
      value: Number(laundryValue),
      recorded_by: staffId,
    })
    if (error) { alert('Erro: ' + error.message); setSavingLaundry(false); return }

    setLaundrySuccess(true)
    setSavingLaundry(false)
    setTimeout(() => {
      setLaundrySuccess(false)
      setShowLaundryForm(false)
      setSelectedStay(null)
      setStaySearch('')
      setLaundryDescription('')
      setLaundryValue('')
    }, 1500)
  }

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

      <div className="card space-y-3">
        <button
          onClick={() => setShowLaundryForm(prev => !prev)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
            <ShirtIcon size={14} /> Registar Lavandaria
          </span>
          <span className="text-brand-500 text-sm font-medium">{showLaundryForm ? 'Fechar' : 'Nova cobrança'}</span>
        </button>

        {showLaundryForm && (
          laundrySuccess ? (
            <div className="flex items-center gap-2 text-green-700 py-2">
              <CheckCircle size={18} /> <span className="font-medium text-sm">Lavandaria registada e debitada na conta!</span>
            </div>
          ) : selectedStay ? (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between bg-surface-muted rounded-lg p-2.5 text-sm">
                <span className="font-medium">Quarto {selectedStay.rooms?.number} — {selectedStay.guests?.full_name}</span>
                <button onClick={() => setSelectedStay(null)} className="text-brand-500 text-xs font-semibold">Trocar</button>
              </div>
              <input
                type="text"
                className="input"
                placeholder="Descrição (ex: 2 lençóis, 1 toalha...)"
                value={laundryDescription}
                onChange={e => setLaundryDescription(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="input"
                placeholder="Valor (Kz)"
                value={laundryValue}
                onChange={e => setLaundryValue(e.target.value)}
              />
              <button
                onClick={registarLavandaria}
                disabled={savingLaundry || !laundryValue}
                className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-1.5"
              >
                <Plus size={15} /> {savingLaundry ? 'A registar...' : 'Registar e Debitar na Conta'}
              </button>
            </div>
          ) : (
            <form onSubmit={searchStays} className="space-y-2 pt-2 border-t border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-light" />
                <input
                  type="text"
                  className="input pl-8 text-sm"
                  placeholder="Quarto ou nome do hóspede..."
                  value={staySearch}
                  onChange={e => setStaySearch(e.target.value)}
                  autoFocus
                />
              </div>
              {stayResults.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedStay(s); setStayResults([]) }}
                  className="w-full text-left text-sm px-2.5 py-1.5 rounded-lg hover:bg-surface-muted"
                >
                  Quarto {s.rooms?.number} — {s.guests?.full_name} {s.guests?.surname}
                </button>
              ))}
            </form>
          )
        )}
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
