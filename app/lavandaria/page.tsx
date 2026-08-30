'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WashingMachine, Plus, CheckCircle } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function LavandariaPage() {
  const router = useRouter()
  const [stays, setStays] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ stay_id: '', description: '', value: '' })
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data: stayData } = await supabase
        .from('stays')
        .select('*, rooms(number, id), guests(full_name)')
        .eq('property_id', PROPERTY_ID)
        .eq('status', 'ativo')

      const { data: recData } = await supabase
        .from('laundry_records')
        .select('*, stays(rooms(number), guests(full_name))')
        .eq('property_id', PROPERTY_ID)
        .eq('record_date', today)
        .order('created_at', { ascending: false })

      setStays(stayData ?? [])
      setRecords(recData ?? [])
      setLoading(false)
    }
    load()
  }, [router, today])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const stay = stays.find(s => s.id === form.stay_id)

    const { data, error } = await supabase
      .from('laundry_records')
      .insert({
        property_id: PROPERTY_ID,
        stay_id: form.stay_id || null,
        room_id: stay?.rooms?.id ?? null,
        record_date: today,
        description: form.description,
        value: Number(form.value),
        recorded_by: staffId,
      })
      .select('*, stays(rooms(number), guests(full_name))')
      .single()

    if (!error && data) {
      setRecords(prev => [data, ...prev])
      setSuccess(true)
      setForm({ stay_id: '', description: '', value: '' })
      setShowForm(false)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  const totalDia = records.reduce((sum, r) => sum + Number(r.value), 0)

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <WashingMachine size={20} className="text-brand-500"/> Lavandaria
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {new Date().toLocaleDateString('pt-AO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="card text-center px-4 py-2">
            <div className="text-lg font-bold text-brand-500">{totalDia.toLocaleString('pt-AO')} Kz</div>
            <div className="text-xs text-ink-muted">total hoje</div>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={15}/> Novo pedido
          </button>
        </div>
      </div>

      {success && (
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700">
          <CheckCircle size={18}/><span className="font-medium">Pedido registado com sucesso!</span>
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="card space-y-4 border-brand-200">
          <h2 className="text-sm font-semibold text-ink">Novo pedido de lavandaria</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Quarto / Hóspede</label>
              <select className="input" value={form.stay_id} onChange={e => setForm(p => ({ ...p, stay_id: e.target.value }))}>
                <option value="">Seleccionar (opcional)</option>
                {stays.map(s => (
                  <option key={s.id} value={s.id}>
                    Quarto {s.rooms?.number} — {s.guests?.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Descrição dos itens</label>
              <input type="text" required className="input" placeholder="Ex: 2 camisas, 1 calça" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Valor (Kz)</label>
              <input type="number" required min="0" className="input" placeholder="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))}/>
            </div>
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

      {/* Lista de pedidos do dia */}
      {records.length === 0 ? (
        <div className="card text-center py-12 text-ink-muted">
          <WashingMachine size={32} className="mx-auto mb-2 opacity-30"/>
          <p>Sem pedidos de lavandaria hoje.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted border-b border-surface-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Quarto</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Descrição</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-ink-muted uppercase tracking-wide">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3 font-medium text-ink">
                    {r.stays?.rooms?.number ? `Nº ${r.stays.rooms.number}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.description}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">
                    {Number(r.value).toLocaleString('pt-AO')} Kz
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-muted font-bold">
                <td colSpan={2} className="px-4 py-3 text-ink">Total</td>
                <td className="px-4 py-3 text-right text-brand-500">{totalDia.toLocaleString('pt-AO')} Kz</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
