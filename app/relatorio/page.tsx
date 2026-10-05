'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, RefreshCw, CheckCircle, Send, Download, ChevronLeft, ChevronRight,
  AlertTriangle, AlertCircle, Copy, Save, Plus, Trash2,
} from 'lucide-react'
import {
  PROPERTY_ID, RelatorioSistema, RelatorioManual, Verificacao, Venda, ConciliacaoQuartos,
  kz, kzCent, dataExtenso, dataCurta, somarDias, ultimaDiariaFechada, rotuloMetodo,
  somaMetodo, juntarItens, vendasPagasPor, textoWhatsApp, lerTextoWhatsApp,
  lerValor, manualVazio, normalizarManual, compararRelatorios, diferenca,
} from '@/lib/relatorio'
import { baixarPdfDiario } from '@/lib/relatorioPdf'

type Aba = 'sistema' | 'manual' | 'comparacao'

// ---------------------------------------------------------------------
// Pequenos componentes
// ---------------------------------------------------------------------
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
        <span className="inline-block w-1 h-4 rounded bg-brand-500" />
        {titulo}
      </h3>
      {children}
    </div>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 border-b border-surface-border text-sm ${forte ? 'font-semibold' : ''}`}>
      <span className={forte ? 'text-ink' : 'text-ink-muted'}>{rotulo}</span>
      <span className="text-right">{valor}</span>
    </div>
  )
}

function NumInput({ value, onChange, placeholder, disabled }: {
  value: number | null; onChange: (v: number | null) => void; placeholder?: string; disabled?: boolean
}) {
  const [txt, setTxt] = useState<string>(value === null || value === undefined ? '' : String(value))
  useEffect(() => {
    if (lerValor(txt) !== (value ?? null)) setTxt(value === null || value === undefined ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      className="input" inputMode="decimal" value={txt} placeholder={placeholder} disabled={disabled}
      onChange={e => { setTxt(e.target.value); onChange(lerValor(e.target.value)) }}
    />
  )
}

function ListaVendas({ titulo, vendas }: { titulo: string; vendas: Venda[] }) {
  if (vendas.length === 0) return null
  const total = vendas.reduce((s, v) => s + Number(v.valor), 0)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm font-semibold">
        <span>{titulo}</span><span>{kz(total)}</span>
      </div>
      {vendas.map((v, i) => (
        <div key={i} className="flex justify-between gap-3 text-xs text-ink-muted pl-3 border-l-2 border-surface-border">
          <span>
            {v.hora.slice(6)} · {v.area === 'bar' ? 'Bar' : 'Restaurante'} ·{' '}
            {v.quarto ? `Quarto ${v.quarto}${v.hospede ? ' (' + v.hospede.trim() + ')' : ''}` : (v.cliente ?? 'Não-hóspede')}
            {' — '}{juntarItens([v]).map(it => `${it.qtd}x ${it.produto}`).join(', ')}
          </span>
          <span className="whitespace-nowrap text-ink">{kz(v.valor)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------
export default function RelatorioPage() {
  const router = useRouter()
  const diariaMaisRecente = useMemo(() => somarDias(ultimaDiariaFechada(), 1), [])
  const [data, setData] = useState<string>(ultimaDiariaFechada())
  const [aba, setAba] = useState<Aba>('sistema')

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [staffId, setStaffId] = useState('')

  const [vivo, setVivo] = useState<RelatorioSistema | null>(null)
  const [verif, setVerif] = useState<Verificacao | null>(null)
  const [quartosLedger, setQuartosLedger] = useState<ConciliacaoQuartos | null>(null)
  const [resumo, setResumo] = useState<any>(null)
  const [manual, setManual] = useState<RelatorioManual>(manualVazio())
  const [textoColado, setTextoColado] = useState('')
  const [manualGuardado, setManualGuardado] = useState(false)
  const [ivaTxt, setIvaTxt] = useState('')

  // Depois de revisto/enviado, mostra-se a cópia congelada (não muda mais)
  const congelado = !!resumo && resumo.status !== 'rascunho' && !!resumo.detalhes?.resumo
  const sistema: RelatorioSistema | null = congelado ? (resumo.detalhes as RelatorioSistema) : vivo
  const ivaGuardado: number | null = resumo?.iva_total !== null && resumo?.iva_total !== undefined ? Number(resumo.iva_total) : null
  const bloqueado = resumo?.status === 'enviado'
  // A conciliação só se mostra se fechar com os totais do relatório apresentado
  const conciliacao: ConciliacaoQuartos | null =
    sistema && quartosLedger &&
    Math.abs(quartosLedger.totais.devido - sistema.resumo.total_do_dia) < 0.5 &&
    Math.abs(quartosLedger.totais.recebido - sistema.totais.total_recebido) < 0.5
      ? quartosLedger : null
  const emCurso = !!sistema && new Date() < new Date(sistema.fim)

  const carregar = useCallback(async (dia: string) => {
    setLoading(true); setErro('')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/auth/login'); return }
    setStaffId(session.user.id)

    const [rel, chk, sum, man, led] = await Promise.all([
      supabase.rpc('get_daily_report', { p_property_id: PROPERTY_ID, p_date: dia }),
      supabase.rpc('get_daily_report_checks', { p_property_id: PROPERTY_ID, p_date: dia }),
      supabase.from('daily_summaries').select('*').eq('property_id', PROPERTY_ID).eq('summary_date', dia).maybeSingle(),
      supabase.from('daily_manual_reports').select('*').eq('property_id', PROPERTY_ID).eq('summary_date', dia).maybeSingle(),
      supabase.rpc('get_daily_report_rooms', { p_property_id: PROPERTY_ID, p_date: dia }),
    ])
    if (rel.error) setErro('Não foi possível calcular o relatório: ' + rel.error.message)
    setVivo((rel.data as RelatorioSistema) ?? null)
    setVerif((chk.data as Verificacao) ?? null)
    setQuartosLedger((led.data as ConciliacaoQuartos) ?? null)
    setResumo(sum.data ?? null)
    setIvaTxt(sum.data?.iva_total !== null && sum.data?.iva_total !== undefined ? String(sum.data.iva_total) : '')
    setManual(normalizarManual(man.data?.dados))
    setTextoColado(man.data?.texto_original ?? '')
    setManualGuardado(!!man.data)
    setLoading(false)
  }, [router])

  useEffect(() => { carregar(data) }, [data, carregar])

  // Garante que existe a linha do resumo (rascunho) para guardar IVA / estado
  async function garantirResumo() {
    const supabase = createClient()
    await supabase.rpc('generate_daily_summary', { p_property_id: PROPERTY_ID, p_date: data })
    const { data: sum } = await supabase.from('daily_summaries').select('*')
      .eq('property_id', PROPERTY_ID).eq('summary_date', data).maybeSingle()
    setResumo(sum)
    return sum
  }

  async function atualizar() {
    setBusy(true)
    await garantirResumo()
    await carregar(data)
    setBusy(false)
  }

  async function guardarIva() {
    if (bloqueado) return
    const valor = lerValor(ivaTxt)
    setBusy(true)
    const supabase = createClient()
    const sum = resumo ?? await garantirResumo()
    if (!sum) { setBusy(false); setErro('Não foi possível criar o resumo desta diária.'); return }
    const { data: novo, error } = await supabase.from('daily_summaries')
      .update({ iva_total: valor, iva_updated_at: new Date().toISOString() })
      .eq('id', sum.id).select().single()
    if (error) setErro('Erro ao guardar o IVA: ' + error.message)
    else setResumo(novo)
    setBusy(false)
  }

  async function marcarRevisto() {
    if (verif && verif.erros > 0) {
      const ok = confirm(`Há ${verif.erros} erro(s) de registo por corrigir.\n\nMarcar como revisto mesmo assim? O relatório fica congelado.`)
      if (!ok) return
    } else if (ivaGuardado === null) {
      const ok = confirm('O IVA ainda não foi preenchido. Marcar como revisto mesmo assim?')
      if (!ok) return
    }
    setBusy(true)
    const supabase = createClient()
    await supabase.rpc('generate_daily_summary', { p_property_id: PROPERTY_ID, p_date: data }) // actualiza a cópia antes de congelar
    const { data: sum } = await supabase.from('daily_summaries').select('id').eq('property_id', PROPERTY_ID).eq('summary_date', data).maybeSingle()
    if (sum) {
      const { error } = await supabase.from('daily_summaries')
        .update({ status: 'revisto', reviewed_by: staffId, reviewed_at: new Date().toISOString() }).eq('id', sum.id)
      if (error) setErro('Erro ao marcar como revisto: ' + error.message)
    }
    await carregar(data)
    setBusy(false)
  }

  async function marcarEnviado() {
    if (!resumo) return
    setBusy(true)
    const supabase = createClient()
    const { data: novo } = await supabase.from('daily_summaries')
      .update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', resumo.id).select().single()
    setResumo(novo)
    setBusy(false)
  }

  async function copiarTexto() {
    if (!sistema) return
    await navigator.clipboard.writeText(textoWhatsApp(sistema, ivaGuardado))
    alert('Relatório copiado! Cola no WhatsApp.')
  }

  async function guardarManual() {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('daily_manual_reports').upsert({
      property_id: PROPERTY_ID, summary_date: data, dados: manual,
      texto_original: textoColado || null, created_by: staffId, updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id,summary_date' })
    if (error) setErro('Erro ao guardar o relatório manual: ' + error.message)
    else setManualGuardado(true)
    setBusy(false)
  }

  function lerColado() {
    if (!textoColado.trim()) return
    setManual(lerTextoWhatsApp(textoColado))
  }

  const set = <K extends keyof RelatorioManual>(k: K, v: RelatorioManual[K]) => setManual(m => ({ ...m, [k]: v }))

  const estadoCor: Record<string, string> = {
    rascunho: 'bg-yellow-100 text-yellow-700', revisto: 'bg-blue-100 text-blue-700', enviado: 'bg-green-100 text-green-700',
  }
  const estado: string = resumo?.status ?? 'rascunho'

  // -------------------------------------------------------------------
  // Cabeçalho comum
  // -------------------------------------------------------------------
  const fimDia = somarDias(data, 1)
  const cabecalho = (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <FileText size={20} className="text-brand-500" /> Relatório Diário
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Diária de {dataCurta(data)} 12h00 → {dataCurta(fimDia)} 11h00
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button className="btn-secondary px-3 py-2" onClick={() => setData(somarDias(data, -1))} aria-label="Diária anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-medium text-ink text-center">
          {dataExtenso(data)}
          <span className={`ml-2 text-xs px-2 py-0.5 rounded font-semibold ${estadoCor[estado] ?? ''}`}>
            {estado.charAt(0).toUpperCase() + estado.slice(1)}
          </span>
        </div>
        <button className="btn-secondary px-3 py-2" disabled={data >= diariaMaisRecente}
          onClick={() => setData(somarDias(data, 1))} aria-label="Diária seguinte">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-surface-muted rounded-lg p-1 text-sm">
        {([['sistema', 'Sistema'], ['manual', 'Manual'], ['comparacao', 'Comparação']] as [Aba, string][]).map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`py-1.5 rounded-md font-medium ${aba === k ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted'}`}>
            {t}
          </button>
        ))}
      </div>

      {emCurso && (
        <div className="card bg-brand-50 border-brand-200 text-sm text-brand-700 flex items-start gap-2">
          <span>ℹ️</span>
          <p className="text-xs">
            <span className="font-semibold">Diária ainda em curso.</span> Os valores são provisórios e mudam até às 11h00 de {dataCurta(fimDia)}.
          </p>
        </div>
      )}
      {congelado && (
        <div className="card text-xs text-ink-muted">
          Relatório {estado}: mostra a cópia guardada no momento da revisão. Já não muda com novos registos.
        </div>
      )}
      {erro && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {cabecalho}
        <p className="text-ink-muted text-sm text-center py-10">A carregar...</p>
      </div>
    )
  }

  // -------------------------------------------------------------------
  // Aba: Sistema
  // -------------------------------------------------------------------
  const abaSistema = !sistema ? (
    <div className="card text-center py-10 text-ink-muted text-sm">Sem dados para esta diária.</div>
  ) : (
    <div className="space-y-4">
      {verif && (verif.erros > 0 || verif.avisos > 0) && (
        <Secao titulo={`Verificação de registos — ${verif.erros} erro(s), ${verif.avisos} aviso(s)`}>
          <div className="space-y-2">
            {verif.itens.map((it, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs rounded p-2 ${it.nivel === 'erro' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-800'}`}>
                {it.nivel === 'erro' ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                <span>{it.mensagem}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}
      {verif && verif.erros === 0 && verif.avisos === 0 && (
        <div className="card text-xs text-green-700 bg-green-50 border-green-300 flex items-center gap-2">
          <CheckCircle size={14} /> Sem erros nem avisos de registo nesta diária.
        </div>
      )}

      <Secao titulo="Receção">
        <div>
          <Linha rotulo="Check-ins" valor={String(sistema.resumo.checkins)} />
          <Linha rotulo="Check-outs" valor={String(sistema.resumo.checkouts)} />
          <Linha rotulo="Quartos ocupados" valor={String(sistema.ocupacao.quartos_ocupados)} />
          <Linha rotulo="Hóspedes" valor={String(sistema.ocupacao.hospedes)} />
        </div>
      </Secao>

      <Secao titulo="Sala de Refeições">
        <div>
          <Linha rotulo="Restaurante — hóspedes" valor={kz(sistema.resumo.restaurante_hospedes)} />
          <Linha rotulo="Restaurante — não-hóspedes" valor={kz(sistema.resumo.restaurante_nao_hospedes)} />
          <Linha rotulo="Bar — hóspedes" valor={kz(sistema.resumo.bar_hospedes)} />
          <Linha rotulo="Bar — não-hóspedes" valor={kz(sistema.resumo.bar_nao_hospedes)} />
        </div>
      </Secao>

      <Secao titulo="Outros">
        <div>
          <Linha rotulo="Pequenos-almoços servidos" valor={String(sistema.resumo.pequenos_almocos_servidos)} />
          <Linha rotulo="Lavandaria" valor={kz(sistema.resumo.lavandaria)} />
          <Linha rotulo="Frigobar" valor={kz(sistema.resumo.frigobar)} />
          <Linha rotulo="Hospedagem" valor={kz(sistema.resumo.hospedagem)} />
          {sistema.resumo.outros_lancamentos > 0 && (
            <Linha rotulo="Outros lançamentos (mini diária, etc.)" valor={kz(sistema.resumo.outros_lancamentos)} />
          )}
        </div>
        <div className="flex justify-between items-center rounded-lg bg-brand-50 px-3 py-3">
          <span className="font-bold">Total do Dia</span>
          <span className="font-bold text-brand-500 text-lg">{kz(sistema.resumo.total_do_dia)}</span>
        </div>
      </Secao>

      <Secao titulo="Ocupação">
        <div>
          {sistema.ocupacao.grupos.map((g, i) => (
            <Linha key={i} rotulo={`${g.grupo} — ${g.quartos} ${g.quartos === 1 ? 'quarto' : 'quartos'}, ${g.hospedes} ${g.hospedes === 1 ? 'hóspede' : 'hóspedes'}`} valor={kz(g.valor_diaria)} />
          ))}
        </div>
        <div className="text-xs text-ink-muted grid grid-cols-2 gap-x-4 gap-y-1">
          {sistema.ocupacao.quartos.map(q => (
            <div key={q.quarto} className="flex justify-between">
              <span>Q{q.quarto} · {(q.hospede ?? '').trim()}{q.empresa ? ` (${q.empresa})` : ''}</span>
              <span>{q.ocupacao === 'duplo' ? '2p' : '1p'}</span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Recebimentos">
        <div>
          {Array.from(new Set(sistema.totais.por_metodo_banco.filter(x => x.metodo === 'tpa').map(x => (x.banco ?? 'SEM BANCO').toUpperCase()))).map(b => (
            <div key={b}>
              <Linha rotulo={`Quartos — TPA ${b}`} valor={kz(somaMetodo(sistema.pagamentos_estadias_por_metodo, 'tpa', b))} />
              <Linha rotulo={`Sala de refeições — TPA ${b}`} valor={kz(somaMetodo(sistema.vendas_pagas_por_metodo, 'tpa', b))} />
              <Linha forte rotulo={`Total TPA ${b}`} valor={kz(somaMetodo(sistema.totais.por_metodo_banco, 'tpa', b))} />
            </div>
          ))}
          <Linha forte rotulo="Total em banco" valor={kz(sistema.totais.total_banco)} />
          <Linha rotulo="Numerário — quartos" valor={kz(somaMetodo(sistema.pagamentos_estadias_por_metodo, 'numerario'))} />
          <Linha rotulo="Numerário — vendas" valor={kz(somaMetodo(sistema.vendas_pagas_por_metodo, 'numerario'))} />
          <Linha forte rotulo="Total em numerário" valor={kz(sistema.totais.total_numerario)} />
          <Linha forte rotulo="Transferências bancárias" valor={kz(sistema.totais.total_transferencia)} />
          <Linha forte rotulo="Total recebido" valor={kz(sistema.totais.total_recebido)} />
        </div>
      </Secao>

      {sistema.pagamentos_estadias.length > 0 && (
        <Secao titulo="Pagamentos de quartos">
          <div className="space-y-1">
            {sistema.pagamentos_estadias.map((p, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs">
                <span className="text-ink-muted">{p.hora} · Quarto {p.quarto ?? '?'}{p.hospede ? ` · ${p.hospede.trim()}` : ''} · {rotuloMetodo(p.metodo, p.banco)}</span>
                <span className="whitespace-nowrap">{kz(p.valor)}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {conciliacao && (
        <Secao titulo="Conciliação: Total do Dia vs Total recebido">
          <div>
            <Linha rotulo="Total do Dia (o que foi faturado)" valor={kz(sistema.resumo.total_do_dia)} />
            <Linha rotulo="− Crédito de empresas (a faturar)" valor={kz(conciliacao.totais.credito)} />
            <Linha rotulo="− Total recebido" valor={kz(sistema.totais.total_recebido)} />
            <Linha forte rotulo="= Saldo dos quartos (soma da tabela abaixo)" valor={kz(conciliacao.totais.saldo)} />
          </div>
          <p className="text-xs text-ink-muted">
            Saldo positivo: o quarto deve (consumo por pagar) ou pagou a sua diária noutro dia.
            Saldo negativo: o quarto pagou adiantado ou pagou dívidas de outros dias.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted border-b border-surface-border">
                  <th className="py-1 pr-2">Q.</th><th className="pr-2">Hóspede</th>
                  <th className="pr-2 text-right">Devido</th><th className="pr-2 text-right">Crédito</th>
                  <th className="pr-2 text-right">Recebido</th><th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {conciliacao.quartos.map(q => (
                  <tr key={q.quarto} className="border-b border-surface-border">
                    <td className="py-1 pr-2">{q.quarto}</td>
                    <td className="pr-2">{(q.hospede ?? '').trim()}{q.empresa ? ` (${q.empresa})` : ''}</td>
                    <td className="pr-2 text-right whitespace-nowrap">{kz(q.devido)}</td>
                    <td className="pr-2 text-right whitespace-nowrap">{q.credito ? kz(q.credito) : '—'}</td>
                    <td className="pr-2 text-right whitespace-nowrap">{kz(q.recebido)}</td>
                    <td className="text-right whitespace-nowrap font-medium">{q.saldo === 0 ? '—' : kz(q.saldo)}</td>
                  </tr>
                ))}
                {(conciliacao.sem_quarto.devido > 0 || conciliacao.sem_quarto.recebido > 0) && (
                  <tr className="border-b border-surface-border">
                    <td className="py-1 pr-2">—</td><td className="pr-2">Clientes não hóspedes</td>
                    <td className="pr-2 text-right whitespace-nowrap">{kz(conciliacao.sem_quarto.devido)}</td>
                    <td className="pr-2 text-right">—</td>
                    <td className="pr-2 text-right whitespace-nowrap">{kz(conciliacao.sem_quarto.recebido)}</td>
                    <td className="text-right whitespace-nowrap">{conciliacao.sem_quarto.saldo === 0 ? '—' : kz(conciliacao.sem_quarto.saldo)}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="py-1 pr-2" colSpan={2}>Total</td>
                  <td className="pr-2 text-right whitespace-nowrap">{kz(conciliacao.totais.devido)}</td>
                  <td className="pr-2 text-right whitespace-nowrap">{kz(conciliacao.totais.credito)}</td>
                  <td className="pr-2 text-right whitespace-nowrap">{kz(conciliacao.totais.recebido)}</td>
                  <td className="text-right whitespace-nowrap">{kz(conciliacao.totais.saldo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {sistema.vendas.length > 0 && (
        <Secao titulo="Vendas da sala de refeições (detalhe)">
          <div className="space-y-4">
            {Array.from(new Set(sistema.vendas.filter(v => v.situacao === 'pago' && v.metodo === 'tpa').map(v => (v.banco ?? 'SEM BANCO').toUpperCase()))).map(b => (
              <ListaVendas key={b} titulo={`TPA ${b}`} vendas={vendasPagasPor(sistema, 'tpa', b)} />
            ))}
            <ListaVendas titulo="Numerário" vendas={vendasPagasPor(sistema, 'numerario')} />
            <ListaVendas titulo="Crédito de empresa" vendas={sistema.vendas.filter(v => v.situacao === 'credito_empresa')} />
            <ListaVendas titulo="Conta do hóspede — a pagar no check-out" vendas={sistema.vendas.filter(v => v.situacao === 'conta_hospede')} />
            <ListaVendas titulo="Conta do hóspede — paga no check-out" vendas={sistema.vendas.filter(v => v.situacao === 'conta_hospede_paga_no_checkout')} />
            <ListaVendas titulo="Sem pagamento registado" vendas={sistema.vendas.filter(v => v.situacao === 'sem_pagamento')} />
          </div>
        </Secao>
      )}

      {sistema.totais.credito_empresas.length > 0 && (
        <Secao titulo="Hóspedes e vendas a crédito">
          <div>
            {sistema.totais.credito_empresas.map((c, i) => (
              <div key={i}>
                <Linha rotulo={`${c.empresa} — hospedagem`} valor={kz(c.hospedagem)} />
                <Linha rotulo={`${c.empresa} — consumos`} valor={kz(c.consumos)} />
                <Linha forte rotulo={`${c.empresa} — total`} valor={kz(c.total)} />
              </div>
            ))}
          </div>
        </Secao>
      )}

      {(sistema.lavandaria.length + sistema.frigobar.length + sistema.outros_lancamentos.length) > 0 && (
        <Secao titulo="Lavandaria, frigobar e outros lançamentos">
          <div className="space-y-1 text-xs">
            {sistema.lavandaria.map((l, i) => (
              <div key={'l' + i} className="flex justify-between gap-3"><span className="text-ink-muted">Lavandaria{l.descricao ? ' — ' + l.descricao.trim() : ''}{l.empresa ? ` (${l.empresa})` : ''}</span><span>{kz(l.valor)}</span></div>
            ))}
            {sistema.frigobar.map((f, i) => (
              <div key={'f' + i} className="flex justify-between gap-3"><span className="text-ink-muted">Frigobar — {f.qtd}x {f.produto}{f.empresa ? ` (${f.empresa})` : ''}</span><span>{kz(f.valor)}</span></div>
            ))}
            {sistema.outros_lancamentos.map((o, i) => (
              <div key={'o' + i} className="flex justify-between gap-3">
                <span className="text-ink-muted">Quarto {o.quarto ?? '?'} — {o.descricao?.trim() || o.tipo}{o.pago ? ` · pago ${rotuloMetodo(o.metodo ?? '', o.banco)}` : ' · por pagar'}</span>
                <span>{kz(o.valor)}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="IVA (faturas VD, pago em numerário ou cartão)">
        <div className="flex gap-2">
          <NumInput value={lerValor(ivaTxt)} onChange={v => setIvaTxt(v === null ? '' : String(v))} placeholder="Ex.: 53743.05" disabled={bloqueado} />
          <button className="btn-secondary px-3 flex items-center gap-1 text-sm" onClick={guardarIva} disabled={bloqueado || busy}>
            <Save size={14} /> Guardar
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          {ivaGuardado !== null ? `Guardado: ${kzCent(ivaGuardado)}.` : 'Ainda não preenchido.'}{' '}
          Pode ser corrigido até a diária ser marcada como enviada.
        </p>
      </Secao>

      <div className="space-y-2">
        <button onClick={atualizar} disabled={busy || congelado}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Actualizar dados
        </button>
        <button onClick={() => baixarPdfDiario(sistema, ivaGuardado, conciliacao)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
          <Download size={14} /> Baixar PDF
        </button>
        <button onClick={copiarTexto} className="btn-primary w-full flex items-center justify-center gap-2">
          <Copy size={14} /> Copiar relatório para WhatsApp
        </button>
        {estado === 'rascunho' && (
          <button onClick={marcarRevisto} disabled={busy || emCurso}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm border-blue-300 text-blue-600 hover:bg-blue-50">
            <CheckCircle size={14} /> {emCurso ? 'Só depois do fecho da diária (11h00)' : 'Marcar como revisto'}
          </button>
        )}
        {estado === 'revisto' && (
          <button onClick={marcarEnviado} disabled={busy}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm text-green-600 border-green-300 hover:bg-green-50">
            <Send size={14} /> Confirmar envio ao patrão
          </button>
        )}
        {estado === 'enviado' && (
          <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700 text-sm">
            <CheckCircle size={16} /> Relatório enviado ao patrão.
          </div>
        )}
      </div>
    </div>
  )

  // -------------------------------------------------------------------
  // Aba: Manual (o relatório que a equipa envia por WhatsApp)
  // -------------------------------------------------------------------
  const abaManual = (
    <div className="space-y-4">
      <Secao titulo="Colar o relatório do WhatsApp">
        <textarea className="input min-h-[140px] font-mono text-xs" value={textoColado}
          onChange={e => setTextoColado(e.target.value)}
          placeholder={'Cola aqui o texto enviado no WhatsApp...\nQuartos ocupados:13\nNúmero Hóspedes:18\n...'} />
        <button className="btn-secondary w-full text-sm" onClick={lerColado} disabled={!textoColado.trim()}>
          Ler texto e preencher os campos
        </button>
        <p className="text-xs text-ink-muted">Confirma os campos abaixo antes de guardar. Podes também escrevê-los à mão.</p>
      </Secao>

      <Secao titulo="Ocupação">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Quartos ocupados</label><NumInput value={manual.quartos_ocupados} onChange={v => set('quartos_ocupados', v)} /></div>
          <div><label className="label">Hóspedes</label><NumInput value={manual.hospedes} onChange={v => set('hospedes', v)} /></div>
          <div><label className="label">Individuais</label><NumInput value={manual.individuais} onChange={v => set('individuais', v)} /></div>
          <div><label className="label">Casais</label><NumInput value={manual.casais} onChange={v => set('casais', v)} /></div>
        </div>
        <div className="space-y-2">
          <label className="label">Empresas (quartos)</label>
          {manual.empresas.map((e, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" value={e.nome} placeholder="Nome da empresa"
                onChange={ev => set('empresas', manual.empresas.map((x, j) => j === i ? { ...x, nome: ev.target.value } : x))} />
              <div className="w-24">
                <NumInput value={e.quartos} onChange={v => set('empresas', manual.empresas.map((x, j) => j === i ? { ...x, quartos: v ?? 0 } : x))} />
              </div>
              <button className="btn-secondary px-2" onClick={() => set('empresas', manual.empresas.filter((_, j) => j !== i))} aria-label="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => set('empresas', [...manual.empresas, { nome: '', quartos: 1 }])}>
            <Plus size={12} /> Adicionar empresa
          </button>
        </div>
      </Secao>

      <Secao titulo="Pagamentos dos quartos">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">TPA BIC</label><NumInput value={manual.quartos_tpa_bic} onChange={v => set('quartos_tpa_bic', v)} /></div>
          <div><label className="label">TPA BAI</label><NumInput value={manual.quartos_tpa_bai} onChange={v => set('quartos_tpa_bai', v)} /></div>
        </div>
      </Secao>

      {([
        ['vendas_tpa_bic', 'Vendas da sala de refeições — TPA BIC'],
        ['vendas_tpa_bai', 'Vendas da sala de refeições — TPA BAI'],
        ['numerario', 'Vendas em numerário'],
      ] as ['vendas_tpa_bic' | 'vendas_tpa_bai' | 'numerario', string][]).map(([chave, titulo]) => (
        <Secao key={chave} titulo={titulo}>
          <div><label className="label">Valor</label>
            <NumInput value={manual[chave].valor} onChange={v => set(chave, { ...manual[chave], valor: v })} />
          </div>
          <div><label className="label">Itens (um por linha)</label>
            <textarea className="input min-h-[90px] text-xs" value={manual[chave].itens}
              onChange={e => set(chave, { ...manual[chave], itens: e.target.value })} />
          </div>
        </Secao>
      ))}

      <Secao titulo="Outros">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Transferências</label><NumInput value={manual.transferencias} onChange={v => set('transferencias', v)} /></div>
          <div><label className="label">IVA</label><NumInput value={manual.iva} onChange={v => set('iva', v)} /></div>
        </div>
      </Secao>

      <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={guardarManual} disabled={busy}>
        <Save size={14} /> {manualGuardado ? 'Actualizar relatório manual' : 'Guardar relatório manual'}
      </button>
    </div>
  )

  // -------------------------------------------------------------------
  // Aba: Comparação
  // -------------------------------------------------------------------
  const linhasComp = sistema ? compararRelatorios(sistema, manual, ivaGuardado) : []
  const fmt = (v: number | null, moeda: boolean) => v === null ? '—' : (moeda ? kz(v) : String(v))

  const itensSistema = (banco: string | null, metodo: string) =>
    sistema ? juntarItens(vendasPagasPor(sistema, metodo, banco ?? undefined)).map(i => `${i.qtd} ${i.produto}`).join('\n') : ''

  const abaComparacao = !sistema ? null : (
    <div className="space-y-4">
      {!manualGuardado && (
        <div className="card text-xs text-ink-muted">
          O relatório manual desta diária ainda não foi guardado. Preenche-o no separador "Manual" para ver as diferenças.
        </div>
      )}
      <Secao titulo="Manual vs Sistema">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-muted border-b border-surface-border">
                <th className="py-2 pr-2 font-semibold">Item</th>
                <th className="py-2 px-2 font-semibold text-right">Manual</th>
                <th className="py-2 px-2 font-semibold text-right">Sistema</th>
                <th className="py-2 pl-2 font-semibold text-right">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhasComp.map((l, i) => {
                const d = diferenca(l)
                const cor = d === null ? 'text-ink-muted' : d === 0 ? 'text-green-600' : 'text-red-600 font-semibold'
                return (
                  <tr key={i} className="border-b border-surface-border align-top">
                    <td className="py-2 pr-2">{l.rotulo}{l.nota && <div className="text-[10px] text-ink-muted">{l.nota}</div>}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">{fmt(l.manual, l.moeda)}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">{fmt(l.sistema, l.moeda)}</td>
                    <td className={`py-2 pl-2 text-right whitespace-nowrap ${cor}`}>
                      {d === null ? '—' : d === 0 ? 'Certo' : (d > 0 ? '+' : '') + fmt(d, l.moeda)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">Diferença = Sistema − Manual. Os valores a vermelho são os que convém conferir com os talões do TPA e a caixa.</p>
      </Secao>

      {([
        ['TPA BIC', manual.vendas_tpa_bic.itens, itensSistema('BIC', 'tpa')],
        ['TPA BAI', manual.vendas_tpa_bai.itens, itensSistema('BAI', 'tpa')],
        ['Numerário', manual.numerario.itens, itensSistema(null, 'numerario')],
      ] as [string, string, string][]).map(([titulo, m, s]) => (
        <Secao key={titulo} titulo={`Itens vendidos — ${titulo}`}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><div className="label">Manual</div><pre className="whitespace-pre-wrap bg-surface-muted rounded p-2 min-h-[48px]">{m || '—'}</pre></div>
            <div><div className="label">Sistema</div><pre className="whitespace-pre-wrap bg-surface-muted rounded p-2 min-h-[48px]">{s || '—'}</pre></div>
          </div>
        </Secao>
      ))}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {cabecalho}
      {aba === 'sistema' && abaSistema}
      {aba === 'manual' && abaManual}
      {aba === 'comparacao' && abaComparacao}
    </div>
  )
}
