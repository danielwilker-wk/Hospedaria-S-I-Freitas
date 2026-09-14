'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UtensilsCrossed, Plus, Trash2 } from 'lucide-react'
import type { MenuItem } from '@/types'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function MenuRestauranteAdminPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ name: '', price: '', category: '' })

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .order('category')
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
    const { error } = await supabase.from('menu_items').insert({
      property_id: PROPERTY_ID,
      name: form.name,
      price: Number(form.price),
      category: form.category || null,
    })
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    setForm({ name: '', price: '', category: '' })
    setSaving(false)
    load()
  }

  async function toggleActive(item: MenuItem) {
    const supabase = createClient()
    await supabase.from('menu_items').update({ active: !item.active }).eq('id', item.id)
    load()
  }

  async function remove(item: MenuItem) {
    if (!confirm(`Remover "${item.name}" do menu?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
    if (error) { alert('Não é possível remover (já tem vendas associadas). Podes desativar em vez de remover.'); return }
    load()
  }

  const grouped = items.reduce((acc: Record<string, MenuItem[]>, item) => {
    const key = item.category || 'Sem categoria'
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <UtensilsCrossed size={20} className="text-brand-500" /> Menu do Restaurante
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Pratos disponíveis para venda</p>
      </div>

      <form onSubmit={handleAdd} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Adicionar prato</h2>
        <div className="grid grid-cols-3 gap-3">
          <input type="text" className="input col-span-1" placeholder="Categoria (ex: Prato principal)" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
          <input type="text" className="input col-span-1" placeholder="Nome do prato" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input type="number" className="input col-span-1" placeholder="Preço (Kz)" required min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-5 py-2">
          <Plus size={16} /> {saving ? 'A adicionar...' : 'Adicionar'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">Ainda não há pratos no menu.</p>
      ) : (
        Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="card space-y-2">
            <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wide">{category}</h3>
            <div className="divide-y divide-border">
              {catItems.map(item => (
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
          </div>
        ))
      )}
    </div>
  )
}
