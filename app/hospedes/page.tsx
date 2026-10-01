'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, ChevronRight, BedDouble } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function HospedesPage() {
  const router = useRouter()
  const [stays, setStays] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }

      const { data } = await supabase
        .from('stays')
        .select(`
          id, check_in_at, check_out_planned_at, room_value, amount_due, occupancy, status,
          rooms(number, room_types(name)),
          guests(full_name, surname, document_number)
        `)
        .eq('property_id', PROPERTY_ID)
        .eq('status', 'ativo')
        .order('check_in_at', { ascending: false })

      setStays(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Users size={20} className="text-brand-500" /> Hóspedes Activos
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Clica num hóspede para ver e gerir a sua ficha</p>
      </div>

      {stays.length === 0 ? (
        <div className="card text-center py-12 text-ink-muted">
          <BedDouble size={32} className="mx-auto mb-2 opacity-30"/>
          <p>Sem hóspedes activos no momento.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {stays.map(stay => (
            <Link
              key={stay.id}
              href={`/hospedes/${stay.id}`}
              className="card flex items-center justify-between hover:border-brand-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center">
                  <span className="text-brand-600 font-bold text-sm">{stay.rooms?.number}</span>
                </div>
                <div>
                  <p className="font-semibold text-ink">
                    {stay.guests?.full_name} {stay.guests?.surname}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {stay.rooms?.room_types?.name} · {stay.occupancy} ·
                    Check-in: {new Date(stay.check_in_at).toLocaleDateString('pt-AO')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-ink-muted">A pagar</p>
                  <p className="font-bold text-brand-500">{Number(stay.amount_due).toLocaleString('pt-AO')} Kz</p>
                </div>
                <ChevronRight size={16} className="text-ink-light group-hover:text-brand-500 transition-colors"/>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
