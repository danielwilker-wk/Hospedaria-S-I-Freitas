'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pencil, CheckCircle } from 'lucide-react'

const BANKS = ['BIC', 'BAI', 'BFA', 'BCI', 'BNI', 'ATLANTICO']
const METHODS: Record<string, string> = { numerario: 'Numerário', tpa: 'TPA', transferencia: 'Transferência' }
const ORIGEM: Record<string, string> = {
  stay: 'Estadia', laundry: 'Lavandaria', minibar: 'Frigobar', restaurant: 'Restaurante (conta)', bar: 'Bar (conta)',
  restaurant_sales: 'Restaurante (venda)', bar_sales: 'Bar (venda)',
}
const kz = (n: number) => `${Number(n).toLocaleString('pt-AO')} Kz`

type Row = {
  tabela: 'payments' | 'restaurant_sales' | 'bar_sales'
  id: string; quando: string; origem: string; quem: string
  valor: number; method: string; bank: string | null
}

export default function CorrigirPagamentosPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(3)
  const [editId, setEditId] = useState<string | null>(null)
  const [method, setMethod] = useState('numerario')
  const [bank, setBank] = useState('BIC')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString()
    const [{ data: pays }, { data: rest }, { data: bar }] = await Promise.all([
      supabase.from('payments').select('id, source_type, source_id, amount, method, bank_name, paid_at').gte('paid_at', desde).order('paid_at', { ascending: false }),
      supabase.from('restaurant_sales').select('id, stay_id, guest_name, value, payment_method, bank_name, created_at').not('payment_method', 'is', null).gte('created_at', desde),
      supabase.from('bar_sales').select('id, stay_id, guest_name, payment_method, bank_name, created_at, bar_sale_items(subtotal)').not('payment_method', 'is', null).gte('created_at', desde),
    ])
    const stayIds = Array.from(new Set([
      ...(pays ?? []).map((p: any) => p.source_id),
      ...(rest ?? []).map((r: any) => r.stay_id),
      ...(bar ?? []).map((b: any) => b.stay_id),
    ].filter(Boolean)))
    const stayMap: Record<string, string> = {}
    if (stayIds.length) {
      const { data: stays } = await supabase.from('stays').select('id, rooms(number), guests(full_name, surname)').in('id', stayIds)
      ;(stays ?? []).forEach((s: any) => {
        stayMap[s.id] = `Quarto ${s.rooms?.number ?? '?'} · ${s.guests?.full_name ?? ''} ${s.guests?.surname ?? ''}`.trim()
      })
    }
    const out: Row[] = []
    ;(pays ?? []).forEach((p: any) => out.push({
      tabela: 'payments', id: p.id, quando: p.paid_at, origem: ORIGEM[p.source_type] ?? p.source_type,
      quem: stayMap[p.source_id] ?? '—', valor: Number(p.amount), method: p.method, bank: p.bank_name,
    }))
    ;(rest ?? []).forEach((r: any) => out.push({
      tabela: 'restaurant_sales', id: r.id, quando: r.created_at, origem: ORIGEM.restaurant_sales,
      quem: r.stay_id ? (stayMap[r.stay_id] ?? '—') : (r.guest_name || 'Cliente externo'),
      valor: Number(r.value), method: r.payment_method, bank: r.bank_name,
    }))
    ;(bar ?? []).forEach((b: any) => out.push({
      tabela: 'bar_sales', id: b.id, quando: b.created_at, origem: ORIGEM.bar_sales,
      quem: b.stay_id ? (stayMap[b.stay_id] ?? '—') : (b.guest_name || 'Cliente externo'),
      valor: (b.bar_sale_items ?? []).reduce((s: number, i: any) => s + Number(i.subtotal), 0),
      method: b.payment_method, bank: b.bank_name,
    }))
    out.sort((a, b) => +new Date(b.quando) - +new Date(a.quando))
    setRows(out)
    setLoading(false)
  }, [dias])

  useEffect(() => { load() }, [load])

  function abrir(r: Row) {
    setEditId(r.id); setMethod(r.method); setBank(r.bank || 'BIC'); setMotivo(''); setMsg(null)
  }

  async function guardar(r: Row) {
    if (!motivo.trim()) { setMsg({ ok: false, text: 'Escreva o motivo da correção.' }); return }
    const antes = `${METHODS[r.method] ?? r.method}${r.bank ? ' ' + r.bank : ''}`
    const depois = `${METHODS[method]}${method !== 'numerario' ? ' ' + bank : ''}`
    if (antes === depois) { setMsg({ ok: false, text: 'Não há alteração.' }); return }
    if (!confirm(`Corrigir pagamento de ${kz(r.valor)} (${r.quem})?\n\nDe: ${antes}\nPara: ${depois}`)) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('corrigir_forma_pagamento', {
      p_tabela: r.tabela, p_id: r.id, p_method: method, p_bank: method === 'numerario' ? null : bank, p_motivo: motivo.trim(),
    })
    setSaving(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: `Corrigido: ${antes} → ${depois}. O relatório já reflete a alteração.` })
    setEditId(null)
    load()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Corrigir forma de pagamento</h1>
        <p className="text-sm text-ink-muted">Para quando um pagamento foi registado em numerário em vez de TPA (ou noutro banco), e vice-versa. Fica tudo guardado na auditoria.</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-muted">Mostrar últimos</span>
        {[1, 3, 7, 15].map(d => (
          <button key={d} onClick={() => setDias(d)}
            className={`px-3 py-1.5 rounded-lg font-medium ${dias === d ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink-muted'}`}>
            {d} {d === 1 ? 'dia' : 'dias'}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`card flex items-center gap-2 text-sm ${msg.ok ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.ok && <CheckCircle size={16} />} {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : rows.length === 0 ? (
        <div className="card text-center py-8 text-sm text-ink-muted">Sem pagamentos neste período.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.tabela + r.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{r.quem}</p>
                  <p className="text-xs text-ink-muted">
                    {new Date(r.quando).toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })} · {r.origem}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-ink">{kz(r.valor)}</p>
                  <p className="text-xs text-ink-muted">{METHODS[r.method] ?? r.method}{r.bank ? ` · ${r.bank}` : ''}</p>
                </div>
                <button onClick={() => (editId === r.id ? setEditId(null) : abrir(r))} className="btn-secondary p-2" title="Corrigir">
                  <Pencil size={14} />
                </button>
              </div>
              {editId === r.id && (
                <div className="border-t border-surface-border pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Forma de pagamento</label>
                      <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                        {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {method !== 'numerario' && (
                      <div>
                        <label className="label">Banco</label>
                        <select className="input" value={bank} onChange={e => setBank(e.target.value)}>
                          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label">Motivo da correção</label>
                    <input className="input" placeholder="Ex: registado em numerário por engano, foi TPA BAI" value={motivo} onChange={e => setMotivo(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={saving} onClick={() => guardar(r)} className="btn-primary flex-1">{saving ? 'A guardar...' : 'Guardar correção'}</button>
                    <button onClick={() => setEditId(null)} className="btn-secondary flex-1">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
