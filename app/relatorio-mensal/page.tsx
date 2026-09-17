'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Download } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function RelatorioMensalPage() {
  const [month, setMonth] = useState(currentMonthValue())
  const [loading, setLoading] = useState(true)

  const [totalRooms, setTotalRooms] = useState(0)
  const [occupancyRate, setOccupancyRate] = useState(0)
  const [totalGuests, setTotalGuests] = useState(0)
  const [totalCheckins, setTotalCheckins] = useState(0)
  const [totalCheckouts, setTotalCheckouts] = useState(0)

  const [maintenanceRooms, setMaintenanceRooms] = useState<string[]>([])
  const [maintenanceCost, setMaintenanceCost] = useState(0)
  const [maintenanceCount, setMaintenanceCount] = useState(0)

  const [revenueRooms, setRevenueRooms] = useState(0)
  const [revenueLaundry, setRevenueLaundry] = useState(0)
  const [revenueRestaurant, setRevenueRestaurant] = useState(0)
  const [revenueBar, setRevenueBar] = useState(0)
  const [revenueMinibar, setRevenueMinibar] = useState(0)

  useEffect(() => { loadReport(month) }, [month])

  async function loadReport(monthValue: string) {
    setLoading(true)
    const supabase = createClient()

    const [year, mo] = monthValue.split('-').map(Number)
    const monthStart = new Date(year, mo - 1, 1)
    const monthEnd = new Date(year, mo, 0, 23, 59, 59)
    const daysInMonth = monthEnd.getDate()
    const monthStartIso = monthStart.toISOString()
    const monthEndIso = monthEnd.toISOString()
    const dateStart = monthStart.toISOString().slice(0, 10)
    const dateEnd = monthEnd.toISOString().slice(0, 10)

    const [
      { count: roomsCount },
      { data: stays },
      { data: maintenance },
      { data: paymentsRooms },
      { data: laundry },
      { data: restaurant },
      { data: bar },
      { data: minibar },
    ] = await Promise.all([
      supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('property_id', PROPERTY_ID),
      supabase.from('stays').select('id, room_id, primary_guest_id, check_in_at, check_out_at, room_value, amount_paid_reservation').eq('property_id', PROPERTY_ID),
      supabase.from('maintenance_requests').select('room_id, cost, rooms(number)').eq('property_id', PROPERTY_ID).gte('reported_at', monthStartIso).lte('reported_at', monthEndIso),
      supabase.from('payments').select('amount').eq('property_id', PROPERTY_ID).eq('source_type', 'stay').gte('paid_at', monthStartIso).lte('paid_at', monthEndIso),
      supabase.from('laundry_records').select('value').eq('property_id', PROPERTY_ID).gte('record_date', dateStart).lte('record_date', dateEnd),
      supabase.from('restaurant_sales').select('value').eq('property_id', PROPERTY_ID).gte('record_date', dateStart).lte('record_date', dateEnd),
      supabase.from('bar_sales').select('bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).gte('record_date', dateStart).lte('record_date', dateEnd),
      supabase.from('minibar_consumptions').select('total').eq('property_id', PROPERTY_ID).gte('consumed_at', monthStartIso).lte('consumed_at', monthEndIso),
    ])

    setTotalRooms(roomsCount ?? 0)

    // Noites ocupadas dentro do mês, por estadia (interseção com o intervalo do mês)
    let occupiedNights = 0
    let checkinsInMonth = 0
    let checkoutsInMonth = 0
    const guestSet = new Set<string>()
    let roomsRevenueFromStays = 0

    ;(stays ?? []).forEach((s: any) => {
      const checkin = new Date(s.check_in_at)
      const checkout = s.check_out_at ? new Date(s.check_out_at) : new Date()
      const overlapStart = checkin > monthStart ? checkin : monthStart
      const overlapEnd = checkout < monthEnd ? checkout : monthEnd
      const overlapMs = overlapEnd.getTime() - overlapStart.getTime()
      if (overlapMs > 0) {
        occupiedNights += Math.max(1, Math.ceil(overlapMs / (1000 * 60 * 60 * 24)))
      }
      if (checkin >= monthStart && checkin <= monthEnd) {
        checkinsInMonth++
        guestSet.add(s.primary_guest_id)
        roomsRevenueFromStays += Number(s.amount_paid_reservation ?? 0)
      }
      if (s.check_out_at) {
        const co = new Date(s.check_out_at)
        if (co >= monthStart && co <= monthEnd) checkoutsInMonth++
      }
    })

    setTotalCheckins(checkinsInMonth)
    setTotalCheckouts(checkoutsInMonth)
    setTotalGuests(guestSet.size)

    const capacity = (roomsCount ?? 0) * daysInMonth
    setOccupancyRate(capacity > 0 ? Math.min(100, (occupiedNights / capacity) * 100) : 0)

    const affectedRooms = Array.from(new Set((maintenance ?? []).map((m: any) => m.rooms?.number).filter(Boolean)))
    setMaintenanceRooms(affectedRooms as string[])
    setMaintenanceCount((maintenance ?? []).length)
    setMaintenanceCost((maintenance ?? []).reduce((sum: number, m: any) => sum + Number(m.cost ?? 0), 0))

    const paymentsTotal = (paymentsRooms ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    setRevenueRooms(roomsRevenueFromStays + paymentsTotal)
    setRevenueLaundry((laundry ?? []).reduce((sum: number, r: any) => sum + Number(r.value), 0))
    setRevenueRestaurant((restaurant ?? []).reduce((sum: number, r: any) => sum + Number(r.value), 0))
    setRevenueBar((bar ?? []).reduce((sum: number, s: any) => sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0))
    setRevenueMinibar((minibar ?? []).reduce((sum: number, r: any) => sum + Number(r.total), 0))

    setLoading(false)
  }

  const totalRevenue = revenueRooms + revenueLaundry + revenueRestaurant + revenueBar + revenueMinibar
  const monthLabel = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1)
    .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

  function baixarPdf() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const marginX = 14
    const brand: [number, number, number] = [234, 88, 12]
    const brandLight: [number, number, number] = [255, 237, 213]
    const gray: [number, number, number] = [107, 114, 128]
    const dark: [number, number, number] = [31, 41, 55]

    doc.setFillColor(...brand)
    doc.rect(0, 0, pageWidth, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Hospedaria S&I Freitas', marginX, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
    doc.text(`Relatório Mensal — ${monthLabelCap}`, marginX, 23)

    let y = 44

    function sectionTitle(title: string) {
      doc.setFillColor(...brand)
      doc.rect(marginX, y - 4, 2.5, 5, 'F')
      doc.setTextColor(...dark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(title, marginX + 5, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }

    function row(label: string, value: string) {
      doc.setTextColor(...gray)
      doc.text(label, marginX, y)
      doc.setTextColor(...dark)
      doc.text(value, pageWidth - marginX, y, { align: 'right' })
      y += 6
    }

    function divider() {
      y += 2
      doc.setDrawColor(230, 230, 230)
      doc.line(marginX, y, pageWidth - marginX, y)
      y += 8
    }

    sectionTitle('Ocupação')
    row('Taxa de ocupação', `${occupancyRate.toFixed(1)}%`)
    row('Total de hóspedes', String(totalGuests))
    row('Check-ins no mês', String(totalCheckins))
    row('Check-outs no mês', String(totalCheckouts))
    divider()

    sectionTitle('Manutenção')
    row('Pedidos no mês', String(maintenanceCount))
    row('Quartos afetados', maintenanceRooms.length > 0 ? maintenanceRooms.join(', ') : '—')
    row('Custo total', `${maintenanceCost.toLocaleString('pt-AO')} Kz`)
    divider()

    sectionTitle('Receitas do Mês')
    row('Hospedagem', `${revenueRooms.toLocaleString('pt-AO')} Kz`)
    row('Lavandaria', `${revenueLaundry.toLocaleString('pt-AO')} Kz`)
    row('Restaurante', `${revenueRestaurant.toLocaleString('pt-AO')} Kz`)
    row('Bar', `${revenueBar.toLocaleString('pt-AO')} Kz`)
    row('Frigobar', `${revenueMinibar.toLocaleString('pt-AO')} Kz`)
    y += 4

    doc.setFillColor(...brandLight)
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F')
    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Total Arrecadado no Mês', marginX + 4, y + 10.5)
    doc.setTextColor(...brand)
    doc.setFontSize(14)
    doc.text(`${totalRevenue.toLocaleString('pt-AO')} Kz`, pageWidth - marginX - 4, y + 10.5, { align: 'right' })

    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')} pelo sistema de gestão S&I Freitas`, marginX, pageHeight - 10)

    doc.save(`relatorio-mensal-${month}.pdf`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={20} className="text-brand-500" /> Relatório Mensal
          </h1>
          <p className="text-sm text-ink-muted mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A calcular...</p>
      ) : (
        <>
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Ocupação</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-ink-light text-xs">Taxa de ocupação</p>
                <p className="text-2xl font-bold text-brand-500">{occupancyRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-ink-light text-xs">Total de hóspedes</p>
                <p className="text-2xl font-bold text-ink">{totalGuests}</p>
              </div>
              <div><p className="text-ink-light text-xs">Check-ins no mês</p><p className="font-semibold">{totalCheckins}</p></div>
              <div><p className="text-ink-light text-xs">Check-outs no mês</p><p className="font-semibold">{totalCheckouts}</p></div>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Manutenção</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-ink-light text-xs">Pedidos no mês</p><p className="font-semibold">{maintenanceCount}</p></div>
              <div><p className="text-ink-light text-xs">Custo total</p><p className="font-semibold">{maintenanceCost.toLocaleString('pt-AO')} Kz</p></div>
            </div>
            {maintenanceRooms.length > 0 && (
              <p className="text-xs text-ink-muted">Quartos afetados: {maintenanceRooms.join(', ')}</p>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Receitas do Mês</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Hospedagem</span><span className="font-medium">{revenueRooms.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Lavandaria</span><span className="font-medium">{revenueLaundry.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Restaurante</span><span className="font-medium">{revenueRestaurant.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Bar</span><span className="font-medium">{revenueBar.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Frigobar</span><span className="font-medium">{revenueMinibar.toLocaleString('pt-AO')} Kz</span></div>
            </div>
          </div>

          <div className="card border-brand-200 bg-brand-50">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-ink">Total Arrecadado no Mês</span>
              <span className="text-xl font-bold text-brand-600">{totalRevenue.toLocaleString('pt-AO')} Kz</span>
            </div>
          </div>

          <button onClick={baixarPdf} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            <Download size={16} /> Baixar Relatório em PDF
          </button>
        </>
      )}
    </div>
  )
}
