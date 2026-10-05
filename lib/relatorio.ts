// =====================================================================
// Relatório diário — tipos e lógica partilhada
// Os dados do "relatório do sistema" vêm da função get_daily_report
// (Supabase). O "relatório manual" é o que a equipa envia por WhatsApp.
// =====================================================================

export const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------
// Tipos — relatório do sistema
// ---------------------------------------------------------------------
export interface MetodoBanco {
  metodo: string          // 'tpa' | 'numerario' | 'transferencia'
  banco: string | null    // BIC, BAI... (só para TPA)
  valor: number
}

export interface ItemVenda {
  qtd: number
  produto: string
  valor: number
}

export interface Venda {
  area: 'restaurante' | 'bar'
  hora: string
  situacao: 'pago' | 'credito_empresa' | 'conta_hospede' | 'conta_hospede_paga_no_checkout' | 'sem_pagamento'
  metodo: string | null
  banco: string | null
  valor: number
  tipo_cliente: string | null
  cliente: string | null
  hospede: string | null
  quarto: string | null
  empresa: string | null
  itens: ItemVenda[]
}

export interface PagamentoEstadia {
  quarto: string | null
  hospede: string | null
  metodo: string
  banco: string | null
  valor: number
  hora: string
}

export interface GrupoOcupacao {
  grupo: string
  empresa: boolean
  quartos: number
  hospedes: number
  valor_diaria: number
}

export interface QuartoOcupado {
  quarto: string
  hospede: string | null
  ocupacao: string
  empresa: string | null
  valor_diaria: number
  checkin_na_diaria: boolean
  checkout_na_diaria: boolean
}

export interface CreditoEmpresa {
  empresa: string
  hospedagem: number
  consumos: number
  total: number
}

export interface RelatorioSistema {
  data: string
  inicio: string
  fim: string
  resumo: {
    checkins: number
    checkouts: number
    restaurante_hospedes: number
    restaurante_nao_hospedes: number
    bar_hospedes: number
    bar_nao_hospedes: number
    pequenos_almocos_servidos: number
    pequenos_almocos_registados: number
    lavandaria: number
    frigobar: number
    outros_lancamentos: number
    hospedagem: number
    total_do_dia: number
  }
  ocupacao: {
    quartos_ocupados: number
    hospedes: number
    checkins: number
    checkouts: number
    grupos: GrupoOcupacao[]
    quartos: QuartoOcupado[]
  }
  pagamentos_estadias: PagamentoEstadia[]
  pagamentos_estadias_por_metodo: MetodoBanco[]
  vendas: Venda[]
  vendas_pagas_por_metodo: MetodoBanco[]
  lavandaria: { descricao: string | null; valor: number; empresa: string | null }[]
  frigobar: { produto: string | null; qtd: number; valor: number; empresa: string | null }[]
  outros_lancamentos: {
    quarto: string | null; tipo: string | null; descricao: string | null; valor: number
    pago: boolean | null; metodo: string | null; banco: string | null
  }[]
  totais: {
    por_metodo_banco: MetodoBanco[]
    total_banco: number
    total_numerario: number
    total_transferencia: number
    total_recebido: number
    credito_empresas: CreditoEmpresa[]
    contas_hospedes_por_pagar: number
    contas_hospedes_pagas_no_checkout: number
    sem_pagamento: number
  }
  iva_total: number | null
}

export interface LinhaQuarto {
  quarto: string
  hospede: string | null
  empresa: string | null
  diaria: number
  consumos: number
  lavandaria: number
  frigobar: number
  outros: number
  devido: number
  credito: number
  recebido_quarto: number
  recebido_vendas: number
  recebido: number
  saldo: number
}

// Conciliação por quarto: o que cada quarto deve na diária vs o que pagou nela.
export interface ConciliacaoQuartos {
  quartos: LinhaQuarto[]
  sem_quarto: { devido: number; credito: number; recebido: number; saldo: number }
  totais: { devido: number; credito: number; recebido: number; saldo: number }
  verificacao: { diferenca_faturado: number; diferenca_recebido: number }
}

export interface VerificacaoItem {
  nivel: 'erro' | 'aviso'
  codigo: string
  mensagem: string
  hora: string
}

export interface Verificacao {
  data: string
  erros: number
  avisos: number
  itens: VerificacaoItem[]
}

// ---------------------------------------------------------------------
// Tipos — relatório manual (o que a equipa envia por WhatsApp)
// ---------------------------------------------------------------------
export interface BlocoVendas {
  valor: number | null
  itens: string
}

export interface RelatorioManual {
  quartos_ocupados: number | null
  hospedes: number | null
  individuais: number | null
  casais: number | null
  empresas: { nome: string; quartos: number }[]
  quartos_tpa_bic: number | null
  quartos_tpa_bai: number | null
  vendas_tpa_bic: BlocoVendas
  vendas_tpa_bai: BlocoVendas
  numerario: BlocoVendas
  transferencias: number | null
  iva: number | null
}

export function manualVazio(): RelatorioManual {
  return {
    quartos_ocupados: null,
    hospedes: null,
    individuais: null,
    casais: null,
    empresas: [],
    quartos_tpa_bic: null,
    quartos_tpa_bai: null,
    vendas_tpa_bic: { valor: null, itens: '' },
    vendas_tpa_bai: { valor: null, itens: '' },
    numerario: { valor: null, itens: '' },
    transferencias: null,
    iva: null,
  }
}

// Junta o que veio da base de dados com os valores por defeito (campos novos)
export function normalizarManual(dados: any): RelatorioManual {
  const base = manualVazio()
  if (!dados || typeof dados !== 'object') return base
  return {
    ...base,
    ...dados,
    empresas: Array.isArray(dados.empresas) ? dados.empresas : [],
    vendas_tpa_bic: { ...base.vendas_tpa_bic, ...(dados.vendas_tpa_bic ?? {}) },
    vendas_tpa_bai: { ...base.vendas_tpa_bai, ...(dados.vendas_tpa_bai ?? {}) },
    numerario: { ...base.numerario, ...(dados.numerario ?? {}) },
  }
}

// ---------------------------------------------------------------------
// Formatação e números
// ---------------------------------------------------------------------
export const kz = (n: number | null | undefined): string =>
  `${Math.round(Number(n ?? 0)).toLocaleString('pt-AO')} Kz`

// Com cêntimos (usado no IVA, que não é um número redondo)
export const kzCent = (n: number | null | undefined): string =>
  `${Number(n ?? 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`

// Estilo usado nas mensagens de WhatsApp da equipa: 340.000.00
export function kzWhatsApp(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  const inteiro = Math.floor(Math.abs(v))
  const cent = Math.round((Math.abs(v) - inteiro) * 100)
  const milhares = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${v < 0 ? '-' : ''}${milhares}.${String(cent).padStart(2, '0')}`
}

// Lê números escritos à mão: "340.000.00", "53.743.05", "6.000", "1500", "12 000"
export function lerValor(bruto: string | number | null | undefined): number | null {
  if (bruto === null || bruto === undefined) return null
  if (typeof bruto === 'number') return isNaN(bruto) ? null : bruto
  const s = bruto.trim().replace(/\s/g, '').replace(/kz/i, '')
  if (!s) return null
  // 1.234.567.89  -> milhares com ponto e decimais com ponto
  if (/^\d{1,3}(\.\d{3})*\.\d{2}$/.test(s)) {
    const i = s.lastIndexOf('.')
    return Number(s.slice(0, i).replace(/\./g, '') + '.' + s.slice(i + 1))
  }
  // 1.234.567 -> só milhares
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''))
  // 1.234.567,89
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  const n = Number(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

export function rotuloMetodo(metodo: string, banco?: string | null): string {
  if (metodo === 'tpa') return banco ? `TPA ${banco}` : 'TPA'
  if (metodo === 'numerario') return 'Numerário'
  if (metodo === 'transferencia') return 'Transferência'
  return metodo
}

export function somaMetodo(lista: MetodoBanco[], metodo: string, banco?: string): number {
  return lista
    .filter(l => l.metodo === metodo && (banco === undefined || (l.banco ?? '').toUpperCase() === banco))
    .reduce((s, l) => s + Number(l.valor), 0)
}

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------
// Devolve a data (AAAA-MM-DD, hora de Angola) da última diária JÁ FECHADA.
// A diária de dia D vai das 12h00 de D até às 11h00 de D+1.
export function ultimaDiariaFechada(): string {
  const angola = new Date(Date.now() + 60 * 60 * 1000)           // UTC+1
  const dia = new Date(Date.UTC(angola.getUTCFullYear(), angola.getUTCMonth(), angola.getUTCDate()))
  const recuo = angola.getUTCHours() >= 12 ? 1 : 2                // diária em curso = hoje (>=12h) ou ontem (<12h)
  dia.setUTCDate(dia.getUTCDate() - recuo)
  return dia.toISOString().slice(0, 10)
}

export function somarDias(data: string, n: number): string {
  const d = new Date(data + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function dataExtenso(data: string): string {
  const d = new Date(data + 'T12:00:00Z')
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function dataCurta(data: string): string {
  const [a, m, d] = data.split('-')
  return `${d}-${m}-${a}`
}

// ---------------------------------------------------------------------
// Itens vendidos (juntar quantidades do mesmo produto)
// ---------------------------------------------------------------------
export function juntarItens(vendas: Venda[]): { produto: string; qtd: number; valor: number }[] {
  const mapa = new Map<string, { produto: string; qtd: number; valor: number }>()
  for (const v of vendas) {
    for (const it of v.itens ?? []) {
      const chave = it.produto.trim().toLowerCase()
      const atual = mapa.get(chave) ?? { produto: it.produto.trim(), qtd: 0, valor: 0 }
      atual.qtd += Number(it.qtd)
      atual.valor += Number(it.valor)
      mapa.set(chave, atual)
    }
  }
  return Array.from(mapa.values())
}

export function vendasPagasPor(r: RelatorioSistema, metodo: string, banco?: string): Venda[] {
  return r.vendas.filter(v =>
    v.situacao === 'pago' && v.metodo === metodo &&
    (banco === undefined || (v.banco ?? '').toUpperCase() === banco))
}

// ---------------------------------------------------------------------
// Texto para WhatsApp (gerado pelo sistema, no mesmo estilo do manual)
// ---------------------------------------------------------------------
export function textoWhatsApp(r: RelatorioSistema, iva: number | null): string {
  const L: string[] = []
  const linhaItens = (vs: Venda[]) =>
    juntarItens(vs).map(i => `${i.qtd} ${i.produto}`)

  L.push('Relatório da hospedaria (sistema)')
  L.push(dataCurta(r.data))
  L.push('')
  L.push(` Quartos ocupados:${r.ocupacao.quartos_ocupados}`)
  L.push(` Número Hóspedes:${r.ocupacao.hospedes}`)
  L.push('')
  for (const g of r.ocupacao.grupos) L.push(`${g.grupo}:${g.quartos}`)

  const blocoQuartos = (banco: string) => {
    const v = somaMetodo(r.pagamentos_estadias_por_metodo, 'tpa', banco)
    L.push('')
    L.push(`Pagamento dos quartos no TPA do ${banco}.`)
    L.push(`Valor:${kzWhatsApp(v)}`)
  }
  blocoQuartos('BIC')
  blocoQuartos('BAI')

  const blocoVendas = (banco: string) => {
    const vs = vendasPagasPor(r, 'tpa', banco)
    L.push('')
    L.push(`Vendas da sala de refeições no TPA do ${banco}.`)
    L.push(`Valor:${kzWhatsApp(vs.reduce((s, v) => s + v.valor, 0))}`)
    linhaItens(vs).forEach(l => L.push(l))
  }
  blocoVendas('BIC')
  blocoVendas('BAI')

  const totBic = somaMetodo(r.totais.por_metodo_banco, 'tpa', 'BIC')
  const totBai = somaMetodo(r.totais.por_metodo_banco, 'tpa', 'BAI')
  L.push('')
  L.push('Total no TPA do BIC.')
  L.push(`Valor:${kzWhatsApp(totBic)}`)
  L.push('')
  L.push('Total no TPA do BAI.')
  L.push(`Valor:${kzWhatsApp(totBai)}`)
  L.push('')
  L.push(`Total em banco:${kzWhatsApp(r.totais.total_banco)}`)

  const num = vendasPagasPor(r, 'numerario')
  L.push('')
  L.push('Vendas em numerário.')
  L.push(`Valor:${kzWhatsApp(num.reduce((s, v) => s + v.valor, 0))}`)
  linhaItens(num).forEach(l => L.push(l))

  const numQuartos = somaMetodo(r.pagamentos_estadias_por_metodo, 'numerario')
  if (numQuartos > 0) {
    L.push('')
    L.push('Pagamento dos quartos em numerário.')
    L.push(`Valor:${kzWhatsApp(numQuartos)}`)
  }
  if (r.totais.total_transferencia > 0) {
    L.push('')
    L.push('Pagamentos por transferência bancária.')
    L.push(`Valor:${kzWhatsApp(r.totais.total_transferencia)}`)
  }

  if (r.totais.credito_empresas.length > 0) {
    L.push('')
    L.push('Crédito (empresas):')
    for (const c of r.totais.credito_empresas) {
      L.push(`${c.empresa}: hospedagem ${kzWhatsApp(c.hospedagem)} + consumos ${kzWhatsApp(c.consumos)} = ${kzWhatsApp(c.total)}`)
    }
  }

  const contas = r.vendas.filter(v => v.situacao === 'conta_hospede')
  if (contas.length > 0) {
    L.push('')
    L.push('Contas de hóspedes por pagar no check-out:')
    const porQuarto = new Map<string, Venda[]>()
    contas.forEach(v => porQuarto.set(v.quarto ?? '?', [...(porQuarto.get(v.quarto ?? '?') ?? []), v]))
    porQuarto.forEach((vs, q) => {
      L.push(`Quarto ${q}: ${kzWhatsApp(vs.reduce((s, v) => s + v.valor, 0))}`)
      linhaItens(vs).forEach(l => L.push(`  ${l}`))
    })
  }

  L.push('')
  L.push(`Total recebido:${kzWhatsApp(r.totais.total_recebido)}`)
  if (iva !== null && iva !== undefined) {
    L.push('')
    L.push(`Valor do IVA:${kzWhatsApp(iva)}`)
  }
  return L.join('\n')
}

// ---------------------------------------------------------------------
// Ler o texto do WhatsApp da equipa e preencher o relatório manual
// ---------------------------------------------------------------------
const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Bloco =
  | 'quartos_bic' | 'quartos_bai' | 'vendas_bic' | 'vendas_bai'
  | 'numerario' | 'transf' | 'ignorar'

export function lerTextoWhatsApp(texto: string): RelatorioManual {
  const m = manualVazio()
  const linhas = texto.replace(/\r/g, '').split('\n').map(l => l.trim())

  let atual: { chave: Bloco; valor: number | null; itens: string[] } | null = null
  let jaHouvePagamentos = false

  const fechar = () => {
    if (!atual) return
    const itens = atual.itens.join('\n')
    switch (atual.chave) {
      case 'quartos_bic': m.quartos_tpa_bic = atual.valor; break
      case 'quartos_bai': m.quartos_tpa_bai = atual.valor; break
      case 'vendas_bic': m.vendas_tpa_bic = { valor: atual.valor, itens }; break
      case 'vendas_bai': m.vendas_tpa_bai = { valor: atual.valor, itens }; break
      case 'numerario': m.numerario = { valor: atual.valor, itens }; break
      case 'transf': m.transferencias = atual.valor; break
      default: break
    }
    atual = null
  }

  for (const bruta of linhas) {
    if (!bruta) continue
    const n = semAcentos(bruta)
    let r: RegExpMatchArray | null

    if ((r = n.match(/^valor do iva\s*:\s*(.+)$/))) { fechar(); m.iva = lerValor(r[1]); continue }
    if (/^att\b/.test(n)) { fechar(); continue }

    if ((r = n.match(/^quartos ocupados\s*:\s*(\d+)/))) { m.quartos_ocupados = Number(r[1]); continue }
    if ((r = n.match(/^numero hospedes\s*:\s*(\d+)/))) { m.hospedes = Number(r[1]); continue }
    if ((r = n.match(/^individuais?\s*:\s*(\d+)/))) { m.individuais = Number(r[1]); continue }
    if ((r = n.match(/^casais?\s*:\s*(\d+)/))) { m.casais = Number(r[1]); continue }

    if ((r = n.match(/^pagamento dos quartos.*tpa d[oa]\s+(bic|bai)/))) {
      fechar(); jaHouvePagamentos = true
      atual = { chave: r[1] === 'bic' ? 'quartos_bic' : 'quartos_bai', valor: null, itens: [] }; continue
    }
    if ((r = n.match(/^vendas da sala de refeicoes.*tpa d[oa]\s+(bic|bai)/))) {
      fechar(); jaHouvePagamentos = true
      atual = { chave: r[1] === 'bic' ? 'vendas_bic' : 'vendas_bai', valor: null, itens: [] }; continue
    }
    if (/^vendas em numerario/.test(n)) {
      fechar(); jaHouvePagamentos = true
      atual = { chave: 'numerario', valor: null, itens: [] }; continue
    }
    if (/^(pagamentos? )?(por )?transferenc/.test(n)) {
      fechar(); jaHouvePagamentos = true
      atual = { chave: 'transf', valor: null, itens: [] }; continue
    }
    if (/^total (no tpa|em banco)/.test(n)) {
      fechar(); jaHouvePagamentos = true
      atual = { chave: 'ignorar', valor: null, itens: [] }; continue
    }

    if ((r = n.match(/^valor\s*:\s*(.+)$/))) {
      if (atual) atual.valor = lerValor(r[1])
      continue
    }

    // Linhas "Empresa:1" antes do primeiro bloco de pagamentos
    if (!jaHouvePagamentos && (r = bruta.match(/^([^:\d][^:]*):\s*(\d+)\s*$/))) {
      m.empresas.push({ nome: r[1].trim(), quartos: Number(r[2]) })
      continue
    }

    // Qualquer outra linha, dentro de um bloco, é um item vendido
    if (atual && atual.chave !== 'ignorar' && atual.chave !== 'quartos_bic' && atual.chave !== 'quartos_bai') {
      atual.itens.push(bruta)
    }
  }
  fechar()
  return m
}

// ---------------------------------------------------------------------
// Comparação manual vs sistema
// ---------------------------------------------------------------------
export interface LinhaComparacao {
  rotulo: string
  manual: number | null
  sistema: number | null
  moeda: boolean
  nota?: string
}

export function diferenca(l: LinhaComparacao): number | null {
  if (l.manual === null || l.sistema === null) return null
  return Math.round((l.sistema - l.manual) * 100) / 100
}

export function compararRelatorios(r: RelatorioSistema, man: RelatorioManual, ivaSistema: number | null): LinhaComparacao[] {
  const g = (nome: string) => r.ocupacao.grupos.find(x => !x.empresa && x.grupo === nome)?.quartos ?? 0
  const empresasSist = r.ocupacao.grupos.filter(x => x.empresa).reduce((s, x) => s + x.quartos, 0)
  const empresasMan = man.empresas.reduce((s, x) => s + Number(x.quartos), 0)

  const quartosBic = somaMetodo(r.pagamentos_estadias_por_metodo, 'tpa', 'BIC')
  const quartosBai = somaMetodo(r.pagamentos_estadias_por_metodo, 'tpa', 'BAI')
  const vendasBic = somaMetodo(r.vendas_pagas_por_metodo, 'tpa', 'BIC')
  const vendasBai = somaMetodo(r.vendas_pagas_por_metodo, 'tpa', 'BAI')

  const soma = (...v: (number | null)[]) => v.some(x => x === null) ? null : v.reduce((s: number, x) => s + Number(x), 0)
  const manBic = soma(man.quartos_tpa_bic, man.vendas_tpa_bic.valor)
  const manBai = soma(man.quartos_tpa_bai, man.vendas_tpa_bai.valor)

  return [
    { rotulo: 'Quartos ocupados', manual: man.quartos_ocupados, sistema: r.ocupacao.quartos_ocupados, moeda: false },
    { rotulo: 'Hóspedes', manual: man.hospedes, sistema: r.ocupacao.hospedes, moeda: false },
    { rotulo: 'Quartos individuais', manual: man.individuais, sistema: g('Individuais'), moeda: false },
    { rotulo: 'Quartos de casais', manual: man.casais, sistema: g('Casais'), moeda: false },
    { rotulo: 'Quartos de empresas', manual: man.empresas.length ? empresasMan : null, sistema: empresasSist, moeda: false },
    { rotulo: 'Quartos — TPA BIC', manual: man.quartos_tpa_bic, sistema: quartosBic, moeda: true,
      nota: 'No sistema inclui consumos pagos no check-out.' },
    { rotulo: 'Quartos — TPA BAI', manual: man.quartos_tpa_bai, sistema: quartosBai, moeda: true },
    { rotulo: 'Sala de refeições — TPA BIC', manual: man.vendas_tpa_bic.valor, sistema: vendasBic, moeda: true },
    { rotulo: 'Sala de refeições — TPA BAI', manual: man.vendas_tpa_bai.valor, sistema: vendasBai, moeda: true },
    { rotulo: 'Total TPA BIC', manual: manBic, sistema: quartosBic + vendasBic, moeda: true },
    { rotulo: 'Total TPA BAI', manual: manBai, sistema: quartosBai + vendasBai, moeda: true },
    { rotulo: 'Total em banco', manual: soma(manBic, manBai), sistema: r.totais.total_banco, moeda: true },
    { rotulo: 'Vendas em numerário', manual: man.numerario.valor, sistema: somaMetodo(r.vendas_pagas_por_metodo, 'numerario'), moeda: true },
    { rotulo: 'Transferências bancárias', manual: man.transferencias, sistema: r.totais.total_transferencia, moeda: true },
    { rotulo: 'IVA', manual: man.iva, sistema: ivaSistema, moeda: true },
  ]
}


// ---------------------------------------------------------------------
// Explicações em linguagem simples (ecrã e PDF usam os mesmos textos)
// ---------------------------------------------------------------------
const juntarParcelas = (partes: [string, number][]): string => {
  const usadas = partes.filter(([, v]) => Math.abs(v) > 0.001)
  if (usadas.length === 0) return ''
  return usadas.map(([n, v]) => `${n} ${kz(v)}`).join(' + ')
}

export function explicacoes(r: RelatorioSistema, c?: ConciliacaoQuartos | null) {
  const s = r.resumo
  const t = r.totais
  const bancos = Array.from(new Set(t.por_metodo_banco.filter(x => x.metodo === 'tpa').map(x => (x.banco ?? 'SEM BANCO').toUpperCase())))

  const totalDia =
    `É o que foi faturado nesta diária, pago ou não (inclui o que ficou a crédito de empresas e o que ainda não foi pago). ` +
    `Soma: ${juntarParcelas([
      ['Hospedagem', s.hospedagem],
      ['Restaurante', s.restaurante_hospedes + s.restaurante_nao_hospedes],
      ['Bar', s.bar_hospedes + s.bar_nao_hospedes],
      ['Lavandaria', s.lavandaria],
      ['Frigobar', s.frigobar],
      ['Outros lançamentos', s.outros_lancamentos],
    ])} = ${kz(s.total_do_dia)}.`

  const totalBanco =
    `Só dinheiro recebido por TPA. Soma: ${bancos.map(b => `TPA ${b} ${kz(somaMetodo(t.por_metodo_banco, 'tpa', b))}`).join(' + ') || kz(0)} = ${kz(t.total_banco)}.`

  const totalNumerario =
    `Dinheiro em mão. Soma: quartos ${kz(somaMetodo(r.pagamentos_estadias_por_metodo, 'numerario'))} + vendas ${kz(somaMetodo(r.vendas_pagas_por_metodo, 'numerario'))} = ${kz(t.total_numerario)}.`

  const totalRecebido =
    `É o dinheiro que entrou nesta diária, pela hora do pagamento (inclui pagamentos adiantados ou de dias anteriores). ` +
    `Soma: Banco ${kz(t.total_banco)} + Numerário ${kz(t.total_numerario)} + Transferências ${kz(t.total_transferencia)} = ${kz(t.total_recebido)}.`

  let saldo = ''
  let saldoLeitura = ''
  if (c) {
    const pos = c.quartos.filter(q => q.saldo > 0.5)
    const neg = c.quartos.filter(q => q.saldo < -0.5)
    saldo = `Total do Dia ${kz(s.total_do_dia)} − Crédito de empresas ${kz(c.totais.credito)} − Total recebido ${kz(t.total_recebido)} = ${kz(c.totais.saldo)}. A tabela abaixo faz a mesma conta quarto a quarto (Devido − Crédito − Recebido = Saldo).`
    const lista = (l: LinhaQuarto[]) => l.map(q => `Q${q.quarto} (${kz(q.saldo)})`).join(', ')
    saldoLeitura =
      (pos.length ? `Saldo positivo (+): o quarto pagou menos nesta diária do que devia, porque já tinha pago antes ou ainda deve: ${lista(pos)}. ` : '') +
      (neg.length ? `Saldo negativo (−): o quarto pagou mais do que devia nesta diária, porque pagou adiantado ou uma dívida antiga: ${lista(neg)}. ` : '') +
      `Estes saldos não são erros, são diferenças de datas: ao longo da estadia de cada hóspede anulam-se. Um saldo que não se anula (hóspede que já saiu) é aviso de lançamento por rever.`
  }
  return { totalDia, totalBanco, totalNumerario, totalRecebido, saldo, saldoLeitura }
}
