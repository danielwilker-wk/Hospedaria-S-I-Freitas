'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trophy, Users, TrendingUp, ChevronDown, ChevronUp, Building2, Printer } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const fmt = (n: number) => Math.round(n).toLocaleString('pt-AO')

const TIPO_LABEL: Record<string, string> = {
  sozinho: 'Sozinho',
  dupla: 'Dupla',
  trio: 'Trio',
}

const CLIENTE_LABEL: Record<string, string> = {
  hospede: 'Hóspede',
  nao_hospede: 'Não hóspede',
  empresa: 'Empresa',
}

const fmtData = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function BonusPage() {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }

      const [y, m] = selectedMonth.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const startDate = `${selectedMonth}-01`
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`

      // A vista bonus_shares tem uma linha por venda e por pessoa (já com a parte de cada um).
      // Vai buscar em blocos de 1000 porque o Supabase limita cada pedido.
      const all: any[] = []
      const size = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('bonus_shares')
          .select('*')
          .gte('record_date', startDate)
          .lte('record_date', endDate)
          .order('record_date')
          .order('origem')
          .order('sale_id')
          .order('person_key')
          .range(from, from + size - 1)
        if (error || !data) break
        all.push(...data)
        if (data.length < size) break
        from += size
      }

      setRows(all)
      setLoading(false)
    }
    load()
  }, [router, selectedMonth])

  const { people, totals } = useMemo(() => {
    const map: Record<string, any> = {}
    const saleNames: Record<string, string[]> = {}
    const saleSeen: Record<string, { valor: number; credito: boolean }> = {}

    for (const r of rows) {
      const saleKey = `${r.origem}-${r.sale_id}`
      ;(saleNames[saleKey] ??= []).push(r.pessoa)
      saleSeen[saleKey] = { valor: Number(r.valor), credito: !!r.is_credito }

      const p = (map[r.person_key] ??= {
        key: r.person_key,
        nome: r.pessoa,
        sozinho: 0,
        equipa: 0,
        bar: 0,
        rest: 0,
        conta: 0,
        credito: 0,
        creditoPorEmpresa: {} as Record<string, number>,
        vendas: new Set<string>(),
        linhas: [] as any[],
      })

      const parte = Number(r.parte)
      const parteBonus = Number(r.parte_bonus)
      p.vendas.add(saleKey)
      p.linhas.push(r)

      if (r.is_credito) {
        p.credito += parte
        const emp = r.empresa ?? 'Empresa não indicada'
        p.creditoPorEmpresa[emp] = (p.creditoPorEmpresa[emp] ?? 0) + parte
      } else {
        p.conta += parteBonus
        if (r.tipo === 'sozinho') p.sozinho += parteBonus
        else p.equipa += parteBonus
        if (r.origem === 'bar') p.bar += parteBonus
        else p.rest += parteBonus
      }
    }

    const list = Object.values(map)
      .map((p: any) => ({
        ...p,
        nVendas: p.vendas.size,
        linhas: [...p.linhas].sort((a: any, b: any) =>
          a.record_date === b.record_date
            ? String(a.origem).localeCompare(String(b.origem))
            : String(a.record_date).localeCompare(String(b.record_date))
        ),
      }))
      .sort((a: any, b: any) => b.conta - a.conta)

    const sales = Object.values(saleSeen)
    const totalMes = sales.reduce((s, v) => s + v.valor, 0)
    const totalCredito = sales.filter(v => v.credito).reduce((s, v) => s + v.valor, 0)

    return {
      people: list,
      totals: {
        mes: totalMes,
        credito: totalCredito,
        conta: totalMes - totalCredito,
        vendas: sales.length,
        pessoas: list.length,
        saleNames,
      },
    }
  }, [rows])

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Trophy size={20} className="text-brand-500"/> Desempenho & Bónus
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Vendas por funcionário da sala de refeições. Nas vendas em dupla ou trio, o valor divide-se em partes iguais.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button className="input w-auto flex items-center gap-1.5 cursor-pointer" onClick={() => window.print()}>
            <Printer size={14}/> Imprimir
          </button>
          <input
            type="month"
            className="input w-40"
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setOpenKey(null) }}
          />
        </div>
      </div>

      {/* Total geral do mês */}
      <div className="card bg-brand-500 text-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp size={24}/>
            <div>
              <p className="text-sm opacity-80">Total de vendas no mês</p>
              <p className="text-2xl font-bold">{fmt(totals.mes)} Kz</p>
            </div>
          </div>
          <div className="text-right opacity-80 text-sm">
            <p>{totals.vendas} vendas</p>
            <p>{totals.pessoas} funcionários</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/15 rounded-lg p-2.5">
            <p className="text-xs opacity-80">Conta para bónus</p>
            <p className="font-semibold">{fmt(totals.conta)} Kz</p>
          </div>
          <div className="bg-white/15 rounded-lg p-2.5">
            <p className="text-xs opacity-80">Crédito empresa (não conta)</p>
            <p className="font-semibold">{fmt(totals.credito)} Kz</p>
          </div>
        </div>
      </div>

      {/* Ranking por pessoa */}
      <div className="space-y-3">
        {people.map((p: any, i: number) => {
          const aberto = openKey === p.key
          const empresas = Object.entries(p.creditoPorEmpresa) as [string, number][]

          return (
            <div key={p.key} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                    ${i === 0 ? 'bg-yellow-100 text-yellow-700' :
                      i === 1 ? 'bg-gray-100 text-gray-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-surface-muted text-ink-muted'}`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{p.nome}</p>
                    <p className="text-xs text-ink-muted">{p.nVendas} vendas no total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-500 text-lg">{fmt(p.conta)} Kz</p>
                  <p className="text-xs text-ink-muted">
                    conta para bónus · {totals.conta > 0 ? Math.round((p.conta / totals.conta) * 100) : 0}% do total
                  </p>
                </div>
              </div>

              {/* Barra de progresso */}
              <div className="w-full bg-surface-muted rounded-full h-1.5">
                <div
                  className="bg-brand-500 h-1.5 rounded-full transition-all"
                  style={{ width: totals.conta > 0 ? `${(p.conta / totals.conta) * 100}%` : '0%' }}
                />
              </div>

              {/* Sozinho vs em equipa */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-surface-muted rounded-lg p-2.5">
                  <p className="text-xs text-ink-muted">Vendas sozinho</p>
                  <p className="font-semibold">{fmt(p.sozinho)} Kz</p>
                </div>
                <div className="bg-surface-muted rounded-lg p-2.5">
                  <p className="text-xs text-ink-muted">Vendas em dupla ou trio (a sua parte)</p>
                  <p className="font-semibold">{fmt(p.equipa)} Kz</p>
                </div>
              </div>

              {/* Bar vs restaurante */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-surface-muted rounded-lg p-2.5">
                  <p className="text-xs text-ink-muted">Bar</p>
                  <p className="font-semibold">{fmt(p.bar)} Kz</p>
                </div>
                <div className="bg-surface-muted rounded-lg p-2.5">
                  <p className="text-xs text-ink-muted">Restaurante</p>
                  <p className="font-semibold">{fmt(p.rest)} Kz</p>
                </div>
              </div>

              {/* Crédito empresa — não conta para bónus */}
              {p.credito > 0 && (
                <div className="border border-dashed border-gray-300 rounded-lg p-2.5 text-sm">
                  <p className="text-xs text-ink-muted flex items-center gap-1.5">
                    <Building2 size={12}/> Vendas a crédito em nome de empresa (não contam para bónus)
                  </p>
                  <p className="font-semibold text-ink-muted">{fmt(p.credito)} Kz</p>
                  <ul className="mt-1 text-xs text-ink-muted space-y-0.5">
                    {empresas.map(([emp, v]) => (
                      <li key={emp}>{emp}: {fmt(v)} Kz</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                className="text-xs text-brand-500 flex items-center gap-1 print:hidden"
                onClick={() => setOpenKey(aberto ? null : p.key)}
              >
                {aberto ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                {aberto ? 'Esconder folha de cálculo' : 'Ver folha de cálculo'}
              </button>

              {/* Folha de cálculo da pessoa */}
              {aberto && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-ink-muted border-b">
                        <th className="py-1.5 pr-2 font-medium">Data</th>
                        <th className="py-1.5 pr-2 font-medium">Origem</th>
                        <th className="py-1.5 pr-2 font-medium">Tipo</th>
                        <th className="py-1.5 pr-2 font-medium">Com quem</th>
                        <th className="py-1.5 pr-2 font-medium">Cliente</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Valor da venda</th>
                        <th className="py-1.5 font-medium text-right">A sua parte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.linhas.map((r: any) => {
                        const saleKey = `${r.origem}-${r.sale_id}`
                        const colegas = (totals.saleNames[saleKey] ?? []).filter((n: string) => n !== r.pessoa)
                        const credito = !!r.is_credito
                        return (
                          <tr key={`${saleKey}-${r.person_key}`} className={`border-b last:border-0 ${credito ? 'text-ink-muted bg-surface-muted/50' : ''}`}>
                            <td className="py-1.5 pr-2 whitespace-nowrap">{fmtData(r.record_date)}</td>
                            <td className="py-1.5 pr-2">{r.origem === 'bar' ? 'Bar' : 'Restaurante'}</td>
                            <td className="py-1.5 pr-2">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                            <td className="py-1.5 pr-2">{colegas.length ? colegas.join(', ') : '—'}</td>
                            <td className="py-1.5 pr-2">
                              {credito
                                ? <span>Crédito: {r.empresa ?? 'empresa'}</span>
                                : <span>{CLIENTE_LABEL[r.guest_type] ?? r.guest_type}{r.guest_name ? ` — ${r.guest_name}` : ''}</span>}
                            </td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(Number(r.valor))}</td>
                            <td className="py-1.5 text-right whitespace-nowrap font-medium">
                              {fmt(Number(r.parte))}{credito ? ' (não conta)' : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={6} className="pt-2 text-right text-ink-muted">Vendas sozinho</td>
                        <td className="pt-2 text-right font-medium">{fmt(p.sozinho)}</td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="text-right text-ink-muted">Vendas em dupla ou trio (a sua parte)</td>
                        <td className="text-right font-medium">{fmt(p.equipa)}</td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="pt-1 text-right font-semibold text-ink">Total que conta para bónus</td>
                        <td className="pt-1 text-right font-bold text-brand-500">{fmt(p.conta)} Kz</td>
                      </tr>
                      {p.credito > 0 && (
                        <tr>
                          <td colSpan={6} className="text-right text-ink-muted">Crédito empresa (não conta)</td>
                          <td className="text-right text-ink-muted">{fmt(p.credito)} Kz</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {people.length === 0 && (
          <div className="card text-center py-12 text-ink-muted">
            <Users size={32} className="mx-auto mb-2 opacity-30"/>
            <p>Sem vendas registadas neste mês.</p>
          </div>
        )}
      </div>
    </div>
  )
}
