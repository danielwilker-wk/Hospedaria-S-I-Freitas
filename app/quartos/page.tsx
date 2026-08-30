'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BedDouble, RefreshCw } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'vago',       label: 'Vago',        color: 'bg-green-50 border-green-300 text-green-700' },
  { value: 'ocupado',    label: 'Ocupado',      color: 'bg-red-50 border-red-300 text-red-700' },
  { value: 'limpeza',    label: 'Limpeza',      color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 'manutencao', label: 'Manutenção',   color: 'bg-indigo-50 border-indigo-300 text-indigo-700' },
]

export default function QuartosPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [selected, setSelected] = useState<any | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      const { data } = await supabase
        .from('v_room_occupancy')
        .select('*')
      setRooms(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function updateStatus(roomNumber: string, newStatus: string) {
    setUpdating(roomNumber)
    const supabase = createClient()
    await supabase
      .from('rooms')
      .update({ status: newStatus })
      .eq('number', roomNumber)
    // Actualizar localmente
    setRooms(prev => prev.map(r =>
      r.room_number === roomNumber ? { ...r, room_status: newStatus } : r
    ))
    setSelected(null)
    setUpdating(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-ink-muted text-sm">A carregar...</p>
    </div>
  )

  const getColor = (status: string) =>
    STATUS_OPTIONS.find(s => s.value === status)?.color ?? ''

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <BedDouble size={20} className="text-brand-500" /> Mapa de Quartos
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Clica num quarto para alterar o estado</p>
        </div>
        <button onClick={() => window.location.reload()} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13}/> Actualizar
        </button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs">
        {STATUS_OPTIONS.map(s => (
          <span key={s.value} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${s.color}`}>
            {s.label}
          </span>
        ))}
      </div>

      {/* Grelha */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {rooms
          .sort((a, b) => Number(a.room_number) - Number(b.room_number))
          .map(room => (
            <button
              key={room.room_number}
              onClick={() => setSelected(room)}
              disabled={updating === room.room_number}
              className={`rounded-lg p-3 text-center border-2 transition-all hover:scale-105 hover:shadow-md ${getColor(room.room_status)} ${updating === room.room_number ? 'opacity-50' : ''}`}
            >
              <div className="text-lg font-bold">{room.room_number}</div>
              <div className="text-xs font-medium mt-0.5">{room.room_type}</div>
              <div className="text-xs mt-1 opacity-75">
                {STATUS_OPTIONS.find(s => s.value === room.room_status)?.label}
              </div>
              {room.guest_name && (
                <div className="text-xs mt-1 truncate font-medium">{room.guest_name}</div>
              )}
            </button>
          ))}
      </div>

      {/* Modal de alteração de status */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-surface-border shadow-xl w-full max-w-sm p-5">
            <h3 className="font-semibold text-ink mb-1">Quarto {selected.room_number}</h3>
            <p className="text-sm text-ink-muted mb-4">{selected.room_type} — Alterar estado para:</p>
            <div className="space-y-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => updateStatus(selected.room_number, s.value)}
                  disabled={selected.room_status === s.value}
                  className={`w-full text-left px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all
                    ${selected.room_status === s.value ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.01]'}
                    ${s.color}`}
                >
                  {s.label}
                  {selected.room_status === s.value && ' (actual)'}
                </button>
              ))}
            </div>
            <button onClick={() => setSelected(null)} className="btn-ghost w-full mt-3 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
