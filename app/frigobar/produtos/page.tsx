'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wine, Plus, Trash2 } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type MinibarProduct = {
  id: string
  name: string
  price: number
  active: boolean
}

export default function FrigobarProdutosPage() {
  const [items, setItems] = useState<MinibarProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', price: '' })

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('minibar_products')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.price) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('minibar_products').insert({
      property_id: PROPERTY_ID,
      name: form.name,
      price: Number(form.price),
    })
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    setForm({ name: '', price: '' })
    setSaving(false)
    load()
  }

  async function toggleActive(item: MinibarProduct) {
    const supabase = createClient()
    await supabase.from('minibar_products').update({ active: !item.active }).eq('id', item.id)
    load()
  }

  async function remove(item: MinibarProduct) {
    if (!confirm(`Remover "${item.name}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('minibar_products').delete().eq('id', item.id)
    if (error) { alert('Não é possível remover (já tem consumos associados). Podes desativar em vez de remover.'); return }
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Wine size={20} className="text-brand-500" /> Produtos do Frigobar
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Itens disponíveis nos frigobares dos quartos</p>
      </div>

      <form onSubmit={handleAdd} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Adicionar produto</h2>
        <div className="grid grid-cols-3 gap-3">
          <input type="text" className="input col-span-2" placeholder="Nome (ex: Água, Coca-Cola...)" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input type="number" className="input" placeholder="Preço (Kz)" required min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-5 py-2">
          <Plus size={16} /> {saving ? 'A adicionar...' : 'Adicionar'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">Ainda não há produtos no frigobar.</p>
      ) : (
        <div className="card divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="py-2.5 flex items-center justify-between">
              <div>
                <p className={`font-medium ${item.active ? 'text-ink' : 'text-ink-light line-through'}`}>{item.name}</p>
                <p className="text-xs text-ink-muted">{Number(item.price).toLocaleString('pt-AO')} Kz</p>
              </div>
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
