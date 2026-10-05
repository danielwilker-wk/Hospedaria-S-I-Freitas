import jsPDF from 'jspdf'
import {
  RelatorioSistema, kz, kzCent, rotuloMetodo, dataExtenso, juntarItens,
  vendasPagasPor, somaMetodo, ConciliacaoQuartos,
} from './relatorio'

const LARANJA: [number, number, number] = [234, 88, 12]
const LARANJA_CLARO: [number, number, number] = [255, 237, 213]
const CINZA: [number, number, number] = [107, 114, 128]
const ESCURO: [number, number, number] = [31, 41, 55]

// PDF do relatório diário. Primeira página: mesmo layout do relatório antigo
// (Receção / Sala de Refeições / Outros / Total do Dia). Depois: o detalhe.
export function baixarPdfDiario(r: RelatorioSistema, iva: number | null, conciliacao?: ConciliacaoQuartos | null) {
  const doc = new jsPDF()
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const mx = 14
  let y = 0

  const cabecalho = () => {
    doc.setFillColor(...LARANJA)
    doc.rect(0, 0, largura, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Hospedaria S&I Freitas', mx, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Relatório Diário — ${dataExtenso(r.data)}`, mx, 23)
    y = 44
  }

  const garantir = (altura_necessaria: number) => {
    if (y + altura_necessaria > altura - 18) {
      doc.addPage()
      y = 20
    }
  }

  const titulo = (texto: string) => {
    garantir(16)
    doc.setFillColor(...LARANJA)
    doc.rect(mx, y - 4, 2.5, 5, 'F')
    doc.setTextColor(...ESCURO)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(texto, mx + 5, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
  }

  const linha = (rotulo: string, valor: string, destaque = false) => {
    garantir(7)
    doc.setFont('helvetica', destaque ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...(destaque ? ESCURO : CINZA))
    doc.text(rotulo, mx, y)
    doc.setTextColor(...ESCURO)
    doc.text(valor, largura - mx, y, { align: 'right' })
    y += 5.5
  }

  // Texto que pode ocupar várias linhas, com valor à direita na primeira
  const linhaLonga = (rotulo: string, valor: string, recuo = 0) => {
    const larguraTexto = largura - mx * 2 - 34 - recuo
    const partes: string[] = doc.splitTextToSize(rotulo, larguraTexto)
    garantir(partes.length * 4.6 + 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...ESCURO)
    partes.forEach((p, i) => {
      doc.text(p, mx + recuo, y + i * 4.6)
    })
    if (valor) doc.text(valor, largura - mx, y, { align: 'right' })
    y += partes.length * 4.6 + 1.2
  }

  const divisor = () => {
    y += 1
    garantir(6)
    doc.setDrawColor(230, 230, 230)
    doc.line(mx, y, largura - mx, y)
    y += 7
  }

  const subtitulo = (texto: string) => {
    garantir(9)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...ESCURO)
    doc.text(texto, mx, y)
    y += 5.5
  }

  // ---------------------------------------------------------------- Página 1
  cabecalho()
  const s = r.resumo

  titulo('Receção')
  linha('Check-ins', String(s.checkins))
  linha('Check-outs', String(s.checkouts))
  linha('Quartos ocupados', String(r.ocupacao.quartos_ocupados))
  linha('Hóspedes', String(r.ocupacao.hospedes))
  divisor()

  titulo('Sala de Refeições')
  linha('Restaurante — hóspedes', kz(s.restaurante_hospedes))
  linha('Restaurante — não-hóspedes', kz(s.restaurante_nao_hospedes))
  linha('Bar — hóspedes', kz(s.bar_hospedes))
  linha('Bar — não-hóspedes', kz(s.bar_nao_hospedes))
  divisor()

  titulo('Outros')
  linha('Pequenos-almoços servidos', String(s.pequenos_almocos_servidos))
  linha('Lavandaria', kz(s.lavandaria))
  linha('Frigobar', kz(s.frigobar))
  linha('Hospedagem', kz(s.hospedagem))
  if (s.outros_lancamentos > 0) linha('Outros lançamentos (mini diária, etc.)', kz(s.outros_lancamentos))
  y += 3

  garantir(18)
  doc.setFillColor(...LARANJA_CLARO)
  doc.roundedRect(mx, y, largura - mx * 2, 14, 2, 2, 'F')
  doc.setTextColor(...ESCURO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Total do Dia', mx + 4, y + 9)
  doc.setTextColor(...LARANJA)
  doc.setFontSize(12)
  doc.text(kz(s.total_do_dia), largura - mx - 4, y + 9, { align: 'right' })
  y += 22

  // ---------------------------------------------------------------- Ocupação
  titulo('Ocupação')
  r.ocupacao.grupos.forEach(g => {
    linha(`${g.grupo} (${g.quartos} ${g.quartos === 1 ? 'quarto' : 'quartos'}, ${g.hospedes} ${g.hospedes === 1 ? 'hóspede' : 'hóspedes'})`, kz(g.valor_diaria))
  })
  divisor()

  // ---------------------------------------------------------------- Recebimentos
  garantir(95) // mantém a secção inteira na mesma página
  titulo('Recebimentos')
  const t = r.totais
  const bancos = Array.from(new Set(t.por_metodo_banco.filter(x => x.metodo === 'tpa').map(x => (x.banco ?? 'SEM BANCO').toUpperCase())))
  bancos.forEach(b => {
    linha(`Quartos — TPA ${b}`, kz(somaMetodo(r.pagamentos_estadias_por_metodo, 'tpa', b)))
    linha(`Sala de refeições — TPA ${b}`, kz(somaMetodo(r.vendas_pagas_por_metodo, 'tpa', b)))
    linha(`Total TPA ${b}`, kz(somaMetodo(t.por_metodo_banco, 'tpa', b)), true)
  })
  linha('Total em banco', kz(t.total_banco), true)
  linha('Numerário — quartos', kz(somaMetodo(r.pagamentos_estadias_por_metodo, 'numerario')))
  linha('Numerário — vendas', kz(somaMetodo(r.vendas_pagas_por_metodo, 'numerario')))
  linha('Total em numerário', kz(t.total_numerario), true)
  if (t.total_transferencia > 0) linha('Transferências bancárias', kz(t.total_transferencia), true)
  linha('Total recebido', kz(t.total_recebido), true)
  if (iva !== null && iva !== undefined) linha('Valor do IVA (faturas VD)', kzCent(iva), true)
  divisor()

  // ---------------------------------------------------------------- Conciliação
  if (conciliacao) {
    garantir(60)
    titulo('Conciliação: Total do Dia vs Total recebido')
    linha('Total do Dia (faturado)', kz(s.total_do_dia))
    linha('− Crédito de empresas (a faturar)', kz(conciliacao.totais.credito))
    linha('− Total recebido', kz(t.total_recebido))
    linha('= Saldo dos quartos (soma da tabela)', kz(conciliacao.totais.saldo), true)
    y += 1
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...CINZA)
    const nota: string[] = doc.splitTextToSize(
      'Saldo positivo: o quarto deve (consumo por pagar) ou pagou a sua diária noutro dia. Saldo negativo: pagou adiantado ou pagou dívidas de outros dias.',
      largura - mx * 2)
    nota.forEach(n => { doc.text(n, mx, y); y += 4 })
    y += 2

    const cols = { q: mx, h: mx + 10, dev: largura - mx - 78, cred: largura - mx - 52, rec: largura - mx - 26, sal: largura - mx }
    const cab = () => {
      garantir(10)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...ESCURO)
      doc.text('Q.', cols.q, y); doc.text('Hóspede', cols.h, y)
      doc.text('Devido', cols.dev, y, { align: 'right' }); doc.text('Crédito', cols.cred, y, { align: 'right' })
      doc.text('Recebido', cols.rec, y, { align: 'right' }); doc.text('Saldo', cols.sal, y, { align: 'right' })
      y += 2; doc.setDrawColor(200, 200, 200); doc.line(mx, y, largura - mx, y); y += 4.5
    }
    const num = (n: number) => Math.round(n).toLocaleString('pt-AO')
    const linhaTab = (q: string, h: string, dev: number, cred: number, rec: number, sal: number, negrito = false) => {
      if (y + 6 > altura - 18) { doc.addPage(); y = 20; cab() }
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(8); doc.setTextColor(...ESCURO)
      doc.text(q, cols.q, y)
      const nome = h.length > 28 ? h.slice(0, 27) + '…' : h
      doc.text(nome, cols.h, y)
      doc.text(num(dev), cols.dev, y, { align: 'right' })
      doc.text(cred ? num(cred) : '-', cols.cred, y, { align: 'right' })
      doc.text(num(rec), cols.rec, y, { align: 'right' })
      doc.text(sal === 0 ? '-' : num(sal), cols.sal, y, { align: 'right' })
      y += 5
    }
    cab()
    conciliacao.quartos.forEach(q => linhaTab(q.quarto, `${(q.hospede ?? '').trim()}${q.empresa ? ' (' + q.empresa + ')' : ''}`, q.devido, q.credito, q.recebido, q.saldo))
    const sq = conciliacao.sem_quarto
    if (sq.devido > 0 || sq.recebido > 0) linhaTab('-', 'Clientes não hóspedes', sq.devido, sq.credito, sq.recebido, sq.saldo)
    linhaTab('', 'Total', conciliacao.totais.devido, conciliacao.totais.credito, conciliacao.totais.recebido, conciliacao.totais.saldo, true)
    y += 3
    divisor()
  }

  // ---------------------------------------------------------------- Pagamentos de quartos
  if (r.pagamentos_estadias.length > 0) {
    titulo('Pagamentos de quartos')
    r.pagamentos_estadias.forEach(p => {
      linhaLonga(`${p.hora} · Quarto ${p.quarto ?? '?'}${p.hospede ? ' · ' + p.hospede.trim() : ''} · ${rotuloMetodo(p.metodo, p.banco)}`, kz(p.valor))
    })
    divisor()
  }

  // ---------------------------------------------------------------- Vendas detalhadas
  const blocoVendas = (rotulo: string, vendas: typeof r.vendas) => {
    if (vendas.length === 0) return
    subtitulo(`${rotulo} — ${kz(vendas.reduce((a, v) => a + v.valor, 0))}`)
    vendas.forEach(v => {
      const onde = v.area === 'bar' ? 'Bar' : 'Restaurante'
      const quem = v.quarto ? `Q${v.quarto}` : (v.cliente ?? 'Não-hóspede')
      const itens = juntarItens([v]).map(i => `${i.qtd}x ${i.produto}`).join(', ')
      linhaLonga(`${v.hora.slice(6)} · ${onde} · ${quem} — ${itens}`, kz(v.valor), 3)
    })
    y += 2
  }

  if (r.vendas.length > 0) {
    titulo('Vendas da sala de refeições (detalhe)')
    bancos.forEach(b => blocoVendas(`TPA ${b}`, vendasPagasPor(r, 'tpa', b)))
    blocoVendas('Numerário', vendasPagasPor(r, 'numerario'))
    blocoVendas('Crédito de empresa', r.vendas.filter(v => v.situacao === 'credito_empresa'))
    blocoVendas('Conta do hóspede (a pagar no check-out)', r.vendas.filter(v => v.situacao === 'conta_hospede'))
    blocoVendas('Conta do hóspede (paga no check-out)', r.vendas.filter(v => v.situacao === 'conta_hospede_paga_no_checkout'))
    blocoVendas('Sem pagamento registado', r.vendas.filter(v => v.situacao === 'sem_pagamento'))
    divisor()
  }

  // ---------------------------------------------------------------- Crédito
  if (t.credito_empresas.length > 0) {
    titulo('Hóspedes e vendas a crédito')
    t.credito_empresas.forEach(c => {
      linha(`${c.empresa} — hospedagem`, kz(c.hospedagem))
      linha(`${c.empresa} — consumos`, kz(c.consumos))
      linha(`${c.empresa} — total`, kz(c.total), true)
    })
    divisor()
  }

  // ---------------------------------------------------------------- Outros serviços
  if (r.lavandaria.length + r.frigobar.length + r.outros_lancamentos.length > 0) {
    titulo('Lavandaria, frigobar e outros lançamentos')
    r.lavandaria.forEach(l => linhaLonga(`Lavandaria${l.descricao ? ' — ' + l.descricao.trim() : ''}${l.empresa ? ' (' + l.empresa + ')' : ''}`, kz(l.valor)))
    r.frigobar.forEach(f => linhaLonga(`Frigobar — ${f.qtd}x ${f.produto ?? ''}${f.empresa ? ' (' + f.empresa + ')' : ''}`, kz(f.valor)))
    r.outros_lancamentos.forEach(o => linhaLonga(
      `Quarto ${o.quarto ?? '?'} — ${o.descricao?.trim() || o.tipo || 'Lançamento'}${o.pago ? ' · pago ' + rotuloMetodo(o.metodo ?? '', o.banco) : ' · por pagar'}`,
      kz(o.valor)))
  }

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')} pelo sistema de gestão S&I Freitas`, mx, altura - 10)
    doc.text(`${i}/${total}`, largura - mx, altura - 10, { align: 'right' })
  }

  doc.save(`relatorio-diario-${r.data}.pdf`)
}
