'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Search, CheckCircle, Wallet, ShirtIcon, UtensilsCrossed, Wine, FileDown, Plus, Building2 } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type MinibarProduct = { id: string; name: string; price: number }

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

// Calcula diárias com base nas datas (check-in → check-out previsto)
// Cada diária = 1 dia de diferença entre datas, independente da hora
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
  company_id?: string
  rooms: { number: string; room_types: { name: string } }
  guests: { full_name: string; surname: string | null; document_number: string | null }
  companies?: { name: string }
}

export default function CheckOutPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ActiveStay[]>([])
  const [stay, setStay] = useState<ActiveStay | null>(null)

  const [laundryTotal, setLaundryTotal] = useState(0)
  const [restaurantTotal, setRestaurantTotal] = useState(0)
  const [barTotal, setBarTotal] = useState(0)
  const [minibarTotal, setMinibarTotal] = useState(0)
  const [paymentsMade, setPaymentsMade] = useState(0)
  const [paymentsList, setPaymentsList] = useState<any[]>([])
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  // Débitos de crédito — consumos adicionados à conta sem pagamento imediato
  const [debitosCredito, setDebitosCredito] = useState<{ source: string; amount: number }[]>([])
  const totalDebitosCredito = debitosCredito.reduce((sum, d) => sum + d.amount, 0)

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

  const [minibarProducts, setMinibarProducts] = useState<MinibarProduct[]>([])
  const [selectedMinibarProductId, setSelectedMinibarProductId] = useState('')
  const [minibarQty, setMinibarQty] = useState('1')
  const [savingMinibar, setSavingMinibar] = useState(false)

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
    setDebitosCredito([])
    setLoadingBreakdown(true)
    const supabase = createClient()
    const [{ data: laundry }, { data: restaurant }, { data: bar }, { data: minibar }, { data: payments }] = await Promise.all([
      supabase.from('laundry_records').select('value').eq('stay_id', s.id),
      supabase.from('restaurant_sales').select('value').eq('stay_id', s.id).eq('guest_type', 'hospede'),
      supabase.from('bar_sales').select('bar_sale_items(subtotal)').eq('stay_id', s.id).eq('guest_type', 'hospede'),
      supabase.from('minibar_consumptions').select('total').eq('stay_id', s.id),
      supabase.from('payments').select('amount, method, bank_name, source_type, paid_at, id')
        .eq('source_id', s.id).order('paid_at', { ascending: false }),
    ])
    setLaundryTotal((laundry ?? []).reduce((sum, r) => sum + Number(r.value), 0))
    setRestaurantTotal((restaurant ?? []).reduce((sum, r) => sum + Number(r.value), 0))
    setBarTotal((bar ?? []).reduce((sum: number, s: any) =>
      sum + (s.bar_sale_items ?? []).reduce((si: number, it: any) => si + Number(it.subtotal), 0), 0))
    setMinibarTotal((minibar ?? []).reduce((sum, r) => sum + Number(r.total), 0))
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
  const diarias = calcDiarias(stay.check_in_at, stay.check_out_planned_at)
  const roomTotal = Number(stay.room_value) * diarias
  const subtotal = roomTotal + laundryTotal + restaurantTotal + barTotal + minibarTotal + totalDebitosCredito
  const totalPaid = paymentsMade
  const saldoPendente = subtotal - totalPaid
  const isCredito = stay.billed_to === 'empresa'

  async function registarConsumoFrigobar() {
    if (!selectedMinibarProductId || !stay) return
    setSavingMinibar(true)
    const supabase = createClient()
    const product = minibarProducts.find(p => p.id === selectedMinibarProductId)
    if (!product) { setSavingMinibar(false); return }
    const { error } = await supabase.from('minibar_consumptions').insert({
      property_id: PROPERTY_ID, stay_id: stay.id,
      product_id: product.id, quantity: Number(minibarQty),
      unit_price: product.price, recorded_by: staffId,
    })
    if (error) { alert('Erro: ' + error.message); setSavingMinibar(false); return }
    setMinibarTotal(prev => prev + product.price * Number(minibarQty))
    setSelectedMinibarProductId('')
    setMinibarQty('1')
    setSavingMinibar(false)
  }

  // Para clientes a crédito: adiciona débito à conta (não é pagamento)
  async function adicionarDebitoCredito() {
    if (!newPaymentAmount || Number(newPaymentAmount) <= 0) return
    setSavingPayment(true)
    setDebitosCredito(prev => [...prev, { source: newPaymentSource, amount: Number(newPaymentAmount) }])
    setNewPaymentAmount('')
    setNewPaymentSource('stay')
    setSavingPayment(false)
  }

  // Regista pagamento real (reduz o saldo)
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

  async function liquidarSaldo() {
    if (!stay || saldoPendente <= 0) return
    setSettling(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('payments').insert({
      property_id: PROPERTY_ID, source_type: 'stay', source_id: stay.id,
      amount: saldoPendente, method: settleMethod,
      bank_name: settleMethod === 'tpa' ? settleBank : null, recorded_by: staffId,
    }).select().single()
    if (error) { alert('Erro ao registar pagamento: ' + error.message); setSettling(false); return }
    setPaymentsList(prev => [data, ...prev])
    setPaymentsMade(prev => prev + saldoPendente)
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

    sectionTitle('Hóspede')
    row('Nome', `${stay.guests?.full_name} ${stay.guests?.surname ?? ''}`)
    row('Documento', stay.guests?.document_number ?? '—')
    row('Quarto', `${stay.rooms?.number} — ${stay.rooms?.room_types?.name}`)
    row('Check-in', new Date(stay.check_in_at).toLocaleDateString('pt-AO'))
    row('Check-out', now.toLocaleDateString('pt-AO'))
    if (isCredito) row('Facturação', `A crédito — ${stay.companies?.name || 'empresa'}`)
    divider()

    sectionTitle('Resumo da Conta')
    row(
      `Hospedagem (${diarias} ${diarias === 1 ? 'diária' : 'diárias'} × ${Number(stay.room_value).toLocaleString('pt-AO')} Kz)`,
      `${roomTotal.toLocaleString('pt-AO')} Kz`
    )
    if (laundryTotal > 0) row('Lavandaria', `${laundryTotal.toLocaleString('pt-AO')} Kz`)
    if (restaurantTotal > 0) row('Restaurante', `${restaurantTotal.toLocaleString('pt-AO')} Kz`)
    if (barTotal > 0) row('Bar', `${barTotal.toLocaleString('pt-AO')} Kz`)
    if (minibarTotal > 0) row('Frigobar', `${minibarTotal.toLocaleString('pt-AO')} Kz`)
    if (debitosCredito.length > 0) {
      debitosCredito.forEach(d => {
        row(`${sourceLabel(d.source)} (a crédito)`, `${d.amount.toLocaleString('pt-AO')} Kz`)
      })
    }
    doc.setDrawColor(220, 220, 220)
    doc.line(marginX, y - 2, pageWidth - marginX, y - 2)
    doc.setFont('helvetica', 'bold')
    row('Total', `${subtotal.toLocaleString('pt-AO')} Kz`)
    doc.setFont('helvetica', 'normal')
    divider()

    if (isCredito) {
      sectionTitle('Facturação a Crédito')
      doc.setFillColor(255, 237, 213)
      doc.roundedRect(marginX, y, pageWidth - marginX * 2, 22, 2, 2, 'F')
      doc.setTextColor(180, 83, 9)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Valor a facturar à empresa:', marginX + 4, y + 8)
      doc.setFontSize(13)
      doc.text(`${Math.max(0, subtotal - totalPaid).toLocaleString('pt-AO')} Kz`, pageWidth - marginX - 4, y + 8, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text(`Empresa: ${stay.companies?.name || '—'}`, marginX + 4, y + 16)
      y += 30
      if (totalPaid > 0) {
        doc.setFontSize(10)
        doc.setTextColor(...dark)
        row('Já pago directamente', `${totalPaid.toLocaleString('pt-AO')} Kz`)
        row('Valor a crédito', `${Math.max(0, subtotal - totalPaid).toLocaleString('pt-AO')} Kz`)
      }
    } else {
      sectionTitle('Pagamentos')
      paymentsList.forEach(p => {
        doc.setFontSize(9)
        doc.setTextColor(...gray)
        doc.text(
          `${new Date(p.paid_at).toLocaleDateString('pt-AO')} — ${sourceLabel(p.source_type)} (${methodLabel(p.method, p.bank_name)})`,
          marginX + 4, y
        )
        doc.setTextColor(...dark)
        doc.text(`${Number(p.amount).toLocaleString('pt-AO')} Kz`, pageWidth - marginX, y, { align: 'right' })
        y += 5.5
        doc.setFontSize(10)
      })
      y += 1
      doc.setFont('helvetica', 'bold')
      row('Total pago', `${totalPaid.toLocaleString('pt-AO')} Kz`)
      doc.setFont('helvetica', 'normal')
      y += 4

      const saldoColor: [number, number, number] = saldoPendente > 0 ? [255, 251, 235] : [240, 253, 244]
      const saldoText: [number, number, number] = saldoPendente > 0 ? [180, 83, 9] : [21, 128, 61]
      doc.setFillColor(...saldoColor)
      doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F')
      doc.setTextColor(...dark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Saldo Pendente', marginX + 4, y + 10.5)
      doc.setTextColor(...saldoText)
      doc.setFontSize(14)
      doc.text(`${saldoPendente.toLocaleString('pt-AO')} Kz`, pageWidth - marginX - 4, y + 10.5, { align: 'right' })
      y += 28
    }

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
    if (!isCredito && saldoPendente > 0) {
      const ok = confirm(`Ainda há um saldo pendente de ${saldoPendente.toLocaleString('pt-AO')} Kz.\n\nFinalizar mesmo assim?`)
      if (!ok) return
    }
    setFinalizing(true)
    const supabase = createClient()
    const { error } = await supabase.from('stays').update({
      check_out_at: new Date().toISOString(),
      status: 'finalizado',
      checked_out_verified_by: staffId,
      amount_due: isCredito ? Math.max(0, subtotal - totalPaid) : saldoPendente,
    }).eq('id', stay.id)
    if (error) { alert('Erro ao finalizar check-out: ' + error.message); setFinalizing(false); return }
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
            <p className="font-semibold">Cliente a crédito — {stay.companies?.name || 'empresa'}</p>
            <p className="text-xs mt-0.5">
              O valor da hospedagem será facturado à empresa. O documento gerado serve de comprovativo.
            </p>
          </div>
        </div>
      )}

      {loadingBreakdown ? (
        <div className="card text-center text-sm text-ink-muted py-8">A calcular valores...</div>
      ) : (
        <>
          {/* Resumo da conta */}
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Resumo da conta</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">
                  Hospedagem ({diarias} {diarias === 1 ? 'diária' : 'diárias'} × {Number(stay.room_value).toLocaleString('pt-AO')} Kz)
                </span>
                <span className="font-medium">{roomTotal.toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted flex items-center gap-1.5"><ShirtIcon size={13}/> Lavandaria</span>
                <span className="font-medium">{laundryTotal.toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted flex items-center gap-1.5"><UtensilsCrossed size={13}/> Restaurante</span>
                <span className="font-medium">{restaurantTotal.toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted flex items-center gap-1.5"><Wine size={13}/> Bar</span>
                <span className="font-medium">{barTotal.toLocaleString('pt-AO')} Kz</span>
              </div>
              {debitosCredito.length > 0 && debitosCredito.map((d, i) => (
                <div key={i} className="flex justify-between items-center text-brand-600">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={13}/> {sourceLabel(d.source)} (a crédito)
                  </span>
                  <span className="font-medium">{d.amount.toLocaleString('pt-AO')} Kz</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>Total</span>
                <span>{subtotal.toLocaleString('pt-AO')} Kz</span>
              </div>
            </div>

            {/* Frigobar */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <select className="input flex-1" value={selectedMinibarProductId}
                onChange={e => setSelectedMinibarProductId(e.target.value)}>
                <option value="">Adicionar consumo de frigobar...</option>
                {minibarProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {Number(p.price).toLocaleString('pt-AO')} Kz</option>
                ))}
              </select>
              <input type="number" min="1" className="input w-20" value={minibarQty}
                onChange={e => setMinibarQty(e.target.value)} />
              <button type="button" onClick={registarConsumoFrigobar}
                disabled={savingMinibar || !selectedMinibarProductId}
                className="btn-secondary px-4 flex items-center gap-1.5">
                <Plus size={14}/> {savingMinibar ? '...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Pagamentos / Conta */}
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14}/> {isCredito ? 'Conta do hóspede' : 'Pagamentos'}
            </h2>
            <div className="space-y-2 text-sm">
              {paymentsList.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-light">
                    {isCredito ? 'Valores já pagos directamente:' : 'Pagamentos registados:'}
                  </p>
                  {paymentsList.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs pl-2">
                      <span className="text-ink-muted">
                        {new Date(p.paid_at).toLocaleDateString('pt-AO')} · {sourceLabel(p.source_type)} · {methodLabel(p.method, p.bank_name)}
                      </span>
                      <span className="font-medium">{Number(p.amount).toLocaleString('pt-AO')} Kz</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  {isCredito ? 'Nenhum pagamento directo registado.' : 'Ainda não há pagamentos registados.'}
                </p>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>Total pago directamente</span>
                <span>{totalPaid.toLocaleString('pt-AO')} Kz</span>
              </div>
            </div>

            {isCredito ? (
              /* Cliente a crédito — duas opções separadas */
              <div className="space-y-4 pt-2 border-t border-border">
                {/* Opção 1: Adicionar débito à conta */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-muted">Adicionar consumo à conta (será facturado à empresa)</p>
                  <div className="flex gap-2">
                    <select className="input flex-1" value={newPaymentSource}
                      onChange={e => setNewPaymentSource(e.target.value)}>
                      <option value="stay">Hospedagem extra</option>
                      <option value="laundry">Lavandaria</option>
                      <option value="restaurant">Restaurante</option>
                      <option value="bar">Bar</option>
                      <option value="minibar">Frigobar</option>
                    </select>
                    <input type="number" min="0" className="input w-32" placeholder="Valor (Kz)"
                      value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} />
                    <button type="button" onClick={adicionarDebitoCredito}
                      disabled={savingPayment || !newPaymentAmount}
                      className="btn-secondary px-4 whitespace-nowrap border-brand-300 text-brand-600">
                      + Débito
                    </button>
                  </div>
                  <p className="text-xs text-ink-light">Soma ao total a facturar à empresa.</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-surface-border"/>
                  <span className="text-xs text-ink-light">ou</span>
                  <div className="flex-1 border-t border-surface-border"/>
                </div>

                {/* Opção 2: Pagamento directo */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-muted">Registar pagamento directo (o hóspede pagou agora)</p>
                  <div className="flex gap-2">
                    <select className="input flex-1" value={newPaymentMethod}
                      onChange={e => setNewPaymentMethod(e.target.value)}>
                      <option value="numerario">Numerário</option>
                      <option value="tpa">TPA</option>
                      <option value="transferencia">Transferência</option>
                    </select>
                    {newPaymentMethod === 'tpa' && (
                      <select className="input w-24" value={newPaymentBank}
                        onChange={e => setNewPaymentBank(e.target.value)}>
                        {['BIC','BFA','BAI','BCI','BNI','ATLANTICO'].map(b => <option key={b}>{b}</option>)}
                      </select>
                    )}
                    <input type="number" min="0" className="input w-32" placeholder="Valor (Kz)"
                      value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} />
                    <button type="button" onClick={registarPagamento}
                      disabled={savingPayment || !newPaymentAmount}
                      className="btn-secondary px-4 whitespace-nowrap">
                      Pago
                    </button>
                  </div>
                  <p className="text-xs text-ink-light">Desconta do total a crédito.</p>
                </div>
              </div>
            ) : (
              /* Cliente normal */
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs text-ink-light">Registar novo pagamento</p>
                <div className="flex gap-2">
                  <select className="input flex-1" value={newPaymentSource}
                    onChange={e => setNewPaymentSource(e.target.value)}>
                    <option value="stay">Hospedagem</option>
                    <option value="laundry">Lavandaria</option>
                    <option value="restaurant">Restaurante</option>
                    <option value="bar">Bar</option>
                    <option value="minibar">Frigobar</option>
                  </select>
                  <select className="input w-32" value={newPaymentMethod}
                    onChange={e => setNewPaymentMethod(e.target.value)}>
                    <option value="numerario">Numerário</option>
                    <option value="tpa">TPA</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                  {newPaymentMethod === 'tpa' && (
                    <select className="input w-24" value={newPaymentBank}
                      onChange={e => setNewPaymentBank(e.target.value)}>
                      {['BIC','BFA','BAI','BCI','BNI','ATLANTICO'].map(b => <option key={b}>{b}</option>)}
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
            )}
          </div>

          {/* Saldo final */}
          {isCredito ? (
            <div className="card border-brand-200 bg-brand-50 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-ink">Valor a facturar à empresa</span>
                <span className="text-xl font-bold text-brand-500">
                  {Math.max(0, subtotal - totalPaid).toLocaleString('pt-AO')} Kz
                </span>
              </div>
              {debitosCredito.length > 0 && (
                <div className="text-xs space-y-0.5 pt-1 border-t border-brand-200">
                  <p className="text-ink-muted font-medium">Consumos adicionados à conta:</p>
                  {debitosCredito.map((d, i) => (
                    <div key={i} className="flex justify-between pl-2 text-ink-muted">
                      <span>{sourceLabel(d.source)}</span>
                      <span>{d.amount.toLocaleString('pt-AO')} Kz</span>
                    </div>
                  ))}
                </div>
              )}
              {totalPaid > 0 && (
                <p className="text-xs text-ink-muted border-t border-brand-200 pt-1">
                  {totalPaid.toLocaleString('pt-AO')} Kz já pago · restam {Math.max(0, subtotal - totalPaid).toLocaleString('pt-AO')} Kz a facturar
                </p>
              )}
            </div>
          ) : (
            <div className={`card ${saldoPendente > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-ink">Saldo Pendente</span>
                <span className={`text-xl font-bold ${saldoPendente > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {saldoPendente.toLocaleString('pt-AO')} Kz
                </span>
              </div>
              {saldoPendente > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                  <p className="text-xs text-amber-800">Registar o pagamento deste saldo:</p>
                  <div className="flex gap-2">
                    <select className="input flex-1" value={settleMethod}
                      onChange={e => setSettleMethod(e.target.value)}>
                      <option value="numerario">Numerário</option>
                      <option value="tpa">TPA</option>
                      <option value="transferencia">Transferência</option>
                    </select>
                    {settleMethod === 'tpa' && (
                      <select className="input w-24" value={settleBank}
                        onChange={e => setSettleBank(e.target.value)}>
                        {['BIC','BFA','BAI','BCI','BNI','ATLANTICO'].map(b => <option key={b}>{b}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={liquidarSaldo} disabled={settling}
                      className="btn-primary px-5 whitespace-nowrap">
                      {settling ? 'A registar...' : `Pagar ${saldoPendente.toLocaleString('pt-AO')} Kz`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={finalizarHospedagem} disabled={finalizing} className="btn-primary w-full py-3">
            {finalizing ? 'A finalizar...' : 'Finalizar Hospedagem'}
          </button>
        </>
      )}
    </div>
  )
}
