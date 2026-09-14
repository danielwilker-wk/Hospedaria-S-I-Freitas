'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UtensilsCrossed, Search, Plus, Minus, CheckCircle } from 'lucide-react'
import type { MenuItem } from '@/types'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type CartItem = { menuItem: MenuItem; quantity: number }

type ActiveStayOption = {
  id: string
  rooms: { number: string }
  guests: { full_name: string; surname: string | null }
}

export default function RestauranteVendaPage() {
  const [staffId, setStaffId] = useState('')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])

  const [guestType, setGuestType] = useState<'hospede' | 'nao_hospede'>('nao_hospede')
  const [staySearch, setStaySearch] = useState('')
  const [stayResults, setStayResults] = useState<ActiveStayOption[]>([])
  const [selectedStay, setSelectedStay] = useState<ActiveStayOption | null>(null)
  const [guestName, setGuestName] = useState('')

  const [amountReceived, setAmountReceived] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('numerario')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStaffId(session.user.id)
    })
    supabase
      .from('menu_items')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .eq('active', true)
      .order('category')
      .order('name')
      .then(({ data }) => setMenuItems(data ?? []))
  }, [])

  async function searchStays(e: React.FormEvent) {
    e.preventDefault()
    if (!staySearch.trim()) return
    const supabase = createClient()
    const { data } = await supabase
      .from('stays')
      .select('id, rooms(number), guests(full_name, surname)')
      .eq('property_id', PROPERTY_ID)
      .eq('status', 'ativo')

    const q = staySearch.trim().toLowerCase()
    const filtered = (data ?? []).filter((s: any) =>
      s.rooms?.number?.toLowerCase().includes(q) ||
      s.guests?.full_name?.toLowerCase().includes(q) ||
      s.guests?.surname?.toLowerCase().includes(q)
    )
    setStayResults(filtered as any)
  }

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id)
      if (existing) return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { menuItem: item, quantity: 1 }]
    })
  }

  function changeQty(itemId: string, delta: number) {
    setCart(prev => prev
      .map(c => c.menuItem.id === itemId ? { ...c, quantity: c.quantity + delta } : c)
      .filter(c => c.quantity > 0)
    )
  }

  const total = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0)
  const troco = amountReceived ? Number(amountReceived) - total : 0

  const canFinalize = cart.length > 0 &&
    (guestType === 'nao_hospede' ? true : !!selectedStay) &&
    Number(amountReceived) >= total

  async function finalizeSale() {
    setSaving(true)
    const supabase = createClient()

    const { data: sale, error: saleError } = await supabase
      .from('restaurant_sales')
      .insert({
        property_id: PROPERTY_ID,
        guest_type: guestType,
        stay_id: guestType === 'hospede' ? selectedStay?.id : null,
        guest_name: guestType === 'nao_hospede' ? (guestName || null) : null,
        value: total,
        amount_received: Number(amountReceived),
        change_given: troco,
        payment_method: paymentMethod,
        recorded_by: staffId,
      })
      .select()
      .single()

    if (saleError) { alert('Erro ao registar venda: ' + saleError.message); setSaving(false); return }

    const items = cart.map(c => ({
      sale_id: sale.id,
      menu_item_id: c.menuItem.id,
      quantity: c.quantity,
      unit_price: c.menuItem.price,
    }))
    const { error: itemsError } = await supabase.from('restaurant_sale_items').insert(items)
    if (itemsError) { alert('Venda registada mas houve erro nos itens: ' + itemsError.message) }

    setSuccess(true)
    setSaving(false)
    setTimeout(() => {
      setCart([])
      setSelectedStay(null)
      setStaySearch('')
      setGuestName('')
      setAmountReceived('')
      setSuccess(false)
    }, 1800)
  }

  const grouped = menuItems.reduce((acc: Record<string, MenuItem[]>, item) => {
    const key = item.category || 'Outros'
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6">
      {/* Menu */}
      <div className="col-span-2 space-y-4">
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <UtensilsCrossed size={20} className="text-brand-500" /> Restaurante — Venda
        </h1>

        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="card space-y-2">
            <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wide">{category}</h3>
            <div className="grid grid-cols-2 gap-2">
              {catItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="text-left px-3 py-2.5 border border-border rounded-lg hover:border-brand-500 transition"
                >
                  <p className="font-medium text-sm text-ink">{item.name}</p>
                  <p className="text-xs text-ink-muted">{Number(item.price).toLocaleString('pt-AO')} Kz</p>
                </button>
              ))}
            </div>
          </div>
        ))}
        {menuItems.length === 0 && (
          <p className="text-sm text-ink-muted text-center py-8">
            Nenhum prato no menu ainda. Adiciona pratos em Sala de Refeições → Gerir Menu.
          </p>
        )}
      </div>

      {/* Carrinho / Checkout */}
      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Cliente</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setGuestType('nao_hospede')}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${guestType === 'nao_hospede' ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted'}`}
            >
              Não-hóspede
            </button>
            <button
              onClick={() => setGuestType('hospede')}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${guestType === 'hospede' ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted'}`}
            >
              Hóspede
            </button>
          </div>

          {guestType === 'nao_hospede' ? (
            <input type="text" className="input" placeholder="Nome (opcional)" value={guestName} onChange={e => setGuestName(e.target.value)} />
          ) : selectedStay ? (
            <div className="flex items-center justify-between bg-surface-muted rounded-lg p-2.5 text-sm">
              <span className="font-medium">Quarto {selectedStay.rooms?.number} — {selectedStay.guests?.full_name}</span>
              <button onClick={() => setSelectedStay(null)} className="text-brand-500 text-xs font-semibold">Trocar</button>
            </div>
          ) : (
            <form onSubmit={searchStays} className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-light" />
                <input type="text" className="input pl-8 text-sm" placeholder="Quarto, nome ou BI..." value={staySearch} onChange={e => setStaySearch(e.target.value)} />
              </div>
              {stayResults.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedStay(s); setStayResults([]) }}
                  className="w-full text-left text-sm px-2.5 py-1.5 rounded-lg hover:bg-surface-muted"
                >
                  Quarto {s.rooms?.number} — {s.guests?.full_name} {s.guests?.surname}
                </button>
              ))}
            </form>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Pedido</h2>
          {cart.length === 0 ? (
            <p className="text-xs text-ink-muted py-2">Nenhum item selecionado.</p>
          ) : (
            <div className="space-y-1.5">
              {cart.map(c => (
                <div key={c.menuItem.id} className="flex items-center justify-between text-sm">
                  <span className="flex-1">{c.menuItem.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(c.menuItem.id, -1)} className="w-5 h-5 rounded-full bg-surface-muted flex items-center justify-center"><Minus size={11}/></button>
                    <span className="w-5 text-center">{c.quantity}</span>
                    <button onClick={() => changeQty(c.menuItem.id, 1)} className="w-5 h-5 rounded-full bg-surface-muted flex items-center justify-center"><Plus size={11}/></button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border font-semibold text-sm">
                <span>Total</span><span>{total.toLocaleString('pt-AO')} Kz</span>
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Pagamento</h2>
          <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="numerario">Numerário</option>
            <option value="tpa">TPA</option>
            <option value="transferencia">Transferência</option>
          </select>
          <input type="number" min="0" className="input" placeholder="Valor entregue (Kz)" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} />
          {amountReceived && Number(amountReceived) >= total && (
            <div className="flex justify-between text-sm bg-surface-muted rounded-lg p-2.5">
              <span className="text-ink-muted">Troco</span>
              <span className="font-bold text-brand-500">{troco.toLocaleString('pt-AO')} Kz</span>
            </div>
          )}
        </div>

        {success ? (
          <div className="card border-green-300 bg-green-50 flex items-center gap-2 text-green-700 justify-center py-3">
            <CheckCircle size={18}/> <span className="font-medium">Venda registada!</span>
          </div>
        ) : (
          <button onClick={finalizeSale} disabled={!canFinalize || saving} className="btn-primary w-full py-3">
            {saving ? 'A finalizar...' : 'Finalizar Venda'}
          </button>
        )}
      </div>
    </div>
  )
}
