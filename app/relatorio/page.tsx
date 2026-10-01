'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, MessageCircle, CheckCircle, Download } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const BANKS = ['BIC', 'BFA', 'BAI']

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function occupancyLabel(occ: string) {
  if (occ === 'individual') return 'Individuais'
  if (occ === 'casal') return 'Casal'
  return 'Duplo'
}

function occupancyGuests(occ: string) {
  return occ === 'individual' ? 1 : 2
}

function joinBanks(banks: string[]) {
  if (banks.length === 0) return ''
  if (banks.length === 1) return banks[0]
  return banks.slice(0, -1).join(', ') + ' e ' + banks[banks.length - 1]
}

function formatKz(n: number) {
  return n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type BankLine = { bank: string; value: number }
type ItemLine = { name: string; qty: number; total: number }

export default function RelatorioDiarioPage() {
  const [staffId, setStaffId] = useState('')
  const [date, setDate] = useState(yesterday())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [assinatura, setAssinatura] = useState('')
  const [iva, setIva] = useState('')

  const [checkins, setCheckins] = useState<{ number: string; guest: string }[]>([])
  const [checkouts, setCheckouts] = useState<{ number: string; guest: string }[]>([])

  const [quartosOcupados, setQuartosOcupados] = useState(0)
  const [numHospedes, setNumHospedes] = useState(0)
  const [categorias, setCategorias] = useState<{ label: string; count: number }[]>([])

  const [restaurantHospede, setRestaurantHospede] = useState(0)
  const [restaurantNaoHospede, setRestaurantNaoHospede] = useState(0)
  const [barHospede, setBarHospede] = useState(0)
  const [barNaoHospede, setBarNaoHospede] = useState(0)
  const [restaurantProducts, setRestaurantProducts] = useState<ItemLine[]>([])
  const [barProducts, setBarProducts] = useState<ItemLine[]>([])

  const [revenueRooms, setRevenueRooms] = useState(0)
  const [revenueLaundry, setRevenueLaundry] = useState(0)
  const [revenueMinibar, setRevenueMinibar] = useState(0)
  const [breakfastCount, setBreakfastCount] = useState(0)

  const [quartosTpaPorBanco, setQuartosTpaPorBanco] = useState<BankLine[]>([])
  const [quartosTransferencia, setQuartosTransferencia] = useState(0)
  const [quartosNumerario, setQuartosNumerario] = useState(0)

  const [lavandariaTpaBancos, setLavandariaTpaBancos] = useState<string[]>([])
  const [lavandariaTpaTotal, setLavandariaTpaTotal] = useState(0)
  const [lavandariaNumerario, setLavandariaNumerario] = useState(0)

  const [refeicoesTpaBancos, setRefeicoesTpaBancos] = useState<string[]>([])
  const [refeicoesTpaTotal, setRefeicoesTpaTotal] = useState(0)
  const [refeicoesTpaItens, setRefeicoesTpaItens] = useState<{ name: string; qty: number }[]>([])
  const [refeicoesNumerarioTotal, setRefeicoesNumerarioTotal] = useState(0)
  const [refeicoesNumerarioItens, setRefeicoesNumerarioItens] = useState<{ name: string; qty: number }[]>([])

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
      { data: laundryData },
      { data: restaurantData },
      { data: barSalesData },
      { data: minibarData },
      { data: breakfastData },
      { data: staysData },
      { data: stayPayments },
      { data: laundryPayments },
      { data: restSales },
      { data: barSales },
    ] = await Promise.all([
      supabase.from('stays').select('rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_in_at', dayStart).lte('check_in_at', dayEnd),
      supabase.from('stays').select('rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_out_at', dayStart).lte('check_out_at', dayEnd),
      supabase.from('laundry_records').select('value').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('restaurant_sales').select('value, guest_type, payment_method, bank_name').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('bar_sales').select('id, guest_type, payment_method, bank_name, bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('minibar_consumptions').select('total').eq('property_id', PROPERTY_ID).gte('consumed_at', dayStart).lte('consumed_at', dayEnd),
      supabase.from('breakfast_records').select('id').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate).eq('confirmed', true),
      supabase.from('stays').select('occupancy, billed_to, companies(name)').eq('property_id', PROPERTY_ID).lte('check_in_at', dayEnd).or(`check_out_at.is.null,check_out_at.gt.${dayEnd}`),
      supabase.from('payments').select('amount, method, bank_name').eq('property_id', PROPERTY_ID).eq('source_type', 'stay').gte('paid_at', dayStart).lte('paid_at', dayEnd),
      supabase.from('payments').select('amount, method, bank_name').eq('property_id', PROPERTY_ID).eq('source_type', 'laundry').gte('paid_at', dayStart).lte('paid_at', dayEnd),
      supabase.from('restaurant_sale_items').select('quantity, subtotal, menu_items(name), restaurant_sales!inner(record_date, property_id, payment_method)').eq('restaurant_sales.property_id', PROPERTY_ID).eq('restaurant_sales.record_date', selectedDate),
      supabase.from('bar_sale_items').select('quantity, subtotal, bar_products(name), bar_sales!inner(record_date, property_id, payment_method)').eq('bar_sales.property_id', PROPERTY_ID).eq('bar_sales.record_date', selectedDate),
    ])

    setCheckins((checkinsData ?? []).map((s: any) => ({ number: s.rooms?.number, guest: `${s.guests?.full_name ?? ''} ${s.guests?.surname ?? ''}`.trim() })))
    setCheckouts((checkoutsData ?? []).map((s: any) => ({ number: s.rooms?.number, guest: `${s.guests?.full_name ?? ''} ${s.guests?.surname ?? ''}`.trim() })))

    const stays = staysData ?? []
    setQuartosOcupados(stays.length)
    setNumHospedes(stays.reduce((sum: number, s: any) => sum + occupancyGuests(s.occupancy), 0))
    const catMap: Record<string, number> = {}
    stays.forEach((s: any) => {
      const label = s.billed_to === 'empresa' && s.companies?.name ? s.companies.name : occupancyLabel(s.occupancy)
      catMap[label] = (catMap[label] || 0) + 1
    })
    setCategorias(Object.entries(catMap).map(([label, count]) => ({ label, count })))

    const restHosp = (restaurantData ?? []).filter((r: any) => r.guest_type === 'hospede').reduce((s: number, r: any) => s + Number(r.value), 0)
    const restNao = (restaurantData ?? []).filter((r: any) => r.guest_type === 'nao_hospede').reduce((s: number, r: any) => s + Number(r.value), 0)
    setRestaurantHospede(restHosp)
    setRestaurantNaoHospede(restNao)

    const barHosp = (barSalesData ?? []).filter((s: any) => s.guest_type === 'hospede').reduce((sum: number, s: any) => sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0)
    const barNao = (barSalesData ?? []).filter((s: any) => s.guest_type === 'nao_hospede').reduce((sum: number, s: any) => sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0)
    setBarHospede(barHosp)
    setBarNaoHospede(barNao)

    setRevenueLaundry((laundryData ?? []).reduce((s: number, r: any) => s + Number(r.value), 0))
    setRevenueMinibar((minibarData ?? []).reduce((s: number, r: any) => s + Number(r.total), 0))
    setBreakfastCount((breakfastData ?? []).length)

    const quartosTpa: Record<string, number> = {}
    let quartosTransf = 0, quartosNum = 0
    ;(stayPayments ?? []).forEach((p: any) => {
      if (p.method === 'tpa' && p.bank_name) quartosTpa[p.bank_name] = (quartosTpa[p.bank_name] || 0) + Number(p.amount)
      else if (p.method === 'transferencia') quartosTransf += Number(p.amount)
      else if (p.method === 'numerario') quartosNum += Number(p.amount)
    })
    setQuartosTpaPorBanco(BANKS.filter(b => quartosTpa[b] > 0).map(b => ({ bank: b, value: quartosTpa[b] })))
    setQuartosTransferencia(quartosTransf)
    setQuartosNumerario(quartosNum)
    const quartosBancoTotal = Object.values(quartosTpa).reduce((s, v) => s + v, 0) + quartosTransf
    setRevenueRooms(quartosBancoTotal + quartosNum)

    let lavTpaTotal = 0, lavNum = 0
    const lavBanksSet = new Set<string>()
    ;(laundryPayments ?? []).forEach((p: any) => {
      if (p.method === 'tpa' && p.bank_name) { lavTpaTotal += Number(p.amount); lavBanksSet.add(p.bank_name) }
      else if (p.method === 'transferencia') { lavTpaTotal += Number(p.amount) }
      else if (p.method === 'numerario') lavNum += Number(p.amount)
    })
    setLavandariaTpaBancos(BANKS.filter(b => lavBanksSet.has(b)))
    setLavandariaTpaTotal(lavTpaTotal)
    setLavandariaNumerario(lavNum)

    let refTpaTotal = 0, refNum = 0
    const refBanksSet = new Set<string>()
    ;(restaurantData ?? []).forEach((s: any) => {
      if (s.payment_method === 'tpa') { refTpaTotal += Number(s.value); if (s.bank_name) refBanksSet.add(s.bank_name) }
      else if (s.payment_method === 'transferencia') refTpaTotal += Number(s.value)
      else if (s.payment_method === 'numerario') refNum += Number(s.value)
    })
    ;(barSalesData ?? []).forEach((s: any) => {
      const val = (s.bar_sale_items ?? []).reduce((sum: number, it: any) => sum + Number(it.subtotal), 0)
      if (s.payment_method === 'tpa') { refTpaTotal += val; if (s.bank_name) refBanksSet.add(s.bank_name) }
      else if (s.payment_method === 'transferencia') refTpaTotal += val
      else if (s.payment_method === 'numerario') refNum += val
    })
    setRefeicoesTpaBancos(BANKS.filter(b => refBanksSet.has(b)))
    setRefeicoesTpaTotal(refTpaTotal)
    setRefeicoesNumerarioTotal(refNum)

    function aggregateAll(restItems: any[], barItems: any[]): ItemLine[] {
      const map: Record<string, { qty: number; total: number }> = {}
      ;(restItems ?? []).forEach((it: any) => {
        const name = it.menu_items?.name ?? 'Item removido'
        if (!map[name]) map[name] = { qty: 0, total: 0 }
        map[name].qty += Number(it.quantity)
        map[name].total += Number(it.subtotal)
      })
      ;(barItems ?? []).forEach((it: any) => {
        const name = it.bar_products?.name ?? 'Item removido'
        if (!map[name]) map[name] = { qty: 0, total: 0 }
        map[name].qty += Number(it.quantity)
        map[name].total += Number(it.subtotal)
      })
      return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total)
    }
    setRestaurantProducts(aggregateAll(restSales ?? [], []))
    setBarProducts(aggregateAll([], barSales ?? []))

    function aggregateQty(items: any[], predicate: (s: any) => boolean): { name: string; qty: number }[] {
      const map: Record<string, number> = {}
      ;(items ?? []).forEach((it: any) => {
        const parent = it.restaurant_sales ?? it.bar_sales
        if (!predicate(parent)) return
        const name = it.menu_items?.name ?? it.bar_products?.name ?? 'Item removido'
        map[name] = (map[name] || 0) + Number(it.quantity)
      })
      return Object.entries(map).map(([name, qty]) => ({ name, qty }))
    }
    const tpaOuTransf = (p: any) => p?.payment_method === 'tpa' || p?.payment_method === 'transferencia'
    const numer = (p: any) => p?.payment_method === 'numerario'
    function merge(a: { name: string; qty: number }[], b: { name: string; qty: number }[]) {
      const out = [...a]
      b.forEach(cur => {
        const existing = out.find(x => x.name === cur.name)
        if (existing) existing.qty += cur.qty
        else out.push({ ...cur })
      })
      return out
    }
    setRefeicoesTpaItens(merge(aggregateQty(restSales ?? [], tpaOuTransf), aggregateQty(barSales ?? [], tpaOuTransf)))
    setRefeicoesNumerarioItens(merge(aggregateQty(restSales ?? [], numer), aggregateQty(barSales ?? [], numer)))

    setLoading(false)
  }

  useEffect(() => { loadReport(date) }, [date])

  const totalRestaurantBar = restaurantHospede + restaurantNaoHospede + barHospede + barNaoHospede
  const totalGeral = revenueRooms + revenueLaundry + totalRestaurantBar + revenueMinibar
  const totalBanco = quartosTpaPorBanco.reduce((s, b) => s + b.value, 0) + quartosTransferencia + lavandariaTpaTotal + refeicoesTpaTotal
  const totalNumerario = quartosNumerario + lavandariaNumerario + refeicoesNumerarioTotal

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
      total_revenue_restaurant: restaurantHospede + restaurantNaoHospede,
      total_revenue_bar: barHospede + barNaoHospede,
      total_revenue_minibar: revenueMinibar,
      total_revenue_overall: totalGeral,
      status: 'revisto',
      reviewed_by: staffId,
      reviewed_at: new Date().toISOString(),
      notes: assinatura ? `Att: ${assinatura}` : null,
    }, { onConflict: 'property_id,summary_date' })
    setSaving(false)
    setSaved(true)
  }

  function textoRelatorio() {
    const dataFormatada = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT').split('/').join('-')
    let txt = `Relatório da hospedaria\n${dataFormatada}\n\n`
    txt += ` Quartos ocupados:${quartosOcupados}\n Número de Hóspedes:${numHospedes}\n\n`
    categorias.forEach(c => txt += `${c.label}:${c.count}\n`)
    txt += `\n`

    quartosTpaPorBanco.forEach(b => {
      txt += `Vendas no TPA do ${b.bank} pagamento de quartos no valor:${formatKz(b.value)}\n\n`
    })
    if (quartosTransferencia > 0) {
      txt += `Transferência bancária pagamento de quartos no valor:${formatKz(quartosTransferencia)}\n\n`
    }
    if (lavandariaTpaTotal > 0) {
      txt += `Pagamento no TPA ${joinBanks(lavandariaTpaBancos)} serviço lavandaria no valor:${formatKz(lavandariaTpaTotal)}\n\n`
    }
    if (refeicoesTpaTotal > 0) {
      txt += `Vendas na sala de refeições nos TPA do ${joinBanks(refeicoesTpaBancos)} no valor:${formatKz(refeicoesTpaTotal)}\n`
      refeicoesTpaItens.forEach(it => txt += `${it.qty} ${it.name}\n`)
      txt += `\n`
    }
    txt += `Total em banco:${formatKz(totalBanco)}\n\n`

    if (refeicoesNumerarioTotal > 0) {
      txt += `Venda em numerário pagamento na sala de refeições no valor:${formatKz(refeicoesNumerarioTotal)}\n`
      refeicoesNumerarioItens.forEach(it => txt += `${it.qty} ${it.name}\n`)
      txt += `\n`
    }
    if (quartosNumerario > 0) txt += `Venda em numerário pagamento de quartos no valor:${formatKz(quartosNumerario)}\n\n`
    if (lavandariaNumerario > 0) txt += `Venda em numerário serviço lavandaria no valor:${formatKz(lavandariaNumerario)}\n\n`
    txt += `Total em numerário: ${formatKz(totalNumerario)}\n\n`

    if (iva.trim()) txt += `Valor do IVA: ${iva}\n\n`
    txt += `Att: ${assinatura || '_____________'}`
    return txt
  }

  async function copiarTexto() {
    await navigator.clipboard.writeText(textoRelatorio())
    alert('Relatório copiado! Cola no WhatsApp.')
  }

  function baixarPdf() {
    const dataFormatada = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
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
    doc.text(`Relatório Diário — ${dataFormatada}`, marginX, 23)

    let y = 44
    const pageHeight = doc.internal.pageSize.getHeight()

    function checkPageBreak(needed = 20) {
      if (y > pageHeight - needed) {
        doc.addPage()
        y = 20
      }
    }
    function sectionTitle(title: string) {
      checkPageBreak(30)
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
      checkPageBreak()
      doc.setTextColor(...gray)
      doc.text(label, marginX, y)
      doc.setTextColor(...dark)
      doc.text(value, pageWidth - marginX, y, { align: 'right' })
      y += 6
    }
    function smallLine(text: string) {
      checkPageBreak()
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text(text, marginX + 4, y)
      y += 5
      doc.setFontSize(10)
    }
    function divider() {
      y += 2
      doc.setDrawColor(230, 230, 230)
      doc.line(marginX, y, pageWidth - marginX, y)
      y += 8
    }

    sectionTitle('Ocupação')
    row('Quartos ocupados', String(quartosOcupados))
    row('Número de hóspedes', String(numHospedes))
    categorias.forEach(c => row(c.label, String(c.count)))
    divider()

    sectionTitle('Receção')
    row('Check-ins', String(checkins.length))
    checkins.forEach(c => smallLine(`Entrada — Quarto ${c.number} — ${c.guest}`))
    row('Check-outs', String(checkouts.length))
    checkouts.forEach(c => smallLine(`Saída — Quarto ${c.number} — ${c.guest}`))
    divider()

    sectionTitle('Sala de Refeições')
    row('Restaurante — hóspedes', `${restaurantHospede.toLocaleString('pt-AO')} Kz`)
    row('Restaurante — não-hóspedes', `${restaurantNaoHospede.toLocaleString('pt-AO')} Kz`)
    row('Bar — hóspedes', `${barHospede.toLocaleString('pt-AO')} Kz`)
    row('Bar — não-hóspedes', `${barNaoHospede.toLocaleString('pt-AO')} Kz`)
    if (restaurantProducts.length > 0) {
      y += 1
      smallLine('Pratos vendidos:')
      restaurantProducts.forEach(p => smallLine(`${p.qty}x ${p.name} — ${p.total.toLocaleString('pt-AO')} Kz`))
    }
    if (barProducts.length > 0) {
      y += 1
      smallLine('Produtos do bar vendidos:')
      barProducts.forEach(p => smallLine(`${p.qty}x ${p.name} — ${p.total.toLocaleString('pt-AO')} Kz`))
    }
    divider()

    sectionTitle('Outros')
    row('Pequenos-almoços servidos', String(breakfastCount))
    row('Lavandaria', `${revenueLaundry.toLocaleString('pt-AO')} Kz`)
    row('Frigobar', `${revenueMinibar.toLocaleString('pt-AO')} Kz`)
    row('Hospedagem', `${revenueRooms.toLocaleString('pt-AO')} Kz`)
    divider()

    sectionTitle('Discriminação — Banco (TPA / Transferência)')
    quartosTpaPorBanco.forEach(b => row(`Quartos — TPA ${b.bank}`, `${formatKz(b.value)} Kz`))
    if (quartosTransferencia > 0) row('Quartos — Transferência', `${formatKz(quartosTransferencia)} Kz`)
    if (lavandariaTpaTotal > 0) row(`Lavandaria — TPA (${joinBanks(lavandariaTpaBancos)})`, `${formatKz(lavandariaTpaTotal)} Kz`)
    if (refeicoesTpaTotal > 0) row(`Sala de Refeições — TPA (${joinBanks(refeicoesTpaBancos)})`, `${formatKz(refeicoesTpaTotal)} Kz`)
    divider()

    sectionTitle('Discriminação — Numerário')
    if (quartosNumerario > 0) row('Quartos', `${formatKz(quartosNumerario)} Kz`)
    if (lavandariaNumerario > 0) row('Lavandaria', `${formatKz(lavandariaNumerario)} Kz`)
    if (refeicoesNumerarioTotal > 0) row('Sala de Refeições', `${formatKz(refeicoesNumerarioTotal)} Kz`)
    divider()

    checkPageBreak(50)
    doc.setFillColor(...brandLight)
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F')
    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Total do Dia', marginX + 4, y + 10.5)
    doc.setTextColor(...brand)
    doc.setFontSize(14)
    doc.text(`${totalGeral.toLocaleString('pt-AO')} Kz`, pageWidth - marginX - 4, y + 10.5, { align: 'right' })
    y += 24

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...dark)
    if (iva.trim()) { row('Valor do IVA', iva) }
    row('Att', assinatura || '—')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')} pelo sistema de gestão S&I Freitas`, marginX, pageHeight - 10)

    doc.save(`relatorio-diario-${date}.pdf`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <FileText size={20} className="text-brand-500" /> Relatório Diário
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Resumo do dia</p>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : (
        <>
          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Ocupação</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-ink-light text-xs">Quartos ocupados</p><p className="font-semibold">{quartosOcupados}</p></div>
              <div><p className="text-ink-light text-xs">Número de hóspedes</p><p className="font-semibold">{numHospedes}</p></div>
            </div>
            <div className="pt-2 border-t border-border space-y-1">
              {categorias.map((c, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-ink-muted">{c.label}</span>
                  <span className="font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

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
            {restaurantProducts.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-ink-light mb-1">Pratos vendidos:</p>
                {restaurantProducts.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs pl-2 py-0.5">
                    <span className="text-ink-muted">{p.qty}× {p.name}</span>
                    <span className="font-medium">{p.total.toLocaleString('pt-AO')} Kz</span>
                  </div>
                ))}
              </div>
            )}
            {barProducts.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-ink-light mb-1">Produtos do bar vendidos:</p>
                {barProducts.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs pl-2 py-0.5">
                    <span className="text-ink-muted">{p.qty}× {p.name}</span>
                    <span className="font-medium">{p.total.toLocaleString('pt-AO')} Kz</span>
                  </div>
                ))}
              </div>
            )}
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

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Discriminação — Banco (TPA / Transferência)</h2>
            {quartosTpaPorBanco.map((b, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="text-ink-muted">Quartos — TPA {b.bank}</span><span className="font-medium">{formatKz(b.value)} Kz</span></div>
            ))}
            {quartosTransferencia > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Quartos — Transferência</span><span className="font-medium">{formatKz(quartosTransferencia)} Kz</span></div>
            )}
            {lavandariaTpaTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Lavandaria — TPA ({joinBanks(lavandariaTpaBancos)})</span><span className="font-medium">{formatKz(lavandariaTpaTotal)} Kz</span></div>
            )}
            {refeicoesTpaTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Sala de Refeições — TPA ({joinBanks(refeicoesTpaBancos)})</span><span className="font-medium">{formatKz(refeicoesTpaTotal)} Kz</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em banco</span><span>{formatKz(totalBanco)} Kz</span>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Discriminação — Numerário</h2>
            {quartosNumerario > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Quartos</span><span className="font-medium">{formatKz(quartosNumerario)} Kz</span></div>
            )}
            {lavandariaNumerario > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Lavandaria</span><span className="font-medium">{formatKz(lavandariaNumerario)} Kz</span></div>
            )}
            {refeicoesNumerarioTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Sala de Refeições</span><span className="font-medium">{formatKz(refeicoesNumerarioTotal)} Kz</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em numerário</span><span>{formatKz(totalNumerario)} Kz</span>
            </div>
          </div>

          <div className="card border-brand-200 bg-brand-50">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-ink">Total do Dia</span>
              <span className="text-xl font-bold text-brand-600">{totalGeral.toLocaleString('pt-AO')} Kz</span>
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Fecho</h2>
            <div>
              <label className="label">Valor do IVA (opcional, por confirmar)</label>
              <input type="text" className="input" placeholder="Deixar em branco por agora" value={iva} onChange={e => setIva(e.target.value)} />
            </div>
            <div>
              <label className="label">Att: (assinatura)</label>
              <input type="text" className="input" placeholder="Nome de quem envia o relatório" value={assinatura} onChange={e => setAssinatura(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={marcarRevisto} disabled={saving} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
              {saved ? <><CheckCircle size={16}/> Revisto</> : saving ? 'A gravar...' : 'Marcar como Revisto'}
            </button>
            <button onClick={copiarTexto} className="btn-secondary px-5 py-3 flex items-center gap-2">
              <MessageCircle size={16} /> Copiar
            </button>
            <button onClick={baixarPdf} className="btn-secondary px-5 py-3 flex items-center gap-2">
              <Download size={16} /> PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}
