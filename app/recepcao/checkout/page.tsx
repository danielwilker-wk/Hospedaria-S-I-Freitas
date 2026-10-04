'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Search, CheckCircle, Wallet, ShirtIcon, UtensilsCrossed, Wine, FileDown, Plus, Building2, X } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const BANK_OPTIONS = ['BIC', 'BFA', 'BAI', 'BCI', 'BNI', 'ATLANTICO']

type MinibarProduct = { id: string; name: string; price: number }

// Categorias de consumo (iguais às usadas em stay_charges.charge_type)
type Cat = 'lavandaria' | 'restaurante' | 'bar' | 'frigobar' | 'outro'
const CAT_ORDER: Cat[] = ['lavandaria', 'restaurante', 'bar', 'frigobar', 'outro']
const catLabel: Record<Cat, string> = {
  lavandaria: 'Lavandaria',
  restaurante: 'Restaurante',
  bar: 'Bar',
  frigobar: 'Frigobar',
  outro: 'Hospedagem extra / outros',
}

// Cada linha de consumo está na conta da empresa (empresa = true) ou na conta pessoal do hóspede
type Line = { cat: Cat; amount: number; empresa: boolean; chargeId?: string; label?: string }

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    stay: 'Hospedagem', laundry: 'Lavandaria',
    restaurant: 'Restaurante', bar: 'Bar', minibar: 'Frigobar',
  }
  return labels[source] ?? source
}

function methodLabel(method: string, bank?: string | null) {
  const labels: Record<string, string> = {
    numerario: 'Numerário', tpa: 'TPA', transferencia: 'Transferência',
  }
  const base = labels[method] ?? method
  return method === 'tpa' && bank ? `${base} ${bank}` : base
}

const kz = (n: number) => `${n.toLocaleString('pt-AO')} Kz`

// Calcula o número de diárias entre check-in e check-out previsto
// Lógica: cada diária começa às 12h e termina às 11h do dia seguinte
// Se não houver check-out previsto, usa a data actual
function calcDiarias(checkIn: string, checkOutPlanned?: string | null): number {
  const inDate = new Date(checkIn)
  const outDate = checkOutPlanned ? new Date(checkOutPlanned) : new Date()
  const inDay = new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate())
  const outDay = new Date(outDate.getFullYear(), outDate.getMonth(), outDate.getDate())
  const diff = Math.round((outDay.getTime() - inDay.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

type ActiveStay = {
  id: string
  room_id: string
  room_value: number
  amount_paid_reservation: number
  check_in_at: string
  check_out_planned_at?: string | null
  billed_to: string
  company_id?: string | null
  rooms: { number: string; room_types: { name: string } }
  guests: { full_name: string; surname: string | null; document_number: string | null }
  companies?: { name: string } | null
}

export default function CheckOutPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ActiveStay[]>([])
  const [stay, setStay] = useState<ActiveStay | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [paymentsMade, setPaymentsMade] = useState(0)
  const [paymentsList, setPaymentsList] = useState<any[]>([])
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  // Pagamento directo (conta pessoal)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentMethod, setNewPaymentMethod] = useState('numerario')
  const [newPaymentBank, setNewPaymentBank] = useState('BIC')
  const [newPaymentSource, setNewPaymentSource] = useState('stay')
  const [savingPayment, setSavingPayment] = useState(false)

  const [settleMethod, setSettleMethod] = useState('numerario')
  const [settleBank, setSettleBank] = useState('BIC')
  const [settling, setSettling] = useState(false)

  const [staffId, setStaffId] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [done, setDone] = useState(false)

  // Frigobar
  const [minibarProducts, setMinibarProducts] = useState<MinibarProduct[]>([])
  const [selectedMinibarProductId, setSelectedMinibarProductId] = useState('')
  const [minibarQty, setMinibarQty] = useState('1')
  const [minibarDest, setMinibarDest] = useState<'pessoal' | 'empresa'>('pessoal')
  const [savingMinibar, setSavingMinibar] = useState(false)

  // Consumo adicionado manualmente à conta (só para estadias a crédito)
  const [debitType, setDebitType] = useState<Cat>('outro')
  const [debitAmount, setDebitAmount] = useState('')
  const [debitDest, setDebitDest] = useState<'pessoal' | 'empresa'>('empresa')
  const [savingDebit, setSavingDebit] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)
    })
    supabase.from('minibar_products').select('id, name, price')
      .eq('property_id', PROPERTY_ID).eq('active', true).order('name')
      .then(({ data }) => setMinibarProducts(data ?? []))
  }, [router])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setStay(null)
    const supabase = createClient()
    const { data } = await supabase
      .from('stays')
      .select('*, rooms(number, room_types(name)), guests(full_name, surname, document_number), companies(name)')
      .eq('property_id', PROPERTY_ID)
      .eq('status', 'ativo')
    const q = query.trim().toLowerCase()
    const filtered = (data ?? []).filter((s: any) =>
      s.rooms?.number?.toLowerCase().includes(q) ||
      s.guests?.full_name?.toLowerCase().includes(q) ||
      s.guests?.surname?.toLowerCase().includes(q) ||
      s.guests?.document_number?.toLowerCase().includes(q)
    )
    setResults(filtered as ActiveStay[])
    setSearching(false)
  }

  async function selectStay(s: ActiveStay) {
    setStay(s)
    setResults([])
    setLoadingBreakdown(true)
    setMinibarDest('pessoal')
    setDebitDest(s.billed_to === 'empresa' ? 'empresa' : 'pessoal')
    const supabase = createClient()
    const [{ data: laundry }, { data: restaurant }, { data: bar }, { data: minibar }, { data: charges }, { data: payments }] = await Promise.all([
      supabase.from('laundry_records').select('value, company_id').eq('stay_id', s.id),
      supabase.from('restaurant_sales').select('value, company_id').eq('stay_id', s.id).eq('guest_type', 'hospede'),
      supabase.from('bar_sales').select('company_id, bar_sale_items(subtotal)').eq('stay_id', s.id).eq('guest_type', 'hospede'),
      supabase.from('minibar_consumptions').select('total, company_id').eq('stay_id', s.id),
      supabase.from('stay_charges').select('id, charge_type, description, amount, company_id').eq('stay_id', s.id).order('created_at'),
      supabase.from('payments').select('amount, method, bank_name, source_type, paid_at, id').eq('source_id', s.id).order('paid_at', { ascending: false }),
    ])

    const built: Line[] = []
    ;(laundry ?? []).forEach((r: any) => built.push({ cat: 'lavandaria', amount: Number(r.value), empresa: !!r.company_id }))
    ;(restaurant ?? []).forEach((r: any) => built.push({ cat: 'restaurante', amount: Number(r.value), empresa: !!r.company_id }))
    ;(bar ?? []).forEach((b: any) => built.push({
      cat: 'bar',
      amount: (b.bar_sale_items ?? []).reduce((sum: number, it: any) => sum + Number(it.subtotal), 0),
      empresa: !!b.company_id,
    }))
    ;(minibar ?? []).forEach((m: any) => built.push({ cat: 'frigobar', amount: Number(m.total), empresa: !!m.company_id }))
    ;(charges ?? []).forEach((c: any) => built.push({
      cat: (CAT_ORDER.includes(c.charge_type) ? c.charge_type : 'outro') as Cat,
      amount: Number(c.amount),
      empresa: !!c.company_id,
      chargeId: c.id,
      label: c.description,
    }))
    setLines(built)
    setPaymentsList(payments ?? [])
    setPaymentsMade((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0))
    setLoadingBreakdown(false)
  }

  if (!stay) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <LogOut size={20} className="text-brand-500" /> Check-out
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Procurar por nº de quarto, nome ou BI do hóspede</p>
        </div>
        <form onSubmit={handleSearch} className="card flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" />
            <input type="text" className="input pl-9" placeholder="Ex: 12, Manuel Mendes ou nº de BI..."
              value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          </div>
          <button type="submit" className="btn-primary px-6" disabled={searching}>
            {searching ? 'A procurar...' : 'Procurar'}
          </button>
        </form>
        {results.length > 0 && (
          <div className="card divide-y divide-border">
            {results.map(s => (
              <button key={s.id} onClick={() => selectStay(s)}
                className="w-full text-left py-3 first:pt-0 last:pb-0 flex items-center justify-between hover:opacity-70 transition">
                <div>
                  <p className="font-medium text-ink">{s.guests?.full_name} {s.guests?.surname}</p>
                  <p className="text-xs text-ink-muted">Quarto {s.rooms?.number} — {s.rooms?.room_types?.name}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-surface-muted text-ink-light">
                  desde {new Date(s.check_in_at).toLocaleDateString('pt-AO')}
                </span>
              </button>
            ))}
          </div>
        )}
        {results.length === 0 && query && !searching && (
          <p className="text-sm text-ink-muted text-center py-4">Nenhuma estadia activa encontrada.</p>
        )}
      </div>
    )
  }

  // ── Cálculos principais ──────────────────────────────────────
  const isCredito = stay.billed_to === 'empresa'
  const empresaName = stay.companies?.name || 'empresa'
  // As diárias contam até ao dia em que o check-out é registado (hoje), e não até à data prevista:
  // se o hóspede prolongou a estadia, a conta acompanha.
  const diarias = calcDiarias(stay.check_in_at, null)
  const roomTotal = Number(stay.room_value) * diarias

  const lineSum = (empresa: boolean, cat?: Cat) =>
    lines.filter(l => l.empresa === empresa && (!cat || l.cat === cat)).reduce((sum, l) => sum + l.amount, 0)

  // Conta da empresa: hospedagem (se a estadia é a crédito) + consumos lançados à empresa
  const totalEmpresa = (isCredito ? roomTotal : 0) + lineSum(true)
  // Conta pessoal: hospedagem (se NÃO é a crédito) + consumos lançados ao hóspede
  const totalPessoal = (isCredito ? 0 : roomTotal) + lineSum(false)
  const totalPaid = paymentsMade
  const saldoPessoal = totalPessoal - totalPaid
  const mostrarContaEmpresa = isCredito || totalEmpresa > 0

  async function registarConsumoFrigobar() {
    if (!selectedMinibarProductId || !stay) return
    const paraEmpresa = isCredito && minibarDest === 'empresa'
    if (paraEmpresa && !stay.company_id) { alert('Esta estadia não tem empresa associada.'); return }
    setSavingMinibar(true)
    const supabase = createClient()
    const product = minibarProducts.find(p => p.id === selectedMinibarProductId)
    if (!product) { setSavingMinibar(false); return }
    const { error } = await supabase.from('minibar_consumptions').insert({
      property_id: PROPERTY_ID, stay_id: stay.id,
      product_id: product.id, quantity: Number(minibarQty),
      unit_price: product.price, recorded_by: staffId,
      company_id: paraEmpresa ? stay.company_id : null,
    })
    if (error) { alert('Erro: ' + error.message); setSavingMinibar(false); return }
    setLines(prev => [...prev, { cat: 'frigobar', amount: product.price * Number(minibarQty), empresa: paraEmpresa }])
    setSelectedMinibarProductId('')
    setMinibarQty('1')
    setSavingMinibar(false)
  }

  async function registarPagamento() {
    if (!newPaymentAmount || Number(newPaymentAmount) <= 0 || !stay) return
    setSavingPayment(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('payments').insert({
      property_id: PROPERTY_ID, source_type: newPaymentSource, source_id: stay.id,
      amount: Number(newPaymentAmount), method: newPaymentMethod,
      bank_name: newPaymentMethod === 'tpa' ? newPaymentBank : null, recorded_by: staffId,
    }).select().single()
    if (error) { alert('Erro ao registar pagamento: ' + error.message); setSavingPayment(false); return }
    setPaymentsList(prev => [data, ...prev])
    setPaymentsMade(prev => prev + Number(newPaymentAmount))
    setNewPaymentAmount('')
    setNewPaymentSource('stay')
    setSavingPayment(false)
  }

  async function adicionarDebito() {
    if (!debitAmount || Number(debitAmount) <= 0 || !stay) return
    const paraEmpresa = isCredito && debitDest === 'empresa'
    if (paraEmpresa && !stay.company_id) { alert('Esta estadia não tem empresa associada.'); return }
    setSavingDebit(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('stay_charges').insert({
      property_id: PROPERTY_ID, stay_id: stay.id,
      charge_type: debitType, description: catLabel[debitType],
      amount: Number(debitAmount), paid_now: false,
      company_id: paraEmpresa ? stay.company_id : null,
      recorded_by: staffId,
    }).select().single()
    if (error) { alert('Erro ao adicionar consumo: ' + error.message); setSavingDebit(false); return }
    setLines(prev => [...prev, { cat: debitType, amount: Number(debitAmount), empresa: paraEmpresa, chargeId: data.id, label: catLabel[debitType] }])
    setDebitAmount('')
    setSavingDebit(false)
  }

  async function removerDebito(chargeId: string) {
    if (!confirm('Remover este consumo adicionado à conta?')) return
    const supabase = createClient()
    const { error } = await supabase.from('stay_charges').delete().eq('id', chargeId)
    if (error) { alert('Erro ao remover: ' + error.message); return }
    setLines(prev => prev.filter(l => l.chargeId !== chargeId))
  }

  async function liquidarSaldo() {
    if (!stay || saldoPessoal <= 0) return
    setSettling(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('payments').insert({
      property_id: PROPERTY_ID, source_type: 'stay', source_id: stay.id,
      amount: saldoPessoal, method: settleMethod,
      bank_name: settleMethod === 'tpa' ? settleBank : null, recorded_by: staffId,
    }).select().single()
    if (error) { alert('Erro ao registar pagamento: ' + error.message); setSettling(false); return }
    setPaymentsList(prev => [data, ...prev])
    setPaymentsMade(prev => prev + saldoPessoal)
    setSettling(false)
  }

  async function gerarEGuardarDocumento() {
    if (!stay) return
    const supabase = createClient()
    const now = new Date()
    const { data: invoiceNumber } = await supabase.rpc('next_checkout_invoice_number')

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginX = 14
    const brand: [number, number, number] = [234, 88, 12]
    const gray: [number, number, number] = [107, 114, 128]
    const dark: [number, number, number] = [31, 41, 55]

    // Cabeçalho
    doc.setFillColor(...brand)
    doc.rect(0, 0, pageWidth, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Hospedaria S&I Freitas', marginX, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Documento de Check-out', marginX, 23)
    if (invoiceNumber) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(`Nº ${invoiceNumber}`, pageWidth - marginX, 15, { align: 'right' })
      doc.setFont('helvetica', 'normal')
    }

    let y = 44

    function ensure(needed = 20) {
      if (y > pageHeight - needed) { doc.addPage(); y = 20 }
    }
    function sectionTitle(title: string) {
      ensure(30)
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
      ensure()
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
    function box(label: string, value: string, fill: [number, number, number], text: [number, number, number]) {
      ensure(30)
      doc.setFillColor(...fill)
      doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F')
      doc.setTextColor(...dark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(label, marginX + 4, y + 10.5)
      doc.setTextColor(...text)
      doc.setFontSize(14)
      doc.text(value, pageWidth - marginX - 4, y + 10.5, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      y += 24
    }

    sectionTitle('Hóspede')
    row('Nome', `${stay.guests?.full_name} ${stay.guests?.surname ?? ''}`)
    row('Documento', stay.guests?.document_number ?? '—')
    row('Quarto', `${stay.rooms?.number} — ${stay.rooms?.room_types?.name}`)
    row('Check-in', new Date(stay.check_in_at).toLocaleDateString('pt-AO'))
    row('Check-out', now.toLocaleDateString('pt-AO'))
    if (isCredito) row('Facturação', `A crédito — ${empresaName}`)
    divider()

    const roomLabel = `Hospedagem (${diarias} ${diarias === 1 ? 'diária' : 'diárias'} × ${kz(Number(stay.room_value))})`

    // Conta da empresa
    if (mostrarContaEmpresa) {
      sectionTitle(`Conta da Empresa — ${empresaName}`)
      if (isCredito) row(roomLabel, kz(roomTotal))
      CAT_ORDER.forEach(c => { const v = lineSum(true, c); if (v > 0) row(catLabel[c], kz(v)) })
      y += 2
      box('Valor a facturar à empresa', kz(totalEmpresa), [255, 237, 213], [180, 83, 9])
    }

    // Conta pessoal
    sectionTitle('Conta Pessoal do Hóspede')
    if (!isCredito) row(roomLabel, kz(roomTotal))
    CAT_ORDER.forEach(c => { const v = lineSum(false, c); if (v > 0) row(catLabel[c], kz(v)) })
    if (totalPessoal === 0 && paymentsList.length === 0) {
      row('Sem valores a cobrar ao hóspede', kz(0))
    } else {
      doc.setFont('helvetica', 'bold')
      row('Total da conta pessoal', kz(totalPessoal))
      doc.setFont('helvetica', 'normal')
      if (paymentsList.length > 0) {
        y += 2
        paymentsList.forEach(p => {
          ensure()
          doc.setFontSize(9)
          doc.setTextColor(...gray)
          doc.text(`${new Date(p.paid_at).toLocaleDateString('pt-AO')} — ${sourceLabel(p.source_type)} (${methodLabel(p.method, p.bank_name)})`, marginX + 4, y)
          doc.setTextColor(...dark)
          doc.text(kz(Number(p.amount)), pageWidth - marginX, y, { align: 'right' })
          y += 5.5
          doc.setFontSize(10)
        })
        doc.setFont('helvetica', 'bold')
        row('Total pago', kz(totalPaid))
        doc.setFont('helvetica', 'normal')
      }
      y += 2
      const fill: [number, number, number] = saldoPessoal > 0 ? [255, 251, 235] : [240, 253, 244]
      const txt: [number, number, number] = saldoPessoal > 0 ? [180, 83, 9] : [21, 128, 61]
      box(saldoPessoal < 0 ? 'Pago a mais' : 'Saldo Pendente', kz(Math.abs(saldoPessoal)), fill, txt)
    }

    // Assinaturas
    if (y > pageHeight - 60) { doc.addPage(); y = 20 }
    const assinaturaY = Math.max(y + 10, pageHeight - 50)
    const colWidth = (pageWidth - marginX * 2 - 10) / 2
    doc.setDrawColor(150, 150, 150)
    doc.line(marginX, assinaturaY, marginX + colWidth, assinaturaY)
    doc.line(marginX + colWidth + 10, assinaturaY, marginX + colWidth * 2 + 10, assinaturaY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...gray)
    doc.text('Assinatura do Hóspede', marginX, assinaturaY + 6)
    doc.text('Assinatura do Rececionista', marginX + colWidth + 10, assinaturaY + 6)
    doc.setFontSize(8)
    doc.text(`Gerado em ${now.toLocaleString('pt-AO')} · Sistema de gestão S&I Freitas`, marginX, pageHeight - 10)

    const blob = doc.output('blob')
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${stay.id}.pdf`
    await supabase.storage.from('checkout-docs').upload(path, blob, { contentType: 'application/pdf', upsert: true })
    await supabase.from('checkout_documents').upsert({
      property_id: PROPERTY_ID, stay_id: stay.id,
      pdf_url: path, invoice_number: invoiceNumber ?? null,
      generated_at: now.toISOString(),
    }, { onConflict: 'stay_id' })
  }

  async function finalizarHospedagem() {
    if (!stay) return
    if (saldoPessoal > 0) {
      const ok = confirm(`Ainda há um saldo pendente de ${kz(saldoPessoal)} na conta pessoal do hóspede.\n\nFinalizar mesmo assim?`)
      if (!ok) return
    }
    setFinalizing(true)
    const supabase = createClient()
    const { error } = await supabase.from('stays').update({
      check_out_at: new Date().toISOString(),
      status: 'finalizado',
      checked_out_verified_by: staffId,
      // valor ainda em aberto: o que o hóspede deve + o que fica por facturar à empresa
      amount_due: Math.max(0, saldoPessoal) + totalEmpresa,
    }).eq('id', stay.id)
    if (error) { alert('Erro ao finalizar check-out: ' + error.message); setFinalizing(false); return }
    // Quarto para limpeza
    await supabase.from('rooms').update({ status: 'limpeza' }).eq('id', stay.room_id)
    await gerarEGuardarDocumento()
    setDone(true)
    setFinalizing(false)
    setTimeout(() => router.push('/quartos'), 1800)
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700 py-6 justify-center">
          <CheckCircle size={22} />
          <span className="font-semibold text-lg">Check-out finalizado — quarto enviado para limpeza.</span>
        </div>
        <p className="text-xs text-ink-muted text-center mt-3 flex items-center justify-center gap-1.5">
          <FileDown size={13}/> Documento guardado no Arquivo Check-out
        </p>
      </div>
    )
  }

  // Linhas de categorias para mostrar numa conta
  function catRows(empresa: boolean, alwaysShow: Cat[]) {
    return CAT_ORDER.map(c => {
      const v = lineSum(empresa, c)
      if (v <= 0 && !alwaysShow.includes(c)) return null
      const icon = c === 'lavandaria' ? <ShirtIcon size={13}/> : c === 'restaurante' ? <UtensilsCrossed size={13}/> : c === 'bar' || c === 'frigobar' ? <Wine size={13}/> : <Plus size={13}/>
      return (
        <div key={c} className="flex justify-between items-center">
          <span className="text-ink-muted flex items-center gap-1.5">{icon} {catLabel[c]}</span>
          <span className="font-medium">{kz(v)}</span>
        </div>
      )
    })
  }

  // Consumos adicionados manualmente (com botão para remover)
  function manualDebits(empresa: boolean) {
    const items = lines.filter(l => l.chargeId && l.empresa === empresa)
    if (items.length === 0) return null
    return (
      <div className="text-xs space-y-1 pt-2 border-t border-border">
        <p className="text-ink-light">Consumos adicionados à conta:</p>
        {items.map(l => (
          <div key={l.chargeId} className="flex justify-between items-center pl-2 text-ink-muted">
            <span>{l.label ?? catLabel[l.cat]}</span>
            <span className="flex items-center gap-2">
              {kz(l.amount)}
              <button type="button" onClick={() => removerDebito(l.chargeId!)} className="text-ink-light hover:text-red-500" title="Remover">
                <X size={13}/>
              </button>
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => setStay(null)} className="text-xs text-brand-500 font-medium mb-2">
          ← Procurar outra estadia
        </button>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <LogOut size={20} className="text-brand-500" /> Check-out — Quarto {stay.rooms?.number}
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {stay.guests?.full_name} {stay.guests?.surname} · desde {new Date(stay.check_in_at).toLocaleDateString('pt-AO')}
          {isCredito && <span className="ml-2 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-medium">A crédito</span>}
        </p>
      </div>

      {isCredito && (
        <div className="card border-brand-200 bg-brand-50 flex items-start gap-3 text-sm text-brand-700">
          <Building2 size={16} className="mt-0.5 shrink-0"/>
          <div>
            <p className="font-semibold">Cliente a crédito — {empresaName}</p>
            <p className="text-xs mt-0.5">
              A hospedagem e os consumos lançados na conta da empresa são facturados à empresa.
              Os consumos na conta pessoal são pagos pelo hóspede neste check-out.
            </p>
          </div>
        </div>
      )}

      {loadingBreakdown ? (
        <div className="card text-center text-sm text-ink-muted py-8">A calcular valores...</div>
      ) : (
        <>
          {/* Conta da empresa */}
          {mostrarContaEmpresa && (
            <div className="card border-brand-200 bg-brand-50 space-y-3">
              <h2 className="text-xs font-bold text-brand-700 uppercase tracking-wide flex items-center gap-1.5">
                <Building2 size={14}/> Conta da empresa — {empresaName}
              </h2>
              <div className="space-y-2 text-sm">
                {isCredito && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">
                      Hospedagem ({diarias} {diarias === 1 ? 'diária' : 'diárias'} × {kz(Number(stay.room_value))})
                    </span>
                    <span className="font-medium">{kz(roomTotal)}</span>
                  </div>
                )}
                {catRows(true, [])}
                <div className="flex justify-between pt-2 border-t border-brand-200 font-semibold">
                  <span>Valor a facturar à empresa</span>
                  <span className="text-brand-600 text-base">{kz(totalEmpresa)}</span>
                </div>
              </div>
              {manualDebits(true)}
            </div>
          )}

          {/* Conta pessoal */}
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">
              {isCredito ? 'Conta pessoal do hóspede' : 'Resumo da conta'}
            </h2>
            <div className="space-y-2 text-sm">
              {!isCredito && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">
                    Hospedagem ({diarias} {diarias === 1 ? 'diária' : 'diárias'} × {kz(Number(stay.room_value))})
                  </span>
                  <span className="font-medium">{kz(roomTotal)}</span>
                </div>
              )}
              {catRows(false, ['lavandaria', 'restaurante', 'bar', 'frigobar'])}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>Total {isCredito ? 'da conta pessoal' : ''}</span>
                <span>{kz(totalPessoal)}</span>
              </div>
            </div>
            {manualDebits(false)}

            {/* Frigobar */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <select className="input flex-1" value={selectedMinibarProductId} onChange={e => setSelectedMinibarProductId(e.target.value)}>
                <option value="">Adicionar consumo de frigobar...</option>
                {minibarProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {kz(Number(p.price))}</option>
                ))}
              </select>
              <input type="number" min="1" className="input w-20" value={minibarQty} onChange={e => setMinibarQty(e.target.value)} />
              {isCredito && (
                <select className="input w-32" value={minibarDest} onChange={e => setMinibarDest(e.target.value as 'pessoal' | 'empresa')}>
                  <option value="pessoal">Conta pessoal</option>
                  <option value="empresa">Empresa</option>
                </select>
              )}
              <button type="button" onClick={registarConsumoFrigobar} disabled={savingMinibar || !selectedMinibarProductId}
                className="btn-secondary px-4 flex items-center gap-1.5">
                <Plus size={14}/> {savingMinibar ? '...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Adicionar consumo à conta — só para estadias a crédito */}
          {isCredito && (
            <div className="card space-y-2">
              <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Adicionar consumo à conta</h2>
              <div className="flex gap-2">
                <select className="input flex-1" value={debitType} onChange={e => setDebitType(e.target.value as Cat)}>
                  {CAT_ORDER.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
                </select>
                <select className="input w-36" value={debitDest} onChange={e => setDebitDest(e.target.value as 'pessoal' | 'empresa')}>
                  <option value="empresa">Conta da empresa</option>
                  <option value="pessoal">Conta pessoal</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input type="number" min="0" className="input flex-1" placeholder="Valor (Kz)"
                  value={debitAmount} onChange={e => setDebitAmount(e.target.value)} />
                <button type="button" onClick={adicionarDebito} disabled={savingDebit || !debitAmount}
                  className="btn-secondary px-4 whitespace-nowrap">
                  {savingDebit ? '...' : '+ Débito'}
                </button>
              </div>
              <p className="text-xs text-ink-light">
                {debitDest === 'empresa'
                  ? 'Este valor é somado ao total a facturar à empresa.'
                  : 'Este valor é somado à conta pessoal e fica a cargo do hóspede.'}
              </p>
            </div>
          )}

          {/* Pagamentos directos (conta pessoal) */}
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14}/> {isCredito ? 'Pagamentos do hóspede (conta pessoal)' : 'Pagamentos'}
            </h2>
            <div className="space-y-2 text-sm">
              {paymentsList.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-light">Pagamentos registados:</p>
                  {paymentsList.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs pl-2">
                      <span className="text-ink-muted">
                        {new Date(p.paid_at).toLocaleDateString('pt-AO')} · {sourceLabel(p.source_type)} · {methodLabel(p.method, p.bank_name)}
                      </span>
                      <span className="font-medium">{kz(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Ainda não há pagamentos registados.</p>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>Total pago</span>
                <span>{kz(totalPaid)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs text-ink-light">
                Registar pagamento {isCredito ? 'directo (o hóspede pagou agora) — só abate a conta pessoal' : 'adicional'}
              </p>
              <div className="flex gap-2">
                <select className="input flex-1" value={newPaymentSource} onChange={e => setNewPaymentSource(e.target.value)}>
                  <option value="stay">Hospedagem</option>
                  <option value="laundry">Lavandaria</option>
                  <option value="restaurant">Restaurante</option>
                  <option value="bar">Bar</option>
                  <option value="minibar">Frigobar</option>
                </select>
                <select className="input w-32" value={newPaymentMethod} onChange={e => setNewPaymentMethod(e.target.value)}>
                  <option value="numerario">Numerário</option>
                  <option value="tpa">TPA</option>
                  <option value="transferencia">Transferência</option>
                </select>
                {newPaymentMethod === 'tpa' && (
                  <select className="input w-24" value={newPaymentBank} onChange={e => setNewPaymentBank(e.target.value)}>
                    {BANK_OPTIONS.map(b => <option key={b}>{b}</option>)}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <input type="number" min="0" className="input flex-1" placeholder="Valor (Kz)"
                  value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} />
                <button type="button" onClick={registarPagamento}
                  disabled={savingPayment || !newPaymentAmount} className="btn-secondary px-4">
                  {savingPayment ? '...' : 'Registar'}
                </button>
              </div>
            </div>
          </div>

          {/* Saldo da conta pessoal */}
          <div className={`card ${saldoPessoal > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-ink">
                {saldoPessoal < 0 ? 'Pago a mais' : isCredito ? 'Saldo pendente do hóspede' : 'Saldo Pendente'}
              </span>
              <span className={`text-xl font-bold ${saldoPessoal > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {kz(Math.abs(saldoPessoal))}
              </span>
            </div>
            {saldoPessoal > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                <p className="text-xs text-amber-800">Registar o pagamento deste saldo:</p>
                <div className="flex gap-2">
                  <select className="input flex-1" value={settleMethod} onChange={e => setSettleMethod(e.target.value)}>
                    <option value="numerario">Numerário</option>
                    <option value="tpa">TPA</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                  {settleMethod === 'tpa' && (
                    <select className="input w-24" value={settleBank} onChange={e => setSettleBank(e.target.value)}>
                      {BANK_OPTIONS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={liquidarSaldo} disabled={settling}
                    className="btn-primary px-5 whitespace-nowrap">
                    {settling ? 'A registar...' : `Pagar ${kz(saldoPessoal)}`}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={finalizarHospedagem} disabled={finalizing} className="btn-primary w-full py-3">
            {finalizing ? 'A finalizar...' : 'Finalizar Hospedagem'}
          </button>
        </>
      )}
    </div>
  )
}
