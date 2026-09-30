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
type ItemLine = { name: string; qty: number }

export default function RelatorioDiarioPage() {
  const [staffId, setStaffId] = useState('')
  const [date, setDate] = useState(yesterday())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [assinatura, setAssinatura] = useState('')
  const [iva, setIva] = useState('')

  const [quartosOcupados, setQuartosOcupados] = useState(0)
  const [numHospedes, setNumHospedes] = useState(0)
  const [categorias, setCategorias] = useState<{ label: string; count: number }[]>([])

  const [quartosTpaPorBanco, setQuartosTpaPorBanco] = useState<BankLine[]>([])
  const [quartosTransferencia, setQuartosTransferencia] = useState(0)
  const [quartosNumerario, setQuartosNumerario] = useState(0)

  const [lavandariaTpaBancos, setLavandariaTpaBancos] = useState<string[]>([])
  const [lavandariaTpaTotal, setLavandariaTpaTotal] = useState(0)
  const [lavandariaNumerario, setLavandariaNumerario] = useState(0)

  const [refeicoesTpaBancos, setRefeicoesTpaBancos] = useState<string[]>([])
  const [refeicoesTpaTotal, setRefeicoesTpaTotal] = useState(0)
  const [refeicoesTpaItens, setRefeicoesTpaItens] = useState<ItemLine[]>([])
  const [refeicoesNumerarioTotal, setRefeicoesNumerarioTotal] = useState(0)
  const [refeicoesNumerarioItens, setRefeicoesNumerarioItens] = useState<ItemLine[]>([])

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

    // --- Ocupação: estadias activas ao longo desse dia ---
    const { data: staysData } = await supabase
      .from('stays')
      .select('occupancy, billed_to, companies(name)')
      .eq('property_id', PROPERTY_ID)
      .lte('check_in_at', dayEnd)
      .or(`check_out_at.is.null,check_out_at.gt.${dayEnd}`)

    const stays = staysData ?? []
    setQuartosOcupados(stays.length)
    setNumHospedes(stays.reduce((sum: number, s: any) => sum + occupancyGuests(s.occupancy), 0))

    const catMap: Record<string, number> = {}
    stays.forEach((s: any) => {
      const label = s.billed_to === 'empresa' && s.companies?.name ? s.companies.name : occupancyLabel(s.occupancy)
      catMap[label] = (catMap[label] || 0) + 1
    })
    setCategorias(Object.entries(catMap).map(([label, count]) => ({ label, count })))

    // --- Pagamentos de quartos (payments source_type=stay) ---
    const { data: stayPayments } = await supabase
      .from('payments')
      .select('amount, method, bank_name')
      .eq('property_id', PROPERTY_ID)
      .eq('source_type', 'stay')
      .gte('paid_at', dayStart)
      .lte('paid_at', dayEnd)

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

    // --- Pagamentos de lavandaria ---
    const { data: laundryPayments } = await supabase
      .from('payments')
      .select('amount, method, bank_name')
      .eq('property_id', PROPERTY_ID)
      .eq('source_type', 'laundry')
      .gte('paid_at', dayStart)
      .lte('paid_at', dayEnd)

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

    // --- Sala de Refeições: vendas do restaurante e do bar desse dia ---
    const [{ data: restSales }, { data: barSales }] = await Promise.all([
      supabase.from('restaurant_sales').select('value, payment_method, bank_name').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
      supabase.from('bar_sales').select('id, payment_method, bank_name, bar_sale_items(subtotal)').eq('property_id', PROPERTY_ID).eq('record_date', selectedDate),
    ])

    let refTpaTotal = 0, refNum = 0
    const refBanksSet = new Set<string>()
    ;(restSales ?? []).forEach((s: any) => {
      if (s.payment_method === 'tpa') { refTpaTotal += Number(s.value); if (s.bank_name) refBanksSet.add(s.bank_name) }
      else if (s.payment_method === 'transferencia') refTpaTotal += Number(s.value)
      else if (s.payment_method === 'numerario') refNum += Number(s.value)
    })
    ;(barSales ?? []).forEach((s: any) => {
      const val = (s.bar_sale_items ?? []).reduce((sum: number, it: any) => sum + Number(it.subtotal), 0)
      if (s.payment_method === 'tpa') { refTpaTotal += val; if (s.bank_name) refBanksSet.add(s.bank_name) }
      else if (s.payment_method === 'transferencia') refTpaTotal += val
      else if (s.payment_method === 'numerario') refNum += val
    })
    setRefeicoesTpaBancos(BANKS.filter(b => refBanksSet.has(b)))
    setRefeicoesTpaTotal(refTpaTotal)
    setRefeicoesNumerarioTotal(refNum)

    // Itens vendidos — restaurante, separados por TPA e Numerário
    const [{ data: restItemsTpa }, { data: restItemsNum }, { data: barItemsTpa }, { data: barItemsNum }] = await Promise.all([
      supabase.from('restaurant_sale_items').select('quantity, menu_items(name), restaurant_sales!inner(record_date, property_id, payment_method)').eq('restaurant_sales.property_id', PROPERTY_ID).eq('restaurant_sales.record_date', selectedDate).in('restaurant_sales.payment_method', ['tpa', 'transferencia']),
      supabase.from('restaurant_sale_items').select('quantity, menu_items(name), restaurant_sales!inner(record_date, property_id, payment_method)').eq('restaurant_sales.property_id', PROPERTY_ID).eq('restaurant_sales.record_date', selectedDate).eq('restaurant_sales.payment_method', 'numerario'),
      supabase.from('bar_sale_items').select('quantity, bar_products(name), bar_sales!inner(record_date, property_id, payment_method)').eq('bar_sales.property_id', PROPERTY_ID).eq('bar_sales.record_date', selectedDate).in('bar_sales.payment_method', ['tpa', 'transferencia']),
      supabase.from('bar_sale_items').select('quantity, bar_products(name), bar_sales!inner(record_date, property_id, payment_method)').eq('bar_sales.property_id', PROPERTY_ID).eq('bar_sales.record_date', selectedDate).eq('bar_sales.payment_method', 'numerario'),
    ])

    function aggregateItems(restItems: any[], barItems: any[]): ItemLine[] {
      const map: Record<string, number> = {}
      ;(restItems ?? []).forEach((it: any) => {
        const name = it.menu_items?.name ?? 'Item removido'
        map[name] = (map[name] || 0) + Number(it.quantity)
      })
      ;(barItems ?? []).forEach((it: any) => {
        const name = it.bar_products?.name ?? 'Item removido'
        map[name] = (map[name] || 0) + Number(it.quantity)
      })
      return Object.entries(map).map(([name, qty]) => ({ name, qty }))
    }

    setRefeicoesTpaItens(aggregateItems(restItemsTpa ?? [], barItemsTpa ?? []))
    setRefeicoesNumerarioItens(aggregateItems(restItemsNum ?? [], barItemsNum ?? []))

    setLoading(false)
  }

  useEffect(() => { loadReport(date) }, [date])

  const totalBanco = quartosTpaPorBanco.reduce((s, b) => s + b.value, 0) + quartosTransferencia + lavandariaTpaTotal + refeicoesTpaTotal
  const totalNumerario = quartosNumerario + lavandariaNumerario + refeicoesNumerarioTotal

  async function marcarRevisto() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('daily_summaries').upsert({
      property_id: PROPERTY_ID,
      summary_date: date,
      total_checkins: 0,
      total_checkouts: 0,
      total_revenue_rooms: quartosTpaPorBanco.reduce((s, b) => s + b.value, 0) + quartosTransferencia + quartosNumerario,
      total_revenue_breakfast: 0,
      total_revenue_laundry: lavandariaTpaTotal + lavandariaNumerario,
      total_revenue_restaurant: refeicoesTpaTotal + refeicoesNumerarioTotal,
      total_revenue_bar: 0,
      total_revenue_minibar: 0,
      total_revenue_overall: totalBanco + totalNumerario,
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
    if (quartosNumerario > 0) {
      txt += `Venda em numerário pagamento de quartos no valor:${formatKz(quartosNumerario)}\n\n`
    }
    if (lavandariaNumerario > 0) {
      txt += `Venda em numerário serviço lavandaria no valor:${formatKz(lavandariaNumerario)}\n\n`
    }

    txt += `Total em numerário: ${formatKz(totalNumerario)}\n\n`

    if (iva.trim()) {
      txt += `Valor do IVA: ${iva}\n\n`
    }

    txt += `Att: ${assinatura || '_____________'}`
    return txt
  }

  async function copiarTexto() {
    await navigator.clipboard.writeText(textoRelatorio())
    alert('Relatório copiado! Cola no WhatsApp.')
  }

  function baixarPdf() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const marginX = 14
    doc.setFont('courier', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(31, 41, 55)
    const lines = doc.splitTextToSize(textoRelatorio(), pageWidth - marginX * 2)
    doc.text(lines, marginX, 20)
    doc.save(`relatorio-diario-${date}.pdf`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <FileText size={20} className="text-brand-500" /> Relatório Diário
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">No formato usado na hospedaria</p>
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

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Em Banco (TPA / Transferência)</h2>
            {quartosTpaPorBanco.map((b, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ink-muted">Quartos — TPA {b.bank}</span>
                <span className="font-medium">{formatKz(b.value)} Kz</span>
              </div>
            ))}
            {quartosTransferencia > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Quartos — Transferência</span>
                <span className="font-medium">{formatKz(quartosTransferencia)} Kz</span>
              </div>
            )}
            {lavandariaTpaTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Lavandaria — TPA ({joinBanks(lavandariaTpaBancos)})</span>
                <span className="font-medium">{formatKz(lavandariaTpaTotal)} Kz</span>
              </div>
            )}
            {refeicoesTpaTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Sala de Refeições — TPA ({joinBanks(refeicoesTpaBancos)})</span>
                <span className="font-medium">{formatKz(refeicoesTpaTotal)} Kz</span>
              </div>
            )}
            {refeicoesTpaItens.length > 0 && (
              <div className="pl-2 space-y-0.5">
                {refeicoesTpaItens.map((it, i) => (
                  <p key={i} className="text-xs text-ink-muted">{it.qty} {it.name}</p>
                ))}
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em banco</span><span>{formatKz(totalBanco)} Kz</span>
            </div>
          </div>

          <div className="card space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Numerário</h2>
            {refeicoesNumerarioTotal > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Sala de Refeições</span>
                  <span className="font-medium">{formatKz(refeicoesNumerarioTotal)} Kz</span>
                </div>
                <div className="pl-2 space-y-0.5">
                  {refeicoesNumerarioItens.map((it, i) => (
                    <p key={i} className="text-xs text-ink-muted">{it.qty} {it.name}</p>
                  ))}
                </div>
              </>
            )}
            {quartosNumerario > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Quartos</span>
                <span className="font-medium">{formatKz(quartosNumerario)} Kz</span>
              </div>
            )}
            {lavandariaNumerario > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Lavandaria</span>
                <span className="font-medium">{formatKz(lavandariaNumerario)} Kz</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
              <span>Total em numerário</span><span>{formatKz(totalNumerario)} Kz</span>
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
