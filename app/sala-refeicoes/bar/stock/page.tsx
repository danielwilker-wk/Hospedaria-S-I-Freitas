'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wine, Plus, ArrowDownCircle, ArrowUpCircle, Pencil, Check, X, History } from 'lucide-react'
import type { BarProduct } from '@/types'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function BarStockPage() {
  const [attendants, setAttendants] = useState<{ id: string; full_name: string }[]>([])
  const [products, setProducts] = useState<BarProduct[]>([])
  const [loading, setLoading] = useState(true)

  const [newProduct, setNewProduct] = useState({ name: '', unit: 'unidade', price: '', stock_quantity: '0' })
  const [savingProduct, setSavingProduct] = useState(false)

  const [movementAttendantId, setMovementAttendantId] = useState('')
  const [movementProductId, setMovementProductId] = useState('')
  const [movementType, setMovementType] = useState<'entrada' | 'saida'>('entrada')
  const [movementQty, setMovementQty] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [savingMovement, setSavingMovement] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', unit: '', price: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  type Hist = {
    id: string; product_id: string; stock_antes: number | null; stock_depois: number; variacao: number
    origem: string; motivo: string | null; staff_nome: string | null; atendente_nome: string | null; changed_at: string
  }
  const [history, setHistory] = useState<Hist[]>([])
  const [histProduct, setHistProduct] = useState('')
  const [histDays, setHistDays] = useState(30)
  const [loadingHist, setLoadingHist] = useState(false)

  async function loadHistory() {
    setLoadingHist(true)
    const supabase = createClient()
    const desde = new Date(Date.now() - histDays * 24 * 3600 * 1000).toISOString()
    let q = supabase.from('bar_stock_history').select('*').gte('changed_at', desde).order('changed_at', { ascending: false }).limit(300)
    if (histProduct) q = q.eq('product_id', histProduct)
    const { data } = await q
    setHistory((data as Hist[]) ?? [])
    setLoadingHist(false)
  }

  useEffect(() => { loadHistory() }, [histProduct, histDays])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('bar_products')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .order('name')
    setProducts(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('attendants')
      .select('id, full_name')
      .eq('property_id', PROPERTY_ID)
      .eq('department', 'sala_refeicoes')
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => setAttendants(data ?? []))
    load()
  }, [])

  async function addProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!newProduct.name || !newProduct.price) return
    setSavingProduct(true)
    const supabase = createClient()
    const { error } = await supabase.from('bar_products').insert({
      property_id: PROPERTY_ID,
      name: newProduct.name,
      unit: newProduct.unit,
      price: Number(newProduct.price),
      stock_quantity: Number(newProduct.stock_quantity),
    })
    if (error) { alert('Erro: ' + error.message); setSavingProduct(false); return }
    setNewProduct({ name: '', unit: 'unidade', price: '', stock_quantity: '0' })
    setSavingProduct(false)
    load()
  }

  async function registerMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!movementProductId || !movementQty || !movementAttendantId) return
    setSavingMovement(true)
    const supabase = createClient()
    const product = products.find(p => p.id === movementProductId)
    if (!product) { setSavingMovement(false); return }

    const qty = Number(movementQty)
    if (movementType === 'saida' && product.stock_quantity - qty < 0) {
      alert('Não é possível retirar mais do que o stock atual.')
      setSavingMovement(false)
      return
    }

    const { error: movError } = await supabase.rpc('ajustar_stock_bar', {
      p_product: movementProductId,
      p_tipo: movementType,
      p_qty: qty,
      p_motivo: movementReason || null,
      p_atendente: movementAttendantId,
    })
    if (movError) { alert('Erro: ' + movError.message); setSavingMovement(false); return }

    setMovementProductId('')
    setMovementQty('')
    setMovementReason('')
    setMovementAttendantId('')
    setSavingMovement(false)
    load()
    loadHistory()
  }

  function startEdit(p: BarProduct) {
    setEditingId(p.id)
    setEditForm({ name: p.name, unit: p.unit, price: String(p.price) })
  }

  async function saveEdit(id: string) {
    if (!editForm.name || !editForm.price) return
    setSavingEdit(true)
    const supabase = createClient()
    const { error } = await supabase.from('bar_products').update({
      name: editForm.name,
      unit: editForm.unit,
      price: Number(editForm.price),
    }).eq('id', id)
    if (error) { alert('Erro: ' + error.message); setSavingEdit(false); return }
    setEditingId(null)
    setSavingEdit(false)
    load()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Wine size={20} className="text-brand-500" /> Bar — Produtos e Stock
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Gerir produtos, preços e movimentos de stock</p>
      </div>

      <form onSubmit={addProduct} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Adicionar produto</h2>
        <div className="grid grid-cols-4 gap-3">
          <input type="text" className="input col-span-2" placeholder="Nome" required value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} />
          <input type="text" className="input" placeholder="Unidade" value={newProduct.unit} onChange={e => setNewProduct(p => ({ ...p, unit: e.target.value }))} />
          <input type="number" className="input" placeholder="Preço (Kz)" required min="0" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} />
        </div>
        <input type="number" className="input" placeholder="Stock inicial" min="0" value={newProduct.stock_quantity} onChange={e => setNewProduct(p => ({ ...p, stock_quantity: e.target.value }))} />
        <button type="submit" disabled={savingProduct} className="btn-primary flex items-center gap-2 px-5 py-2">
          <Plus size={16} /> {savingProduct ? 'A adicionar...' : 'Adicionar Produto'}
        </button>
      </form>

      <form onSubmit={registerMovement} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Registar entrada / saída</h2>
        <select className="input" value={movementAttendantId} onChange={e => setMovementAttendantId(e.target.value)}>
          <option value="">Quem está a registar?</option>
          {attendants.map(a => (
            <option key={a.id} value={a.id}>{a.full_name}</option>
          ))}
        </select>
        <select className="input" value={movementProductId} onChange={e => setMovementProductId(e.target.value)}>
          <option value="">Seleccionar produto</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} (stock: {p.stock_quantity})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMovementType('entrada')} className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${movementType === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-surface-muted text-ink-muted'}`}>
            <ArrowDownCircle size={14}/> Entrada
          </button>
          <button type="button" onClick={() => setMovementType('saida')} className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${movementType === 'saida' ? 'bg-red-100 text-red-700' : 'bg-surface-muted text-ink-muted'}`}>
            <ArrowUpCircle size={14}/> Saída
          </button>
        </div>
        <input type="number" className="input" placeholder="Quantidade" min="1" value={movementQty} onChange={e => setMovementQty(e.target.value)} />
        <input type="text" className="input" placeholder="Motivo (ex: compra, quebra, ajuste)" value={movementReason} onChange={e => setMovementReason(e.target.value)} />
        <button type="submit" disabled={savingMovement || !movementProductId || !movementAttendantId} className="btn-primary w-full py-2.5">
          {savingMovement ? 'A registar...' : 'Registar Movimento'}
        </button>
      </form>

      <div className="card space-y-2">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Stock atual</h2>
        {loading ? (
          <p className="text-sm text-ink-muted text-center py-4">A carregar...</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-4">Ainda não há produtos.</p>
        ) : (
          <div className="divide-y divide-border">
            {products.map(p => (
              <div key={p.id} className="py-2.5">
                {editingId === p.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" className="input col-span-2 text-sm" placeholder="Nome" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      <input type="text" className="input text-sm" placeholder="Unidade" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                    </div>
                    <div className="flex gap-2">
                      <input type="number" min="0" className="input flex-1 text-sm" placeholder="Preço (Kz)" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} />
                      <button onClick={() => saveEdit(p.id)} disabled={savingEdit} className="btn-primary px-3 flex items-center gap-1 text-sm">
                        <Check size={14} /> {savingEdit ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary px-3 flex items-center gap-1 text-sm">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-muted">{Number(p.price).toLocaleString('pt-AO')} Kz / {p.unit}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold px-2.5 py-1 rounded-full text-xs ${p.stock_quantity <= 5 ? 'bg-red-50 text-red-600' : 'bg-surface-muted text-ink'}`}>
                        {p.stock_quantity} {p.unit}
                      </span>
                      <button onClick={() => { setHistProduct(p.id); document.getElementById('historico-stock')?.scrollIntoView({ behavior: 'smooth' }) }} className="text-ink-light hover:text-brand-500" title="Ver histórico de stock">
                        <History size={14} />
                      </button>
                      <button onClick={() => startEdit(p)} className="text-ink-light hover:text-brand-500">
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="historico-stock" className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
          <History size={13} /> Histórico de stock (antes → depois)
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <select className="input text-sm" value={histProduct} onChange={e => setHistProduct(e.target.value)}>
            <option value="">Todos os produtos</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input text-sm" value={histDays} onChange={e => setHistDays(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
        </div>
        {loadingHist ? (
          <p className="text-sm text-ink-muted text-center py-4">A carregar...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-4">Sem alterações de stock neste período. O histórico começa a ser guardado a partir de agora.</p>
        ) : (
          <div className="divide-y divide-border">
            {history.map(h => {
              const prod = products.find(p => p.id === h.product_id)
              const v = Number(h.variacao)
              return (
                <div key={h.id} className="py-2.5 text-sm flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{prod?.name ?? 'Produto'}</p>
                    <p className="text-xs text-ink-muted">
                      {new Date(h.changed_at).toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })} · {h.origem}
                      {h.motivo ? ` · ${h.motivo}` : ''}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {h.atendente_nome ? `${h.atendente_nome} · ` : ''}{h.staff_nome ? `login: ${h.staff_nome}` : 'sem utilizador (sistema)'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-ink">
                      {h.stock_antes === null ? '—' : Number(h.stock_antes)} → {Number(h.stock_depois)}
                    </p>
                    <p className={`text-xs font-medium ${v < 0 ? 'text-red-600' : 'text-green-600'}`}>{v > 0 ? '+' : ''}{v}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
