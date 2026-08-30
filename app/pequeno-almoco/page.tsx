'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Coffee, Check } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function PequenoAlmocoPage() {
  const router = useRouter()
  const [stays, setStays] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [staffId, setStaffId] = useState('')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      // Estadias activas
      const { data: stayData } = await supabase
        .from('stays')
        .select('*, rooms(number, room_types(name)), guests(full_name)')
        .eq('property_id', PROPERTY_ID)
        .eq('status', 'ativo')
        .order('rooms(number)')

      // Registos de hoje
      const { data: recData } = await supabase
        .from('breakfast_records')
        .select('*')
        .eq('property_id', PROPERTY_ID)
        .eq('record_date', today)

      setStays(stayData ?? [])
      setRecords(recData ?? [])
      setLoading(false)
    }
    load()
  }, [router, today])

  function isConfirmed(stayId: string) {
    return records.some(r => r.stay_id === stayId && r.confirmed)
  }

  async function toggleBreakfast(stay: any) {
    const supabase = createClient()
    const existing = records.find(r => r.stay_id === stay.id)

    if (existing) {
      // Toggle confirmed
      const { data } = await supabase
        .from('breakfast_records')
        .update({ confirmed: !existing.confirmed })
        .eq('id', existing.id)
        .select()
        .single()
      setRecords(prev => prev.map(r => r.id === existing.id ? data : r))
    } else {
      // Criar novo registo
      const { data } = await supabase
        .from('breakfast_records')
        .insert({
          property_id: PROPERTY_ID,
          stay_id: stay.id,
          room_id: stay.rooms?.id ?? stay.room_id,
          guest_name: stay.guests?.full_name ?? '',
          record_date: today,
          confirmed: true,
          recorded_by: staffId,
        })
        .select()
        .single()
      setRecords(prev => [...prev, data])
    }
  }

  const confirmed = records.filter(r => r.confirmed).length

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Coffee size={20} className="text-brand-500"/> Pequenos-Almoços
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {new Date().toLocaleDateString('pt-AO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="card text-center px-5">
          <div className="text-2xl font-bold text-brand-500">{confirmed}</div>
          <div className="text-xs text-ink-muted">confirmados</div>
        </div>
      </div>

      {stays.length === 0 ? (
        <div className="card text-center py-12 text-ink-muted">
          <Coffee size={32} className="mx-auto mb-2 opacity-30"/>
          <p>Sem estadias activas no momento.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted border-b border-surface-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Quarto</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Hóspede</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Tipo</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Tomou</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {stays.map(stay => {
                const confirmed = isConfirmed(stay.id)
                return (
                  <tr key={stay.id} className={`transition-colors ${confirmed ? 'bg-green-50' : 'hover:bg-surface-muted'}`}>
                    <td className="px-4 py-3 font-bold text-ink">
                      Nº {stay.rooms?.number}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {stay.guests?.full_name}
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-xs">
                      {stay.rooms?.room_types?.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleBreakfast(stay)}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mx-auto transition-all ${
                          confirmed
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-surface-border hover:border-brand-400'
                        }`}
                      >
                        {confirmed && <Check size={14}/>}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
