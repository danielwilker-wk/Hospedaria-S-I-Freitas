'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trophy, Users, TrendingUp } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function BonusPage() {
  const router = useRouter()
  const [attendants, setAttendants] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }

      const { data: att } = await supabase
        .from('attendants')
        .select('id, full_name, department')
        .eq('property_id', PROPERTY_ID)
        .eq('department', 'sala_refeicoes')
        .eq('active', true)
        .order('full_name')

      // Vendas do bar no mês seleccionado
      const startDate = `${selectedMonth}-01`
      const endDate = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0)
        .toISOString().split('T')[0]

      const { data: barData } = await supabase
        .from('bar_sales')
        .select(`id, recorded_by, created_at, bar_sale_items(subtotal)`)
        .eq('property_id', PROPERTY_ID)
        .gte('record_date', startDate)
        .lte('record_date', endDate)

      const { data: restData } = await supabase
        .from('restaurant_sales')
        .select(`id, recorded_by, value, created_at`)
        .eq('property_id', PROPERTY_ID)
        .gte('record_date', startDate)
        .lte('record_date', endDate)

      // Agregar vendas por attendant
      const summary = (att ?? []).map((a: any) => {
        const barSales = (barData ?? []).filter((s: any) => s.recorded_by === a.id)
        const barTotal = barSales.reduce((sum: number, s: any) =>
          sum + (s.bar_sale_items ?? []).reduce((t: number, i: any) => t + Number(i.subtotal ?? 0), 0), 0)

        const restSales = (restData ?? []).filter((s: any) => s.recorded_by === a.id)
        const restTotal = restSales.reduce((sum: number, s: any) => sum + Number(s.value ?? 0), 0)

        return {
          ...a,
          bar_count: barSales.length,
          bar_total: barTotal,
          rest_count: restSales.length,
          rest_total: restTotal,
          grand_total: barTotal + restTotal,
        }
      }).sort((a: any, b: any) => b.grand_total - a.grand_total)

      setAttendants(att ?? [])
      setSales(summary)
      setLoading(false)
    }
    load()
  }, [router, selectedMonth])

  const grandTotal = sales.reduce((sum, s) => sum + s.grand_total, 0)

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Trophy size={20} className="text-brand-500"/> Desempenho & Bónus
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Vendas por funcionário da sala de refeições</p>
        </div>
        <input
          type="month"
          className="input w-40"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
        />
      </div>

      {/* Total geral do mês */}
      <div className="card bg-brand-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp size={24}/>
            <div>
              <p className="text-sm opacity-80">Total de vendas no mês</p>
              <p className="text-2xl font-bold">{grandTotal.toLocaleString('pt-AO')} Kz</p>
            </div>
          </div>
          <div className="text-right opacity-80 text-sm">
            <p>{sales.reduce((s, a) => s + a.bar_count + a.rest_count, 0)} vendas</p>
            <p>{attendants.length} funcionários</p>
          </div>
        </div>
      </div>

      {/* Ranking */}
      <div className="space-y-3">
        {sales.map((a, i) => (
          <div key={a.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                  ${i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-100 text-gray-700' :
                    i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-surface-muted text-ink-muted'}`}>
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-ink">{a.full_name}</p>
                  <p className="text-xs text-ink-muted">{a.bar_count + a.rest_count} vendas no total</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-brand-500 text-lg">{a.grand_total.toLocaleString('pt-AO')} Kz</p>
                <p className="text-xs text-ink-muted">
                  {grandTotal > 0 ? Math.round((a.grand_total / grandTotal) * 100) : 0}% do total
                </p>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="w-full bg-surface-muted rounded-full h-1.5">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all"
                style={{ width: grandTotal > 0 ? `${(a.grand_total / grandTotal) * 100}%` : '0%' }}
              />
            </div>

            {/* Detalhes bar vs restaurante */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-surface-muted rounded-lg p-2.5">
                <p className="text-xs text-ink-muted">Bar ({a.bar_count} vendas)</p>
                <p className="font-semibold">{a.bar_total.toLocaleString('pt-AO')} Kz</p>
              </div>
              <div className="bg-surface-muted rounded-lg p-2.5">
                <p className="text-xs text-ink-muted">Restaurante ({a.rest_count} vendas)</p>
                <p className="font-semibold">{a.rest_total.toLocaleString('pt-AO')} Kz</p>
              </div>
            </div>
          </div>
        ))}

        {sales.length === 0 && (
          <div className="card text-center py-12 text-ink-muted">
            <Users size={32} className="mx-auto mb-2 opacity-30"/>
            <p>Sem vendas registadas neste mês.</p>
          </div>
        )}
      </div>
    </div>
  )
}
