'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, Trash2 } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type Attendant = { id: string; full_name: string; active: boolean }

export default function FuncionariosPage() {
  const [items, setItems] = useState<Attendant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('attendants')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .order('full_name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('attendants').insert({
      property_id: PROPERTY_ID,
      full_name: name.trim(),
    })
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    setName('')
    setSaving(false)
    load()
  }

  async function toggleActive(item: Attendant) {
    const supabase = createClient()
    await supabase.from('attendants').update({ active: !item.active }).eq('id', item.id)
    load()
  }

  async function remove(item: Attendant) {
    if (!confirm(`Remover "${item.full_name}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('attendants').delete().eq('id', item.id)
    if (error) { alert('Não é possível remover (já tem vendas associadas). Podes desativar em vez de remover.'); return }
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Users size={20} className="text-brand-500" /> Funcionários — Restaurante e Bar
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Nomes disponíveis para assinar quem atendeu cada venda. Não precisam de login.
        </p>
      </div>

      <form onSubmit={handleAdd} className="card flex gap-3">
        <input
          type="text"
          className="input flex-1"
          placeholder="Nome do funcionário"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-5">
          <Plus size={16} /> {saving ? 'A adicionar...' : 'Adicionar'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">Ainda não há funcionários registados.</p>
      ) : (
        <div className="card divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="py-2.5 flex items-center justify-between">
              <p className={`font-medium ${item.active ? 'text-ink' : 'text-ink-light line-through'}`}>{item.full_name}</p>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleActive(item)} className="text-xs font-medium text-brand-500">
                  {item.active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => remove(item)} className="text-ink-light hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
