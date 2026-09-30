'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Plus, Trash2 } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type Company = { id: string; name: string; default_discount: boolean; active: boolean }

export default function EmpresasPage() {
  const [items, setItems] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [defaultDiscount, setDefaultDiscount] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('companies').insert({
      property_id: PROPERTY_ID,
      name: name.trim(),
      default_discount: defaultDiscount,
    })
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    setName('')
    setDefaultDiscount(false)
    setSaving(false)
    load()
  }

  async function toggleField(item: Company, field: 'active' | 'default_discount') {
    const supabase = createClient()
    await supabase.from('companies').update({ [field]: !item[field] }).eq('id', item.id)
    load()
  }

  async function remove(item: Company) {
    if (!confirm(`Remover "${item.name}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('companies').delete().eq('id', item.id)
    if (error) { alert('Não é possível remover (já tem estadias associadas). Podes desativar em vez de remover.'); return }
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Building2 size={20} className="text-brand-500" /> Empresas
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Empresas clientes para hospedagem a crédito. Marca "Desconto por defeito" para clientes correntes que costumam ter 10% de desconto.
        </p>
      </div>

      <form onSubmit={handleAdd} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Adicionar empresa</h2>
        <input
          type="text"
          className="input"
          placeholder="Nome da empresa (ex: N'gola)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={defaultDiscount} onChange={e => setDefaultDiscount(e.target.checked)} />
          Cliente corrente — sugerir desconto de 10% por defeito no check-in
        </label>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-5 py-2">
          <Plus size={16} /> {saving ? 'A adicionar...' : 'Adicionar'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">Ainda não há empresas registadas.</p>
      ) : (
        <div className="card divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="py-2.5 flex items-center justify-between">
              <div>
                <p className={`font-medium ${item.active ? 'text-ink' : 'text-ink-light line-through'}`}>{item.name}</p>
                {item.default_discount && (
                  <p className="text-xs text-brand-500 font-medium">Desconto de 10% por defeito</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleField(item, 'default_discount')} className="text-xs font-medium text-brand-500">
                  {item.default_discount ? 'Remover desconto padrão' : 'Marcar desconto padrão'}
                </button>
                <button onClick={() => toggleField(item, 'active')} className="text-xs font-medium text-brand-500">
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
