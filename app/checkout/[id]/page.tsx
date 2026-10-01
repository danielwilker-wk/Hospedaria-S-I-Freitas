'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle, Printer } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function CheckoutPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [stay, setStay] = useState<any>(null)
  const [charges, setCharges] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('numerario')
  const [bankName, setBankName] = useState('BIC')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data: stayData } = await supabase
        .from('stays')
        .select(`*, rooms(number, room_types(name)), guests(full_name, surname, nationality, document_number)`)
        .eq('id', id)
        .single()

      const { data: chargesData } = await supabase
        .from('stay_charges')
        .select('*')
        .eq('stay_id', id)
        .eq('paid_now', false)

      setStay(stayData)
      setCharges(chargesData ?? [])
      setLoading(false)
    }
    load()
  }, [id, router])

  const pendingCharges = charges.filter(c => !c.paid_now)
  const pendingTotal = pendingCharges.reduce((sum, c) => sum + Number(c.amount), 0)
  const totalCheckout = Number(stay?.amount_due ?? 0) + pendingTotal

  async function handleCheckout() {
    setSaving(true)
    const supabase = createClient()
    const now = new Date().toISOString()

    // 1. Finalizar a estadia
    await supabase.from('stays').update({
      status: 'finalizado',
      check_out_at: now,
      checked_out_verified_by: staffId,
      amount_due: 0,
    }).eq('id', id)

    // 2. Registar pagamento do check-out
    if (totalCheckout > 0) {
      await supabase.from('payments').insert({
        property_id: PROPERTY_ID,
        source_type: 'stay',
        source_id: id,
        amount: totalCheckout,
        method: paymentMethod,
        bank_name: paymentMethod === 'tpa' ? bankName : null,
        recorded_by: staffId,
      })
    }

    // 3. Quarto passa para limpeza
    await supabase.from('rooms').update({ status: 'limpeza' }).eq('id', stay.room_id)

    // 4. Registar documento de check-out
    await supabase.from('checkout_documents').upsert({
      property_id: PROPERTY_ID,
      stay_id: id,
      generated_at: now,
    }, { onConflict: 'stay_id' })

    setSaving(false)
    setDone(true)
  }

  function printReceipt() {
    const nights = stay?.check_out_planned_at
      ? Math.ceil((new Date().getTime() - new Date(stay.check_in_at).getTime()) / (1000 * 60 * 60 * 24))
      : 1

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Comprovativo de Check-out</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 40px auto; color: #1a1714; }
          .header { text-align: center; border-bottom: 2px solid #F05A00; padding-bottom: 16px; margin-bottom: 20px; }
          .logo { color: #F05A00; font-size: 24px; font-weight: bold; }
          .sub { color: #6b6560; font-size: 12px; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e8e8e8; font-size: 13px; }
          .row.total { font-weight: bold; font-size: 15px; border-bottom: 2px solid #F05A00; color: #F05A00; }
          .section { margin: 16px 0 8px; font-size: 11px; font-weight: bold; color: #6b6560; text-transform: uppercase; letter-spacing: 1px; }
          .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #a09b96; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">S&I Freitas, Lda.</div>
          <div class="sub">Hotelaria, Comércio e Serviços</div>
          <div class="sub">NIF: 5000065919 · Lubango, Angola</div>
        </div>

        <div class="section">Comprovativo de Check-out</div>
        <div class="row"><span>Data</span><span>${new Date().toLocaleDateString('pt-AO')}</span></div>
        <div class="row"><span>Hóspede</span><span>${stay?.guests?.full_name} ${stay?.guests?.surname ?? ''}</span></div>
        <div class="row"><span>Documento</span><span>${stay?.guests?.document_number ?? '—'}</span></div>
        <div class="row"><span>Quarto</span><span>Nº ${stay?.rooms?.number} — ${stay?.rooms?.room_types?.name}</span></div>
        <div class="row"><span>Check-in</span><span>${new Date(stay?.check_in_at).toLocaleDateString('pt-AO')}</span></div>
        <div class="row"><span>Check-out</span><span>${new Date().toLocaleDateString('pt-AO')}</span></div>
        <div class="row"><span>Noites</span><span>${nights}</span></div>

        <div class="section">Detalhes do Pagamento</div>
        <div class="row"><span>Alojamento</span><span>${Number(stay?.room_value ?? 0).toLocaleString('pt-AO')} Kz</span></div>
        ${pendingCharges.map(c => `<div class="row"><span>${c.charge_type} — ${c.description}</span><span>${Number(c.amount).toLocaleString('pt-AO')} Kz</span></div>`).join('')}
        <div class="row"><span>Pago na reserva</span><span>- ${Number(stay?.amount_paid_reservation ?? 0).toLocaleString('pt-AO')} Kz</span></div>
        <div class="row total"><span>Total pago</span><span>${totalCheckout.toLocaleString('pt-AO')} Kz</span></div>
        <div class="row"><span>Método</span><span>${paymentMethod === 'numerario' ? 'Numerário' : paymentMethod === 'tpa' ? `TPA (${bankName})` : 'Transferência'}</span></div>

        <div class="footer">
          <p>Obrigado pela sua visita!</p>
          <p>hospedaria-s-i-freitas.vercel.app</p>
        </div>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>
  if (!stay) return <div className="text-center py-12 text-ink-muted">Estadia não encontrada.</div>

  if (done) return (
    <div className="max-w-md mx-auto text-center space-y-6 py-16">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <CheckCircle size={32} className="text-green-600"/>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-ink">Check-out concluído!</h2>
        <p className="text-ink-muted mt-1">O quarto {stay.rooms?.number} foi colocado em modo de limpeza.</p>
      </div>
      <div className="flex gap-3 justify-center">
        <button onClick={printReceipt} className="btn-secondary flex items-center gap-2">
          <Printer size={15}/> Imprimir comprovativo
        </button>
        <Link href="/hospedes" className="btn-primary">Ver hóspedes</Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/hospedes/${id}`} className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Check-out</h1>
          <p className="text-sm text-ink-muted">
            {stay.guests?.full_name} {stay.guests?.surname} · Quarto {stay.rooms?.number}
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Resumo da estadia</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-ink-muted">Alojamento ({stay.rooms?.room_types?.name})</span>
            <span className="font-medium">{Number(stay.room_value).toLocaleString('pt-AO')} Kz</span>
          </div>
          {pendingCharges.map(c => (
            <div key={c.id} className="flex justify-between py-2 border-b border-surface-border">
              <span className="text-ink-muted capitalize">{c.charge_type} — {c.description}</span>
              <span className="font-medium">{Number(c.amount).toLocaleString('pt-AO')} Kz</span>
            </div>
          ))}
          {stay.amount_paid_reservation > 0 && (
            <div className="flex justify-between py-2 border-b border-surface-border text-green-600">
              <span>Pago na reserva</span>
              <span className="font-medium">- {Number(stay.amount_paid_reservation).toLocaleString('pt-AO')} Kz</span>
            </div>
          )}
          <div className="flex justify-between py-2 font-bold text-base">
            <span>Total a receber</span>
            <span className="text-brand-500">{totalCheckout.toLocaleString('pt-AO')} Kz</span>
          </div>
        </div>
      </div>

      {/* Pagamento */}
      <div className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Forma de pagamento</h2>
        <div className="flex gap-2">
          {['numerario', 'tpa', 'transferencia'].map(m => (
            <button key={m} onClick={() => setPaymentMethod(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${paymentMethod === m ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted'}`}>
              {m === 'numerario' ? 'Numerário' : m === 'tpa' ? 'TPA' : 'Transferência'}
            </button>
          ))}
        </div>
        {paymentMethod === 'tpa' && (
          <select className="input" value={bankName} onChange={e => setBankName(e.target.value)}>
            {['BIC', 'BFA', 'BAI', 'BCI', 'BNI', 'ATLANTICO'].map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}
      </div>

      <button onClick={handleCheckout} disabled={saving} className="btn-primary w-full py-3 text-base">
        {saving ? 'A processar...' : `Confirmar Check-out · ${totalCheckout.toLocaleString('pt-AO')} Kz`}
      </button>
    </div>
  )
}
