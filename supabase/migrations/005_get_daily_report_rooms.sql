-- Conciliação por quarto da diária: o que cada quarto deve vs o que pagou.
-- Já aplicada na base de dados (migração "get_daily_report_rooms").
-- Depende de get_daily_report (definida directamente na base de dados).
create or replace function public.get_daily_report_rooms(p_property_id uuid, p_date date)
returns jsonb language plpgsql stable set search_path = public as $fn$
declare
  r jsonb; v_start timestamptz; v_end timestamptz; res jsonb;
begin
  r := get_daily_report(p_property_id, p_date);
  v_start := (r->>'inicio')::timestamptz;
  v_end := (r->>'fim')::timestamptz;
  with
  occ as (select q->>'quarto' as quarto, q->>'hospede' as hospede, q->>'empresa' as empresa, (q->>'valor_diaria')::numeric as diaria from jsonb_array_elements(r->'ocupacao'->'quartos') q),
  pag as (select p->>'quarto' as quarto, (p->>'valor')::numeric as valor from jsonb_array_elements(r->'pagamentos_estadias') p),
  ven as (select v->>'quarto' as quarto, v->>'hospede' as hospede, (v->>'valor')::numeric as valor, v->>'metodo' as metodo, v->>'situacao' as sit from jsonb_array_elements(r->'vendas') v),
  oth as (select o->>'quarto' as quarto, (o->>'valor')::numeric as valor from jsonb_array_elements(r->'outros_lancamentos') o),
  lav as (select rm.number::text as quarto, l.value as valor, (l.company_id is not null) as cred from laundry_records l left join stays s on s.id = l.stay_id left join rooms rm on rm.id = coalesce(l.room_id, s.room_id) where l.property_id = p_property_id and l.created_at >= v_start and l.created_at < v_end),
  frig as (select rm.number::text as quarto, m.total as valor, (m.company_id is not null) as cred from minibar_consumptions m left join stays s on s.id = m.stay_id left join rooms rm on rm.id = s.room_id where m.property_id = p_property_id and m.consumed_at >= v_start and m.consumed_at < v_end),
  qs as (select quarto from occ union select quarto from pag union select quarto from ven union select quarto from oth union select quarto from lav union select quarto from frig),
  linhas as (
    select qs.quarto,
      coalesce((select max(o.hospede) from occ o where o.quarto = qs.quarto), (select max(v.hospede) from ven v where v.quarto = qs.quarto)) as hospede,
      (select max(o.empresa) from occ o where o.quarto = qs.quarto) as empresa,
      coalesce((select sum(o.diaria) from occ o where o.quarto = qs.quarto), 0) as diaria,
      coalesce((select sum(v.valor) from ven v where v.quarto is not distinct from qs.quarto), 0) as consumos,
      coalesce((select sum(l.valor) from lav l where l.quarto is not distinct from qs.quarto), 0) as lavandaria,
      coalesce((select sum(f.valor) from frig f where f.quarto is not distinct from qs.quarto), 0) as frigobar,
      coalesce((select sum(o.valor) from oth o where o.quarto is not distinct from qs.quarto), 0) as outros,
      coalesce((select sum(v.valor) from ven v where v.quarto is not distinct from qs.quarto and v.sit = 'credito_empresa'), 0)
        + coalesce((select sum(l.valor) from lav l where l.quarto is not distinct from qs.quarto and l.cred), 0)
        + coalesce((select sum(f.valor) from frig f where f.quarto is not distinct from qs.quarto and f.cred), 0)
        + case when (select max(o.empresa) from occ o where o.quarto = qs.quarto) is not null then coalesce((select sum(o.diaria) from occ o where o.quarto = qs.quarto), 0) else 0 end as credito,
      coalesce((select sum(p.valor) from pag p where p.quarto is not distinct from qs.quarto), 0) as recebido_quarto,
      coalesce((select sum(v.valor) from ven v where v.quarto is not distinct from qs.quarto and v.metodo is not null), 0) as recebido_vendas
    from qs),
  calc as (select *, diaria + consumos + lavandaria + frigobar + outros as devido, recebido_quarto + recebido_vendas as recebido from linhas)
  select jsonb_build_object(
    'quartos', coalesce((select jsonb_agg(jsonb_build_object('quarto', quarto, 'hospede', hospede, 'empresa', empresa, 'diaria', diaria, 'consumos', consumos, 'lavandaria', lavandaria, 'frigobar', frigobar, 'outros', outros, 'devido', devido, 'credito', credito, 'recebido_quarto', recebido_quarto, 'recebido_vendas', recebido_vendas, 'recebido', recebido, 'saldo', devido - credito - recebido) order by length(quarto), quarto) from calc where quarto is not null), '[]'::jsonb),
    'sem_quarto', (select jsonb_build_object('devido', coalesce(sum(devido), 0), 'credito', coalesce(sum(credito), 0), 'recebido', coalesce(sum(recebido), 0), 'saldo', coalesce(sum(devido - credito - recebido), 0)) from calc where quarto is null),
    'totais', (select jsonb_build_object('devido', coalesce(sum(devido), 0), 'credito', coalesce(sum(credito), 0), 'recebido', coalesce(sum(recebido), 0), 'saldo', coalesce(sum(devido - credito - recebido), 0)) from calc),
    'verificacao', jsonb_build_object(
      'diferenca_faturado', (r->'resumo'->>'total_do_dia')::numeric - (select coalesce(sum(devido), 0) from calc),
      'diferenca_recebido', (r->'totais'->>'total_recebido')::numeric - (select coalesce(sum(recebido), 0) from calc))
  ) into res;
  return res;
end;
$fn$;
grant execute on function public.get_daily_report_rooms(uuid, date) to anon, authenticated, service_role;
