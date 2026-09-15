'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Search, CheckCircle, Wallet, ShirtIcon, UtensilsCrossed, Wine, FileDown } from 'lucide-react'
import jsPDF from 'jspdf'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type ActiveStay = {
  id: string
  room_id: string
  room_value: number
  amount_paid_reservation: number
  check_in_at: string
  billed_to: string
  company_name: string | null
  rooms: { number: string; room_types: { name: string } }
  guests: { full_name: string; surname: string | null; document_number: string | null }
}

export default function CheckOutPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ActiveStay[]>([])
  const [stay, setStay] = useState<ActiveStay | null>(null)

  const [laundryTotal, setLaundryTotal] = useState(0)
  const [restaurantTotal, setRestaurantTotal] = useState(0)
  const [minibarTotal, setMinibarTotal] = useState(0)
  const [paymentsMade, setPaymentsMade] = useState(0)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentMethod, setNewPaymentMethod] = useState('numerario')
  const [savingPayment, setSavingPayment] = useState(false)

  const [staffId, setStaffId] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)
    })
  }, [router])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setStay(null)
    const supabase = createClient()

    // Pesquisa por número de quarto OU por nome/BI do hóspede
    const { data } = await supabase
      .from('stays')
      .select('*, rooms(number, room_types(name)), guests(full_name, surname, document_number)')
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
    const supabase = createClient()

    const [{ data: laundry }, { data: restaurant }, { data: minibar }, { data: payments }] = await Promise.all([
      supabase.from('laundry_records').select('value').eq('stay_id', s.id),
      supabase.from('restaurant_sales').select('value').eq('stay_id', s.id).eq('guest_type', 'hospede'),
      supabase.from('minibar_consumptions').select('total').eq('stay_id', s.id),
      supabase.from('payments').select('amount').eq('source_type', 'stay').eq('source_id', s.id),
    ])

    setLaundryTotal((laundry ?? []).reduce((sum, r) => sum + Number(r.value), 0))
    setRestaurantTotal((restaurant ?? []).reduce((sum, r) => sum + Number(r.value), 0))
    setMinibarTotal((minibar ?? []).reduce((sum, r) => sum + Number(r.total), 0))
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
            <input
              type="text"
              className="input pl-9"
              placeholder="Ex: 12, Manuel Mendes ou nº de BI..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary px-6" disabled={searching}>
            {searching ? 'A procurar...' : 'Procurar'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="card divide-y divide-border">
            {results.map(s => (
              <button
                key={s.id}
                onClick={() => selectStay(s)}
                className="w-full text-left py-3 first:pt-0 last:pb-0 flex items-center justify-between hover:opacity-70 transition"
              >
                <div>
                  <p className="font-medium text-ink">{s.guests?.full_name} {s.guests?.surname}</p>
                  <p className="text-xs text-ink-muted">Quarto {s.rooms?.number} — {s.rooms?.room_types?.name}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-surface-muted text-ink-light">
                  desde {new Date(s.check_in_at).toLocaleDateString('pt-PT')}
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

  const subtotal = Number(stay.room_value) + laundryTotal + restaurantTotal + minibarTotal
  const totalPaid = Number(stay.amount_paid_reservation) + paymentsMade
  const saldoPendente = subtotal - totalPaid

  async function registarPagamento() {
    if (!newPaymentAmount || Number(newPaymentAmount) <= 0 || !stay) return
    setSavingPayment(true)
    const supabase = createClient()
    const { error } = await supabase.from('payments').insert({
      property_id: PROPERTY_ID,
      source_type: 'stay',
      source_id: stay.id,
      amount: Number(newPaymentAmount),
      method: newPaymentMethod,
      recorded_by: staffId,
    })
    if (error) { alert('Erro ao registar pagamento: ' + error.message); setSavingPayment(false); return }
    setPaymentsMade(prev => prev + Number(newPaymentAmount))
    setNewPaymentAmount('')
    setSavingPayment(false)
  }

  async function gerarEGuardarDocumento() {
    if (!stay) return
    const supabase = createClient()
    const now = new Date()

    const doc = new jsPDF()
    let y = 20
    doc.setFontSize(16)
    doc.text('Hospedaria S&I Freitas', 14, y); y += 8
    doc.setFontSize(11)
    doc.text('Documento de Check-in / Check-out', 14, y); y += 10
    doc.setFontSize(10)
    doc.text(`Hóspede: ${stay.guests?.full_name} ${stay.guests?.surname ?? ''}`, 14, y); y += 6
    doc.text(`Documento: ${stay.guests?.document_number ?? '—'}`, 14, y); y += 6
    doc.text(`Quarto: ${stay.rooms?.number} — ${stay.rooms?.room_types?.name}`, 14, y); y += 6
    doc.text(`Check-in: ${new Date(stay.check_in_at).toLocaleString('pt-PT')}`, 14, y); y += 6
    doc.text(`Check-out: ${now.toLocaleString('pt-PT')}`, 14, y); y += 10

    doc.setFontSize(11)
    doc.text('Resumo da conta', 14, y); y += 7
    doc.setFontSize(10)
    doc.text(`Hospedagem: ${Number(stay.room_value).toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    doc.text(`Lavandaria: ${laundryTotal.toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    doc.text(`Restaurante: ${restaurantTotal.toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    doc.text(`Frigobar: ${minibarTotal.toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    doc.text(`Subtotal: ${subtotal.toLocaleString('pt-AO')} Kz`, 14, y); y += 10
    doc.text(`Total pago: ${totalPaid.toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    doc.text(`Saldo pendente: ${saldoPendente.toLocaleString('pt-AO')} Kz`, 14, y); y += 6
    if (stay.billed_to === 'empresa') {
      doc.text(`Facturação: a crédito — ${stay.company_name || 'empresa não especificada'}`, 14, y); y += 6
    }

    const blob = doc.output('blob')
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${stay.id}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('checkout-docs')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Erro ao guardar PDF:', uploadError.message)
      return
    }

    await supabase.from('checkout_documents').upsert({
      property_id: PROPERTY_ID,
      stay_id: stay.id,
      pdf_url: path,
      generated_at: now.toISOString(),
    }, { onConflict: 'stay_id' })
  }

  async function finalizarHospedagem() {
    if (!stay) return
    setFinalizing(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('stays')
      .update({
        check_out_at: new Date().toISOString(),
        status: 'finalizado',
        checked_out_verified_by: staffId,
        amount_due: saldoPendente,
      })
      .eq('id', stay.id)

    if (error) { alert('Erro ao finalizar check-out: ' + error.message); setFinalizing(false); return }

    // Gera e guarda o documento de check-in + check-out no arquivo
    await gerarEGuardarDocumento()

    // O trigger da base de dados já move o quarto automaticamente para "limpeza"
    setDone(true)
    setFinalizing(false)
    setTimeout(() => router.push('/mapa-quartos'), 1800)
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
          {stay.guests?.full_name} {stay.guests?.surname} · desde {new Date(stay.check_in_at).toLocaleDateString('pt-PT')}
        </p>
      </div>

      {loadingBreakdown ? (
        <div className="card text-center text-sm text-ink-muted py-8">A calcular valores...</div>
      ) : (
        <>
          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Resumo da conta</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Hospedagem</span><span className="font-medium">{Number(stay.room_value).toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between items-center"><span className="text-ink-muted flex items-center gap-1.5"><ShirtIcon size={13}/> Lavandaria</span><span className="font-medium">{laundryTotal.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between items-center"><span className="text-ink-muted flex items-center gap-1.5"><UtensilsCrossed size={13}/> Restaurante</span><span className="font-medium">{restaurantTotal.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between items-center"><span className="text-ink-muted flex items-center gap-1.5"><Wine size={13}/> Frigobar</span><span className="font-medium">{minibarTotal.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between pt-2 border-t border-border font-semibold"><span>Subtotal</span><span>{subtotal.toLocaleString('pt-AO')} Kz</span></div>
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14}/> Pagamentos
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Pago no check-in</span><span className="font-medium">{Number(stay.amount_paid_reservation).toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Pagamentos durante a estadia</span><span className="font-medium">{paymentsMade.toLocaleString('pt-AO')} Kz</span></div>
              <div className="flex justify-between pt-2 border-t border-border font-semibold"><span>Total pago</span><span>{totalPaid.toLocaleString('pt-AO')} Kz</span></div>
            </div>

            <div className="flex gap-2 pt-2">
              <input
                type="number"
                min="0"
                className="input flex-1"
                placeholder="Registar pagamento (Kz)"
                value={newPaymentAmount}
                onChange={e => setNewPaymentAmount(e.target.value)}
              />
              <select className="input w-36" value={newPaymentMethod} onChange={e => setNewPaymentMethod(e.target.value)}>
                <option value="numerario">Numerário</option>
                <option value="tpa">TPA</option>
                <option value="transferencia">Transferência</option>
              </select>
              <button
                type="button"
                onClick={registarPagamento}
                disabled={savingPayment || !newPaymentAmount}
                className="btn-secondary px-4"
              >
                {savingPayment ? '...' : 'Registar'}
              </button>
            </div>
          </div>

          <div className={`card ${saldoPendente > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-ink">Saldo Pendente</span>
              <span className={`text-xl font-bold ${saldoPendente > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {saldoPendente.toLocaleString('pt-AO')} Kz
              </span>
            </div>
            {saldoPendente > 0 && (
              <p className="text-xs text-amber-700 mt-1">Ainda há um valor em falta antes de finalizar.</p>
            )}
          </div>

          {stay.billed_to === 'empresa' && (
            <div className="card border-brand-200 bg-brand-50 text-sm text-brand-700">
              Facturação a crédito — {stay.company_name || 'empresa não especificada'}
            </div>
          )}

          <button
            onClick={finalizarHospedagem}
            disabled={finalizing}
            className="btn-primary w-full py-3"
          >
            {finalizing ? 'A finalizar...' : 'Finalizar Hospedagem'}
          </button>
        </>
      )}
    </div>
  )
}
