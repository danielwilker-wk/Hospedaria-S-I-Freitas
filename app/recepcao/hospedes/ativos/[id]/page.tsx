'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, CheckCircle, CreditCard, Clock } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const CHARGE_TYPES = [
  { value: 'bar',         label: 'Bar' },
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'lavandaria',  label: 'Lavandaria' },
  { value: 'frigobar',    label: 'Frigobar' },
  { value: 'outro',       label: 'Outro' },
]

export default function FichaHospedePage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [stay, setStay] = useState<any>(null)
  const [charges, setCharges] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [staffId, setStaffId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    charge_type: 'bar',
    description: '',
    amount: '',
    paid_now: false,
    payment_method: 'numerario',
  })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data: stayData } = await supabase
        .from('stays')
        .select(`
          *,
          rooms(number, room_types(name)),
          guests(full_name, surname, nationality, document_number, phone)
        `)
        .eq('id', id)
        .single()

      const { data: chargesData } = await supabase
        .from('stay_charges')
        .select('*')
        .eq('stay_id', id)
        .order('created_at', { ascending: false })

      setStay(stayData)
      setCharges(chargesData ?? [])
      setLoading(false)
    }
    load()
  }, [id, router])

  const pendingTotal = charges.filter(c => !c.paid_now).reduce((sum, c) => sum + Number(c.amount), 0)
  const paidTotal = charges.filter(c => c.paid_now).reduce((sum, c) => sum + Number(c.amount), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('stay_charges')
      .insert({
        property_id: PROPERTY_ID,
        stay_id: id,
        charge_type: form.charge_type,
        description: form.description,
        amount: Number(form.amount),
        paid_now: form.paid_now,
        payment_method: form.paid_now ? form.payment_method : null,
        recorded_by: staffId,
      })
      .select()
      .single()

    if (!error && data) {
      setCharges(prev => [data, ...prev])
      if (!form.paid_now) {
        await supabase
          .from('stays')
          .update({ amount_due: (stay.amount_due ?? 0) + Number(form.amount) })
          .eq('id', id)
        setStay((prev: any) => ({ ...prev, amount_due: (prev.amount_due ?? 0) + Number(form.amount) }))
      }
      setSuccess(true)
      setForm({ charge_type: 'bar', description: '', amount: '', paid_now: false, payment_method: 'numerario' })
      setShowForm(false)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-ink-muted text-sm">A carregar...</p>
    </div>
  )
  if (!stay) return <div className="text-center py-12 text-ink-muted">Estadia não encontrada.</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/recepcao/hospedes/ativos" className="btn-ghost p-2">
          <ArrowLeft size={16}/>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {stay.guests?.full_name} {stay.guests?.surname}
          </h1>
          <p className="text-sm text-ink-muted">
            Quarto {stay.rooms?.number} · {stay.rooms?.room_types?.name} · {stay.occupancy}
          </p>
        </div>
      </div>

      {success && (
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700">
          <CheckCircle size={16}/>
          <span className="font-medium text-sm">Consumo registado!</span>
        </div>
      )}

      {/* Resumo financeiro */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-ink-muted mb-1">Alojamento</p>
          <p className="font-bold text-ink">{Number(stay.room_value).toLocaleString('pt-AO')} Kz</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-ink-muted mb-1">Pagos durante estadia</p>
          <p className="font-bold text-green-600">{paidTotal.toLocaleString('pt-AO')} Kz</p>
        </div>
        <div className="card text-center border-brand-200">
          <p className="text-xs text-ink-muted mb-1">Total no check-out</p>
          <p className="font-bold text-brand-500">
            {(Number(stay.amount_due) + pendingTotal).toLocaleString('pt-AO')} Kz
          </p>
        </div>
      </div>

      {/* Dados do hóspede */}
      <div className="card space-y-2">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Dados do Hóspede</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Documento</span>
            <span>{stay.guests?.document_number || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Nacionalidade</span>
            <span>{stay.guests?.nationality || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Telemóvel</span>
            <span>{stay.guests?.phone || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Check-in</span>
            <span>{new Date(stay.check_in_at).toLocaleDateString('pt-AO')}</span>
          </div>
          {stay.check_out_planned_at && (
            <div className="flex justify-between">
              <span className="text-ink-muted">Check-out previsto</span>
              <span>{new Date(stay.check_out_planned_at).toLocaleDateString('pt-AO')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Consumos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Consumos durante a estadia</h2>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14}/> Adicionar
          </button>
        </div>

        {showForm && (
          <div className="card border-brand-200 space-y-4">
            <h3 className="text-sm font-semibold text-ink">Novo consumo</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={form.charge_type}
                    onChange={e => setForm(p => ({ ...p, charge_type: e.target.value }))}>
                    {CHARGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Valor (Kz)</label>
                  <input type="number" required min="0" className="input" placeholder="0"
                    value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className="label">Descrição</label>
                <input type="text" required className="input" placeholder="Ex: 2 cervejas, 1 refeição..."
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/>
              </div>
              <div>
                <label className="label">Pagamento</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(p => ({ ...p, paid_now: false }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 
                      ${!form.paid_now ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted'}`}>
                    <Clock size={13}/> Debitar no check-out
                  </button>
                  <button type="button" onClick={() => setForm(p => ({ ...p, paid_now: true }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5
                      ${form.paid_now ? 'bg-green-500 text-white' : 'bg-surface-muted text-ink-muted'}`}>
                    <CreditCard size={13}/> Pago agora
                  </button>
                </div>
              </div>
              {form.paid_now && (
                <div>
                  <label className="label">Método de pagamento</label>
                  <select className="input" value={form.payment_method}
                    onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                    <option value="numerario">Numerário</option>
                    <option value="tpa">TPA</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'A guardar...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {charges.length === 0 ? (
          <div className="card text-center py-8 text-ink-muted text-sm">
            Sem consumos registados.
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted border-b border-surface-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase">Descrição</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-ink-muted uppercase">Valor</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-ink-muted uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {charges.map(c => (
                  <tr key={c.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3 font-medium capitalize">{c.charge_type}</td>
                    <td className="px-4 py-3 text-ink-muted">{c.description}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {Number(c.amount).toLocaleString('pt-AO')} Kz
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.paid_now
                        ? <span className="badge-enviado">Pago</span>
                        : <span className="badge-rascunho">No check-out</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Link
          href={`/recepcao/checkout/${id}`}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          Avançar para Check-out
        </Link>
      </div>
    </div>
  )
}
