'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, MessageCircle, CheckCircle } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function RelatorioDiarioPage() {
  const [staffId, setStaffId] = useState('')
  const [date, setDate] = useState(yesterday())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [checkins, setCheckins] = useState<{ number: string; guest: string }[]>([])
  const [checkouts, setCheckouts] = useState<{ number: string; guest: string }[]>([])
  const [revenueRooms, setRevenueRooms] = useState(0)
  const [revenueLaundry, setRevenueLaundry] = useState(0)
  const [restaurantHospede, setRestaurantHospede] = useState(0)
  const [restaurantNaoHospede, setRestaurantNaoHospede] = useState(0)
  const [barHospede, setBarHospede] = useState(0)
  const [barNaoHospede, setBarNaoHospede] = useState(0)
  const [revenueMinibar, setRevenueMinibar] = useState(0)
  const [breakfastCount, setBreakfastCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStaffId(session.user.id)
    })
  }, [])

  async function loadReport(selectedDate: string) {
    setLoading(true)
    setSaved(false)
    const supabase = createClient()
    const dayStart = `${selectedDate}T00:00:00`
    const dayEnd = `${selectedDate}T23:59:59`

    const [
      { data: checkinsData },
      { data: checkoutsData },
      { data: paymentsData },
      { data: laundryData },
      { data: restaurantData },
      { data: barSalesData },
      { data: minibarData },
      { data: breakfastData },
    ] = await Promise.all([
      supabase.from('stays').select('room_value, amount_paid_reservation, rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_in_at', dayStart).lte('check_in_at', dayEnd),
      supabase.from('stays').select('rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_out_at', dayStart).lte('check_out_at', dayEnd),
      supabase.from('payments').select('amount').eq('property_id', PROPERTY_ID).eq('source_type', 'stay').gte('paid_at', dayStart).lte('paid_at', dayEnd),
      supabase.from('laundry_records').select('value').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('restaurant_sales').select('value, guest_type').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('bar_sales').select('id, guest_type, bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('minibar_consumptions').select('total').eq('property_id', PROPERTY_ID).gte('consumed_at', dayStart).lte('consumed_at', dayEnd),
      supabase.from('breakfast_records').select('id').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate).eq('confirmed', true),
    ])

    setCheckins((checkinsData ?? []).map((s: any) => ({ number: s.rooms?.number, guest: `${s.guests?.full_name ?? ''} ${s.guests?.surname ?? ''}`.trim() })))
    setCheckouts((checkoutsData ?? []).map((s: any) => ({ number: s.rooms?.number, guest: `${s.guests?.full_name ?? ''} ${s.guests?.surname ?? ''}`.trim() })))

    const roomsFromCheckin = (checkinsData ?? []).reduce((sum: number, s: any) => sum + Number(s.amount_paid_reservation ?? 0), 0)
    const roomsFromPayments = (paymentsData ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    setRevenueRooms(roomsFromCheckin + roomsFromPayments)

    setRevenueLaundry((laundryData ?? []).reduce((sum: number, r: any) => sum + Number(r.value), 0))

    const restHospede = (restaurantData ?? []).filter((r: any) => r.guest_type === 'hospede').reduce((sum: number, r: any) => sum + Number(r.value), 0)
    const restNaoHospede = (restaurantData ?? []).filter((r: any) => r.guest_type === 'nao_hospede').reduce((sum: number, r: any) => sum + Number(r.value), 0)
    setRestaurantHospede(restHospede)
    setRestaurantNaoHospede(restNaoHospede)

    const barHosp = (barSalesData ?? []).filter((s: any) => s.guest_type === 'hospede').reduce((sum: number, s: any) => sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0)
    const barNaoHosp = (barSalesData ?? []).filter((s: any) => s.guest_type === 'nao_hospede').reduce((sum: number, s: any) => sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0)
    setBarHospede(barHosp)
    setBarNaoHospede(barNaoHosp)

    setRevenueMinibar((minibarData ?? []).reduce((sum: number, r: any) => sum + Number(r.total), 0))
    setBreakfastCount((breakfastData ?? []).length)

    setLoading(false)
  }

  useEffect(() => { loadReport(date) }, [date])

  const totalRestaurant = restaurantHospede + restaurantNaoHospede
  const totalBar = barHospede + barNaoHospede
  const totalGeral = revenueRooms + revenueLaundry + totalRestaurant + totalBar + revenueMinibar

  async function marcarRevisto() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('daily_summaries').upsert({
      property_id: PROPERTY_ID,
      summary_date: date,
      total_checkins: checkins.length,
      total_checkouts: checkouts.length,
      total_revenue_rooms: revenueRooms,
      total_revenue_breakfast: 0,
      total_revenue_laundry: revenueLaundry,
      total_revenue_restaurant: totalRestaurant,
      total_revenue_bar: totalBar,
      total_revenue_minibar: revenueMinibar,
      total_revenue_overall: totalGeral,
      status: 'revisto',
      reviewed_by: staffId,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: 'property_id,summary_date' })
    setSaving(false)
    setSaved(true)
  }

  function textoWhatsApp() {
    const dataFormatada = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    let txt = `*Relatório Diário — Hospedaria S&I Freitas*\n${dataFormatada}\n\n`
    txt += `*Receção*\nCheck-ins: ${checkins.length}\n`
    checkins.forEach(c => txt += `  • Quarto ${c.number} — ${c.guest}\n`)
    txt += `Check-outs: ${checkouts.length}\n`
    checkouts.forEach(c => txt += `  • Quarto ${c.number} — ${c.guest}\n`)
    txt += `\n*Sala de Refeições*\nRestaurante (hóspedes): ${restaurantHospede.toLocaleString('pt-AO')} Kz\nRestaurante (não-hóspedes): ${restaurantNaoHospede.toLocaleString('pt-AO')} Kz\nBar (hóspedes): ${barHospede.toLocaleString('pt-AO')} Kz\nBar (não-hóspedes): ${barNaoHospede.toLocaleString('pt-AO')} Kz\n`
    txt += `\n*Outros*\nPequenos-almoços servidos: ${breakfastCount}\nLavandaria: ${revenueLaundry.toLocaleString('pt-AO')} Kz\nFrigobar: ${revenueMinibar.toLocaleString('pt-AO')} Kz\n`
    txt += `\n*Total do dia: ${totalGeral.toLocaleString('pt-AO')} Kz*`
    return txt
  }

  async function copiarWhatsApp() {
    await navigator.clipboard.writeText(textoWhatsApp())
    alert('Relatório copiado! Cola no WhatsApp.')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <FileText size={20} className="text-brand-500" /> Relatório Diário
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Resumo do dia anterior</p>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : (
        <>
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Receção</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-ink-light text-xs">Check-ins</p><p className="font-semibold">{checkins.length}</p></div>
              <div><p className="text-ink-light text-xs">Check-outs</p><p className="font-semibold">{checkouts.length}</p></div>
            </div>
            {checkins.length > 0 && (
              <div className="text-xs text-ink-muted">
                {checkins.map((c, i) => <p key={i}>Entrada — Quarto {c.number} — {c.guest}</p>)}
              </div>
            )}
            {checkouts.length > 0 && (
              <div className="text-xs text-ink-muted">
                {checkouts.map((c, i) => <p key={i}>Saída — Quarto {c.number} — {c.guest}</p>)}
              </div>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Sala de Refeições</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between col-span-2"><span className="text-ink-muted">Restaurante — hóspedes</span><span className="font-medium">{restaurantHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between col-span-2"><span className="text-ink-muted">Restaurante — não-hóspedes</span><span className="font-medium">{restaurantNaoHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between col-span-2"><span className="text-ink-muted">Bar — hóspedes</span><span className="font-medium">{barHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between col-span-2"><span className="text-ink-muted">Bar — não-hóspedes</span><span className="font-medium">{barNaoHospede.toLocaleString('pt-AO')} Kz</span></div>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Outros</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Pequenos-almoços servidos</span><span className="font-medium">{breakfastCount}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Lavandaria</span><span className="font-medium">{revenueLaundry.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Frigobar</span><span className="font-medium">{revenueMinibar.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Hospedagem</span><span className="font-medium">{revenueRooms.toLocaleString('pt-AO')} Kz</span></div>
            </div>
          </div>

          <div className="card border-brand-200 bg-brand-50">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-ink">Total do Dia</span>
              <span className="text-xl font-bold text-brand-600">{totalGeral.toLocaleString('pt-AO')} Kz</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={marcarRevisto} disabled={saving} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
              {saved ? <><CheckCircle size={16}/> Revisto</> : saving ? 'A gravar...' : 'Marcar como Revisto'}
            </button>
            <button onClick={copiarWhatsApp} className="btn-secondary px-5 py-3 flex items-center gap-2">
              <MessageCircle size={16} /> Copiar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
