'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, RefreshCw, CheckCircle, Send, Download } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const BANKS = ['BIC', 'BFA', 'BAI']

function getCurrentDiaryDate(): Date {
  const now = new Date()
  const angolaHour = (now.getUTCHours() + 1) % 24
  if (angolaHour < 12) {
    const yesterday = new Date(now)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return yesterday
  }
  return now
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Período da diária: 12h00 de Angola (11h UTC) até às 11h00 do dia seguinte (10h UTC) — igual à função generate_daily_summary
function diaryWindow(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, d, 11, 0, 0)),
    end: new Date(Date.UTC(y, m - 1, d + 1, 10, 0, 0)),
    midnight: new Date(Date.UTC(y, m - 1, d, 23, 0, 0)), // 00h de Angola: a noite da diária
  }
}

function iso(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
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
type QtyLine = { name: string; qty: number }
type CreditLine = { company: string; hospedagem: number; restaurante: number; bar: number; lavandaria: number; total: number }
type PersonLine = { number: string; guest: string }

type Live = {
  quartosOcupados: number
  numHospedes: number
  categorias: { label: string; count: number }[]
  checkins: PersonLine[]
  checkouts: PersonLine[]
  breakfastCount: number
  restHospede: number
  restNaoHospede: number
  barHospede: number
  barNaoHospede: number
  restProducts: ItemLine[]
  barProducts: ItemLine[]
  quartosTpaPorBanco: BankLine[]
  quartosTransferencia: number
  quartosNumerario: number
  lavTpaBancos: string[]
  lavTpaTotal: number
  lavNumerario: number
  refTpaBancos: string[]
  refTpaTotal: number
  refTpaItens: QtyLine[]
  refNumTotal: number
  refNumItens: QtyLine[]
  creditos: CreditLine[]
}

const emptyLive: Live = {
  quartosOcupados: 0, numHospedes: 0, categorias: [], checkins: [], checkouts: [], breakfastCount: 0,
  restHospede: 0, restNaoHospede: 0, barHospede: 0, barNaoHospede: 0, restProducts: [], barProducts: [],
  quartosTpaPorBanco: [], quartosTransferencia: 0, quartosNumerario: 0,
  lavTpaBancos: [], lavTpaTotal: 0, lavNumerario: 0,
  refTpaBancos: [], refTpaTotal: 0, refTpaItens: [], refNumTotal: 0, refNumItens: [],
  creditos: [],
}

function sumBar(sale: any) {
  return (sale.bar_sale_items ?? []).reduce((s: number, it: any) => s + Number(it.subtotal), 0)
}

function mergeQty(a: QtyLine[], b: QtyLine[]): QtyLine[] {
  const out = a.map(x => ({ ...x }))
  b.forEach(cur => {
    const ex = out.find(x => x.name === cur.name)
    if (ex) ex.qty += cur.qty
    else out.push({ ...cur })
  })
  return out
}

async function loadLive(supabase: any, dateStr: string): Promise<Live> {
  const { start, end, midnight } = diaryWindow(dateStr)
  const s = iso(start), e = iso(end), mid = iso(midnight)

  const [
    { data: checkinsData },
    { data: checkoutsData },
    { data: staysData },
    { data: stayPayments },
    { data: laundryPayments },
    { data: restSales },
    { data: barSales },
    { data: restItems },
    { data: barItems },
    { data: creditStays },
    { data: creditRest },
    { data: creditBar },
    { data: creditLaundry },
    { data: breakfastData },
  ] = await Promise.all([
    supabase.from('stays').select('rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_in_at', s).lt('check_in_at', e),
    supabase.from('stays').select('rooms(number), guests(full_name, surname)').eq('property_id', PROPERTY_ID).gte('check_out_at', s).lt('check_out_at', e),
    supabase.from('stays').select('occupancy, billed_to, companies(name)').eq('property_id', PROPERTY_ID).lte('check_in_at', mid).or(`check_out_at.is.null,check_out_at.gt.${mid}`),
    supabase.from('payments').select('amount, method, bank_name').eq('property_id', PROPERTY_ID).eq('source_type', 'stay').gte('paid_at', s).lt('paid_at', e),
    supabase.from('payments').select('amount, method, bank_name').eq('property_id', PROPERTY_ID).eq('source_type', 'laundry').gte('paid_at', s).lt('paid_at', e),
    supabase.from('restaurant_sales').select('value, guest_type, payment_method, bank_name').eq('property_id', PROPERTY_ID).gte('created_at', s).lt('created_at', e),
    supabase.from('bar_sales').select('guest_type, payment_method, bank_name, bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).gte('created_at', s).lt('created_at', e),
    supabase.from('restaurant_sale_items').select('quantity, subtotal, menu_items(name), restaurant_sales!inner(created_at, property_id, payment_method)').eq('restaurant_sales.property_id', PROPERTY_ID).gte('restaurant_sales.created_at', s).lt('restaurant_sales.created_at', e),
    supabase.from('bar_sale_items').select('quantity, subtotal, bar_products(name), bar_sales!inner(created_at, property_id, payment_method)').eq('bar_sales.property_id', PROPERTY_ID).gte('bar_sales.created_at', s).lt('bar_sales.created_at', e),
    supabase.from('stays').select('room_value, companies(name)').eq('property_id', PROPERTY_ID).eq('billed_to', 'empresa').lte('check_in_at', mid).or(`check_out_at.is.null,check_out_at.gt.${mid}`),
    supabase.from('restaurant_sales').select('value, companies(name)').eq('property_id', PROPERTY_ID).gte('created_at', s).lt('created_at', e).not('company_id', 'is', null),
    supabase.from('bar_sales').select('companies(name), bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).gte('created_at', s).lt('created_at', e).not('company_id', 'is', null),
    supabase.from('laundry_records').select('value, companies(name)').eq('property_id', PROPERTY_ID).gte('created_at', s).lt('created_at', e).not('company_id', 'is', null),
    supabase.from('breakfast_records').select('id').eq('property_id', PROPERTY_ID).eq('confirmed', true).gte('created_at', s).lt('created_at', e),
  ])

  const live: Live = { ...emptyLive }

  const person = (x: any): PersonLine => ({ number: x.rooms?.number, guest: `${x.guests?.full_name ?? ''} ${x.guests?.surname ?? ''}`.trim() })
  live.checkins = (checkinsData ?? []).map(person)
  live.checkouts = (checkoutsData ?? []).map(person)
  live.breakfastCount = (breakfastData ?? []).length

  // Ocupação na noite da diária
  const stays = staysData ?? []
  live.quartosOcupados = stays.length
  live.numHospedes = stays.reduce((sum: number, st: any) => sum + occupancyGuests(st.occupancy), 0)
  const catMap: Record<string, number> = {}
  stays.forEach((st: any) => {
    const label = st.billed_to === 'empresa' && st.companies?.name ? st.companies.name : occupancyLabel(st.occupancy)
    catMap[label] = (catMap[label] || 0) + 1
  })
  live.categorias = Object.entries(catMap).map(([label, count]) => ({ label, count }))

  // Sala de refeições por tipo de cliente
  live.restHospede = (restSales ?? []).filter((r: any) => r.guest_type === 'hospede').reduce((a: number, r: any) => a + Number(r.value), 0)
  live.restNaoHospede = (restSales ?? []).filter((r: any) => r.guest_type !== 'hospede').reduce((a: number, r: any) => a + Number(r.value), 0)
  live.barHospede = (barSales ?? []).filter((b: any) => b.guest_type === 'hospede').reduce((a: number, b: any) => a + sumBar(b), 0)
  live.barNaoHospede = (barSales ?? []).filter((b: any) => b.guest_type !== 'hospede').reduce((a: number, b: any) => a + sumBar(b), 0)

  // Produtos vendidos
  function aggregate(items: any[], key: 'menu_items' | 'bar_products'): ItemLine[] {
    const map: Record<string, { qty: number; total: number }> = {}
    ;(items ?? []).forEach((it: any) => {
      const name = it[key]?.name ?? 'Item removido'
      if (!map[name]) map[name] = { qty: 0, total: 0 }
      map[name].qty += Number(it.quantity)
      map[name].total += Number(it.subtotal)
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total)
  }
  live.restProducts = aggregate(restItems ?? [], 'menu_items')
  live.barProducts = aggregate(barItems ?? [], 'bar_products')

  // Quartos: pagamentos por método/banco
  const qTpa: Record<string, number> = {}
  ;(stayPayments ?? []).forEach((p: any) => {
    if (p.method === 'tpa' && p.bank_name) qTpa[p.bank_name] = (qTpa[p.bank_name] || 0) + Number(p.amount)
    else if (p.method === 'transferencia') live.quartosTransferencia += Number(p.amount)
    else if (p.method === 'numerario') live.quartosNumerario += Number(p.amount)
  })
  live.quartosTpaPorBanco = BANKS.filter(b => qTpa[b] > 0).map(b => ({ bank: b, value: qTpa[b] }))

  // Lavandaria
  const lavBanks = new Set<string>()
  ;(laundryPayments ?? []).forEach((p: any) => {
    if (p.method === 'tpa' && p.bank_name) { live.lavTpaTotal += Number(p.amount); lavBanks.add(p.bank_name) }
    else if (p.method === 'transferencia') live.lavTpaTotal += Number(p.amount)
    else if (p.method === 'numerario') live.lavNumerario += Number(p.amount)
  })
  live.lavTpaBancos = BANKS.filter(b => lavBanks.has(b))

  // Sala de refeições: pagamentos por método/banco (só vendas pagas na hora)
  const refBanks = new Set<string>()
  ;(restSales ?? []).forEach((r: any) => {
    const v = Number(r.value)
    if (r.payment_method === 'tpa') { live.refTpaTotal += v; if (r.bank_name) refBanks.add(r.bank_name) }
    else if (r.payment_method === 'transferencia') live.refTpaTotal += v
    else if (r.payment_method === 'numerario') live.refNumTotal += v
  })
  ;(barSales ?? []).forEach((b: any) => {
    const v = sumBar(b)
    if (b.payment_method === 'tpa') { live.refTpaTotal += v; if (b.bank_name) refBanks.add(b.bank_name) }
    else if (b.payment_method === 'transferencia') live.refTpaTotal += v
    else if (b.payment_method === 'numerario') live.refNumTotal += v
  })
  live.refTpaBancos = BANKS.filter(b => refBanks.has(b))

  function qtyBy(items: any[], key: 'menu_items' | 'bar_products', parentKey: 'restaurant_sales' | 'bar_sales', ok: (m: string) => boolean): QtyLine[] {
    const map: Record<string, number> = {}
    ;(items ?? []).forEach((it: any) => {
      if (!ok(it[parentKey]?.payment_method)) return
      const name = it[key]?.name ?? 'Item removido'
      map[name] = (map[name] || 0) + Number(it.quantity)
    })
    return Object.entries(map).map(([name, qty]) => ({ name, qty }))
  }
  const banco = (m: string) => m === 'tpa' || m === 'transferencia'
  const numer = (m: string) => m === 'numerario'
  live.refTpaItens = mergeQty(qtyBy(restItems ?? [], 'menu_items', 'restaurant_sales', banco), qtyBy(barItems ?? [], 'bar_products', 'bar_sales', banco))
  live.refNumItens = mergeQty(qtyBy(restItems ?? [], 'menu_items', 'restaurant_sales', numer), qtyBy(barItems ?? [], 'bar_products', 'bar_sales', numer))

  // Créditos a empresas
  const creditMap: Record<string, CreditLine> = {}
  const entry = (name: string) => {
    if (!creditMap[name]) creditMap[name] = { company: name, hospedagem: 0, restaurante: 0, bar: 0, lavandaria: 0, total: 0 }
    return creditMap[name]
  }
  ;(creditStays ?? []).forEach((x: any) => { if (x.companies?.name) entry(x.companies.name).hospedagem += Number(x.room_value) })
  ;(creditRest ?? []).forEach((x: any) => { if (x.companies?.name) entry(x.companies.name).restaurante += Number(x.value) })
  ;(creditBar ?? []).forEach((x: any) => { if (x.companies?.name) entry(x.companies.name).bar += sumBar(x) })
  ;(creditLaundry ?? []).forEach((x: any) => { if (x.companies?.name) entry(x.companies.name).lavandaria += Number(x.value) })
  live.creditos = Object.values(creditMap).map(c => ({ ...c, total: c.hospedagem + c.restaurante + c.bar + c.lavandaria }))

  return live
}

export default function RelatorioPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<any>(null)
  const [live, setLive] = useState<Live>(emptyLive)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [iva, setIva] = useState('')
  const [assinatura, setAssinatura] = useState('')

  const currentDiary = getCurrentDiaryDate()
  const previousDiary = new Date(currentDiary)
  previousDiary.setDate(previousDiary.getDate() - 1)
  const reportDate = toLocalDateString(previousDiary)

  const now = new Date()
  const angolaHour = (now.getUTCHours() + 1) % 24
  const isInCurrentDiary = angolaHour >= 12

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)
      await loadSummary(supabase)
      setLive(await loadLive(supabase, reportDate))
      setLoading(false)
    }
    load()
  }, [router])

  async function loadSummary(supabase: any) {
    const { data } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .eq('summary_date', reportDate)
      .single()
    setSummary(data ?? null)
  }

  async function generateSummary() {
    setGenerating(true)
    const supabase = createClient()
    await supabase.rpc('generate_daily_summary', {
      p_property_id: PROPERTY_ID,
      p_date: reportDate,
    })
    await loadSummary(supabase)
    setLive(await loadLive(supabase, reportDate))
    setGenerating(false)
  }

  async function markAsReviewed() {
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_summaries')
      .update({ status: 'revisto', reviewed_by: staffId, reviewed_at: new Date().toISOString() })
      .eq('id', summary.id).select().single()
    setSummary(data)
  }

  async function markAsSent() {
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_summaries')
      .update({ status: 'enviado', sent_at: new Date().toISOString() })
      .eq('id', summary.id).select().single()
    setSummary(data)
  }

  const totalBanco = live.quartosTpaPorBanco.reduce((a, b) => a + b.value, 0) + live.quartosTransferencia + live.lavTpaTotal + live.refTpaTotal
  const totalNumerario = live.quartosNumerario + live.lavNumerario + live.refNumTotal
  const totalCredito = live.creditos.reduce((a, c) => a + c.total, 0)

  // Texto no formato usado na hospedaria (para WhatsApp)
  function textoRelatorio() {
    const [y, m, d] = reportDate.split('-')
    let txt = `Relatório da hospedaria\n${d}-${m}-${y}\n\n`
    txt += ` Quartos ocupados:${live.quartosOcupados}\n Número de Hóspedes:${live.numHospedes}\n\n`
    live.categorias.forEach(c => txt += `${c.label}:${c.count}\n`)
    txt += `\n`

    live.quartosTpaPorBanco.forEach(b => {
      txt += `Vendas no TPA do ${b.bank} pagamento de quartos no valor:${formatKz(b.value)}\n\n`
    })
    if (live.quartosTransferencia > 0) txt += `Transferência bancária pagamento de quartos no valor:${formatKz(live.quartosTransferencia)}\n\n`
    if (live.lavTpaTotal > 0) txt += `Pagamento no TPA ${joinBanks(live.lavTpaBancos)} serviço lavandaria no valor:${formatKz(live.lavTpaTotal)}\n\n`
    if (live.refTpaTotal > 0) {
      txt += `Vendas na sala de refeições nos TPA do ${joinBanks(live.refTpaBancos)} no valor:${formatKz(live.refTpaTotal)}\n`
      live.refTpaItens.forEach(it => txt += `${it.qty} ${it.name}\n`)
      txt += `\n`
    }
    txt += `Total em banco:${formatKz(totalBanco)}\n\n`

    if (live.refNumTotal > 0) {
      txt += `Venda em numerário pagamento na sala de refeições no valor:${formatKz(live.refNumTotal)}\n`
      live.refNumItens.forEach(it => txt += `${it.qty} ${it.name}\n`)
      txt += `\n`
    }
    if (live.quartosNumerario > 0) txt += `Venda em numerário pagamento de quartos no valor:${formatKz(live.quartosNumerario)}\n\n`
    if (live.lavNumerario > 0) txt += `Venda em numerário serviço lavandaria no valor:${formatKz(live.lavNumerario)}\n\n`
    txt += `Total em numerário: ${formatKz(totalNumerario)}\n\n`

    if (live.creditos.length > 0) {
      txt += `Clientes a crédito:\n`
      live.creditos.forEach(c => {
        const partes: string[] = []
        if (c.hospedagem > 0) partes.push(`hospedagem ${formatKz(c.hospedagem)}`)
        if (c.restaurante > 0) partes.push(`restaurante ${formatKz(c.restaurante)}`)
        if (c.bar > 0) partes.push(`bar ${formatKz(c.bar)}`)
        if (c.lavandaria > 0) partes.push(`lavandaria ${formatKz(c.lavandaria)}`)
        txt += `${c.company}: ${partes.join(', ')} — total ${formatKz(c.total)}\n`
      })
      txt += `Total a crédito: ${formatKz(totalCredito)}\n\n`
    }

    if (iva.trim()) txt += `Valor do IVA: ${iva}\n\n`
    txt += `Att: ${assinatura || '_____________'}`
    return txt
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(textoRelatorio())
    alert('Relatório copiado! Cola no WhatsApp.')
  }

  function baixarPdf() {
    if (!summary) return
    const diary = new Date(reportDate + 'T00:00:00')
    const next = new Date(diary)
    next.setDate(next.getDate() + 1)
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
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
    doc.text(`Relatório Diário — ${diary.toLocaleDateString('pt-AO')} 12h00 → ${next.toLocaleDateString('pt-AO')} 11h00`, marginX, 23)

    let y = 44
    function pageBreak(needed = 20) {
      if (y > pageHeight - needed) { doc.addPage(); y = 20 }
    }
    function title(t: string) {
      pageBreak(30)
      doc.setFillColor(...brand)
      doc.rect(marginX, y - 4, 2.5, 5, 'F')
      doc.setTextColor(...dark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(t, marginX + 5, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }
    function row(label: string, value: string) {
      pageBreak()
      doc.setTextColor(...gray)
      doc.text(label, marginX, y)
      doc.setTextColor(...dark)
      doc.text(value, pageWidth - marginX, y, { align: 'right' })
      y += 6
    }
    function small(t: string) {
      pageBreak()
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text(t, marginX + 4, y)
      y += 5
      doc.setFontSize(10)
    }
    function divider() {
      y += 2
      doc.setDrawColor(230, 230, 230)
      doc.line(marginX, y, pageWidth - marginX, y)
      y += 8
    }

    title('Ocupação')
    row('Quartos ocupados', String(live.quartosOcupados))
    row('Número de hóspedes', String(live.numHospedes))
    live.categorias.forEach(c => row(c.label, String(c.count)))
    divider()

    title('Receção')
    row('Check-ins', String(summary.total_checkins))
    live.checkins.forEach(c => small(`Entrada — Quarto ${c.number} — ${c.guest}`))
    row('Check-outs', String(summary.total_checkouts))
    live.checkouts.forEach(c => small(`Saída — Quarto ${c.number} — ${c.guest}`))
    divider()

    title('Receitas')
    row('Alojamento', `${Number(summary.total_revenue_rooms).toLocaleString('pt-AO')} Kz`)
    row('Lavandaria', `${Number(summary.total_revenue_laundry).toLocaleString('pt-AO')} Kz`)
    row('Restaurante', `${Number(summary.total_revenue_restaurant).toLocaleString('pt-AO')} Kz`)
    row('Bar', `${Number(summary.total_revenue_bar ?? 0).toLocaleString('pt-AO')} Kz`)
    row('Frigobar', `${Number(summary.total_revenue_minibar ?? 0).toLocaleString('pt-AO')} Kz`)
    row('Pequenos-almoços servidos', String(live.breakfastCount))
    divider()

    title('Sala de Refeições')
    row('Restaurante — hóspedes', `${live.restHospede.toLocaleString('pt-AO')} Kz`)
    row('Restaurante — não-hóspedes', `${live.restNaoHospede.toLocaleString('pt-AO')} Kz`)
    row('Bar — hóspedes', `${live.barHospede.toLocaleString('pt-AO')} Kz`)
    row('Bar — não-hóspedes', `${live.barNaoHospede.toLocaleString('pt-AO')} Kz`)
    if (live.restProducts.length > 0) {
      y += 1; small('Pratos vendidos:')
      live.restProducts.forEach(p => small(`${p.qty}x ${p.name} — ${p.total.toLocaleString('pt-AO')} Kz`))
    }
    if (live.barProducts.length > 0) {
      y += 1; small('Produtos do bar vendidos:')
      live.barProducts.forEach(p => small(`${p.qty}x ${p.name} — ${p.total.toLocaleString('pt-AO')} Kz`))
    }
    divider()

    title('Discriminação — Banco (TPA / Transferência)')
    live.quartosTpaPorBanco.forEach(b => row(`Quartos — TPA ${b.bank}`, `${formatKz(b.value)} Kz`))
    if (live.quartosTransferencia > 0) row('Quartos — Transferência', `${formatKz(live.quartosTransferencia)} Kz`)
    if (live.lavTpaTotal > 0) row(`Lavandaria — TPA (${joinBanks(live.lavTpaBancos)})`, `${formatKz(live.lavTpaTotal)} Kz`)
    if (live.refTpaTotal > 0) row(`Sala de Refeições — TPA (${joinBanks(live.refTpaBancos)})`, `${formatKz(live.refTpaTotal)} Kz`)
    row('Total em banco', `${formatKz(totalBanco)} Kz`)
    divider()

    title('Discriminação — Numerário')
    if (live.quartosNumerario > 0) row('Quartos', `${formatKz(live.quartosNumerario)} Kz`)
    if (live.lavNumerario > 0) row('Lavandaria', `${formatKz(live.lavNumerario)} Kz`)
    if (live.refNumTotal > 0) row('Sala de Refeições', `${formatKz(live.refNumTotal)} Kz`)
    row('Total em numerário', `${formatKz(totalNumerario)} Kz`)
    divider()

    if (live.creditos.length > 0) {
      title('Clientes a Crédito (empresas)')
      live.creditos.forEach(c => {
        row(c.company, `${formatKz(c.total)} Kz`)
        if (c.hospedagem > 0) small(`Hospedagem: ${formatKz(c.hospedagem)} Kz`)
        if (c.restaurante > 0) small(`Restaurante: ${formatKz(c.restaurante)} Kz`)
        if (c.bar > 0) small(`Bar: ${formatKz(c.bar)} Kz`)
        if (c.lavandaria > 0) small(`Lavandaria: ${formatKz(c.lavandaria)} Kz`)
      })
      row('Total a crédito', `${formatKz(totalCredito)} Kz`)
      divider()
    }

    pageBreak(50)
    doc.setFillColor(...brandLight)
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F')
    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Total Geral', marginX + 4, y + 10.5)
    doc.setTextColor(...brand)
    doc.setFontSize(14)
    doc.text(`${Number(summary.total_revenue_overall).toLocaleString('pt-AO')} Kz`, pageWidth - marginX - 4, y + 10.5, { align: 'right' })
    y += 24

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (iva.trim()) row('Valor do IVA', iva)
    row('Att', assinatura || '—')

    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')} pelo sistema de gestão S&I Freitas`, marginX, pageHeight - 10)
    doc.save(`relatorio-diario-${reportDate}.pdf`)
  }

  const statusColor: Record<string, string> = {
    rascunho: 'bg-yellow-100 text-yellow-700',
    revisto:  'bg-blue-100 text-blue-700',
    enviado:  'bg-green-100 text-green-700',
  }

  const diaryDate = new Date(reportDate + 'T00:00:00')
  const nextDay = new Date(diaryDate)
  nextDay.setDate(nextDay.getDate() + 1)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-ink-muted text-sm">A carregar...</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <FileText size={20} className="text-brand-500"/> Relatório Diário
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Diária de {diaryDate.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long' })} —
          das 12h00 às {nextDay.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long' })} 11h00
        </p>
      </div>

      {isInCurrentDiary && (
        <div className="card bg-brand-50 border-brand-200 text-sm text-brand-700 flex items-start gap-2">
          <span>ℹ️</span>
          <div>
            <p className="font-semibold">Diária actual ainda em curso</p>
            <p className="text-xs mt-0.5">
              Estás a ver o relatório do dia anterior (fechou às 11h00).
              A diária de hoje só estará disponível amanhã às 11h00.
            </p>
          </div>
        </div>
      )}

      {!summary ? (
        <div className="card text-center py-12 space-y-4">
          <FileText size={32} className="mx-auto text-ink-light opacity-40"/>
          <p className="text-ink-muted">Relatório ainda não gerado para este período.</p>
          <button onClick={generateSummary} disabled={generating}
            className="btn-primary mx-auto flex items-center gap-2">
            <RefreshCw size={15} className={generating ? 'animate-spin' : ''}/>
            {generating ? 'A gerar...' : 'Gerar relatório'}
          </button>
        </div>
      ) : (
        <>
          <div className="card space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">
                {diaryDate.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${statusColor[summary.status]}`}>
                {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
              </span>
            </div>

            <div className="bg-surface-muted rounded-lg px-3 py-2 text-xs text-ink-muted">
              Período: {diaryDate.toLocaleDateString('pt-AO')} 12h00 → {nextDay.toLocaleDateString('pt-AO')} 11h00
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ink">{summary.total_checkins}</div>
                <div className="text-xs text-ink-muted">Check-ins</div>
              </div>
              <div className="bg-surface-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ink">{summary.total_checkouts}</div>
                <div className="text-xs text-ink-muted">Check-outs</div>
              </div>
            </div>

            {(live.checkins.length > 0 || live.checkouts.length > 0) && (
              <div className="text-xs text-ink-muted space-y-0.5">
                {live.checkins.map((c, i) => <p key={`in${i}`}>Entrada — Quarto {c.number} — {c.guest}</p>)}
                {live.checkouts.map((c, i) => <p key={`out${i}`}>Saída — Quarto {c.number} — {c.guest}</p>)}
              </div>
            )}

            <div className="space-y-2 text-sm">
              {[
                ['Alojamento',  summary.total_revenue_rooms],
                ['Lavandaria',  summary.total_revenue_laundry],
                ['Restaurante', summary.total_revenue_restaurant],
                ['Bar',         summary.total_revenue_bar ?? 0],
                ['Frigobar',    summary.total_revenue_minibar ?? 0],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-medium">{Number(value).toLocaleString('pt-AO')} Kz</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-surface-border">
                <span className="text-ink-muted">Pequenos-almoços servidos</span>
                <span className="font-medium">{live.breakfastCount}</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-base">
                <span>Total Geral</span>
                <span className="text-brand-500">{Number(summary.total_revenue_overall).toLocaleString('pt-AO')} Kz</span>
              </div>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Ocupação (noite da diária)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-ink-light text-xs">Quartos ocupados</p><p className="font-semibold">{live.quartosOcupados}</p></div>
              <div><p className="text-ink-light text-xs">Número de hóspedes</p><p className="font-semibold">{live.numHospedes}</p></div>
            </div>
            <div className="pt-2 border-t border-border space-y-1">
              {live.categorias.map((c, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-ink-muted">{c.label}</span><span className="font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Sala de Refeições</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Restaurante — hóspedes</span><span className="font-medium">{live.restHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Restaurante — não-hóspedes</span><span className="font-medium">{live.restNaoHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Bar — hóspedes</span><span className="font-medium">{live.barHospede.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Bar — não-hóspedes</span><span className="font-medium">{live.barNaoHospede.toLocaleString('pt-AO')} Kz</span></div>
            </div>
            {live.restProducts.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-ink-light mb-1">Pratos vendidos:</p>
                {live.restProducts.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs pl-2 py-0.5">
                    <span className="text-ink-muted">{p.qty}× {p.name}</span><span className="font-medium">{p.total.toLocaleString('pt-AO')} Kz</span>
                  </div>
                ))}
              </div>
            )}
            {live.barProducts.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-ink-light mb-1">Produtos do bar vendidos:</p>
                {live.barProducts.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs pl-2 py-0.5">
                    <span className="text-ink-muted">{p.qty}× {p.name}</span><span className="font-medium">{p.total.toLocaleString('pt-AO')} Kz</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Discriminação — Banco (TPA / Transferência)</h2>
            {live.quartosTpaPorBanco.map((b, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="text-ink-muted">Quartos — TPA {b.bank}</span><span className="font-medium">{formatKz(b.value)} Kz</span></div>
            ))}
            {live.quartosTransferencia > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Quartos — Transferência</span><span className="font-medium">{formatKz(live.quartosTransferencia)} Kz</span></div>
            )}
            {live.lavTpaTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Lavandaria — TPA ({joinBanks(live.lavTpaBancos)})</span><span className="font-medium">{formatKz(live.lavTpaTotal)} Kz</span></div>
            )}
            {live.refTpaTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Sala de Refeições — TPA ({joinBanks(live.refTpaBancos)})</span><span className="font-medium">{formatKz(live.refTpaTotal)} Kz</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em banco</span><span>{formatKz(totalBanco)} Kz</span>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Discriminação — Numerário</h2>
            {live.quartosNumerario > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Quartos</span><span className="font-medium">{formatKz(live.quartosNumerario)} Kz</span></div>
            )}
            {live.lavNumerario > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Lavandaria</span><span className="font-medium">{formatKz(live.lavNumerario)} Kz</span></div>
            )}
            {live.refNumTotal > 0 && (
              <div className="flex justify-between text-sm"><span className="text-ink-muted">Sala de Refeições</span><span className="font-medium">{formatKz(live.refNumTotal)} Kz</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em numerário</span><span>{formatKz(totalNumerario)} Kz</span>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Clientes a Crédito (empresas)</h2>
            {live.creditos.length === 0 ? (
              <p className="text-sm text-ink-muted">Sem consumos a crédito nesta diária.</p>
            ) : (
              <>
                {live.creditos.map((c, i) => (
                  <div key={i} className="pb-2 border-b border-border last:border-0">
                    <div className="flex justify-between text-sm font-medium"><span>{c.company}</span><span>{formatKz(c.total)} Kz</span></div>
                    <div className="pl-2 space-y-0.5 mt-1 text-xs text-ink-muted">
                      {c.hospedagem > 0 && <div className="flex justify-between"><span>Hospedagem</span><span>{formatKz(c.hospedagem)} Kz</span></div>}
                      {c.restaurante > 0 && <div className="flex justify-between"><span>Restaurante</span><span>{formatKz(c.restaurante)} Kz</span></div>}
                      {c.bar > 0 && <div className="flex justify-between"><span>Bar</span><span>{formatKz(c.bar)} Kz</span></div>}
                      {c.lavandaria > 0 && <div className="flex justify-between"><span>Lavandaria</span><span>{formatKz(c.lavandaria)} Kz</span></div>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-1 font-semibold text-sm">
                  <span>Total a crédito</span><span>{formatKz(totalCredito)} Kz</span>
                </div>
              </>
            )}
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

          <div className="space-y-2">
            <button onClick={generateSummary} disabled={generating || summary.status === 'enviado'}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <RefreshCw size={14} className={generating ? 'animate-spin' : ''}/>
              Actualizar dados
            </button>
            <button onClick={baixarPdf}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <Download size={14}/> Descarregar PDF
            </button>
            {summary.status === 'rascunho' && (
              <button onClick={markAsReviewed}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-sm border-blue-300 text-blue-600 hover:bg-blue-50">
                <CheckCircle size={14}/> Marcar como revisto
              </button>
            )}
            {summary.status === 'revisto' && (
              <>
                <button onClick={copyToClipboard}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  <Send size={14}/> Copiar resumo para WhatsApp
                </button>
                <button onClick={markAsSent}
                  className="btn-secondary w-full text-sm text-green-600 border-green-300 hover:bg-green-50">
                  Confirmar envio ao patrão
                </button>
              </>
            )}
            {summary.status === 'enviado' && (
              <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700 text-sm">
                <CheckCircle size={16}/> Relatório enviado ao patrão.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
