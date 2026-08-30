-- =========================================================
-- FUNÇÃO: GERAÇÃO DO RESUMO DIÁRIO
-- Chama-se generate_daily_summary(property_id, data)
-- Pode ser chamada manualmente ou por um trigger/schedule
-- =========================================================

create or replace function generate_daily_summary(
    p_property_id uuid,
    p_date date default current_date - 1  -- por defeito: dia anterior
)
returns void as $$
declare
    v_total_checkins        int;
    v_total_checkouts       int;
    v_revenue_rooms         numeric(12,2);
    v_revenue_breakfast     numeric(12,2);
    v_revenue_laundry       numeric(12,2);
    v_revenue_restaurant    numeric(12,2);
    v_revenue_overall       numeric(12,2);
begin
    -- Total de check-ins no dia
    select count(*)
    into v_total_checkins
    from stays
    where property_id = p_property_id
      and check_in_at::date = p_date;

    -- Total de check-outs no dia
    select count(*)
    into v_total_checkouts
    from stays
    where property_id = p_property_id
      and check_out_at::date = p_date;

    -- Receita de alojamento (estadias que fizeram check-in no dia)
    select coalesce(sum(room_value), 0)
    into v_revenue_rooms
    from stays
    where property_id = p_property_id
      and check_in_at::date = p_date
      and status in ('ativo', 'finalizado');

    -- Receita de pequenos-almoços no dia
    -- (pequenos-almoços incluídos no quarto não geram receita separada;
    --  se vierem a ser cobrados separadamente no futuro, ajustar aqui)
    select coalesce(
        (select sum(amount)
         from payments p
         where p.property_id = p_property_id
           and p.source_type = 'laundry'
           and p.paid_at::date = p_date),
        0
    )
    into v_revenue_breakfast;
    -- Nota: por ora o pequeno-almoço está incluído no preço do quarto.
    -- Esta linha ficará em 0 até o modelo de negócio mudar.
    -- Para contar hóspedes que tomaram pequeno-almoço (sem valor financeiro):
    -- select count(*) from breakfast_records where record_date = p_date ...

    -- Receita de lavandaria no dia
    select coalesce(sum(p.amount), 0)
    into v_revenue_laundry
    from payments p
    where p.property_id = p_property_id
      and p.source_type = 'laundry'
      and p.paid_at::date = p_date;

    -- Receita de restaurante no dia
    select coalesce(sum(p.amount), 0)
    into v_revenue_restaurant
    from payments p
    where p.property_id = p_property_id
      and p.source_type = 'restaurant'
      and p.paid_at::date = p_date;

    -- Total geral
    v_revenue_overall := coalesce(v_revenue_rooms, 0)
                       + coalesce(v_revenue_laundry, 0)
                       + coalesce(v_revenue_restaurant, 0);

    -- Inserir ou atualizar o resumo do dia (upsert)
    insert into daily_summaries (
        property_id,
        summary_date,
        total_checkins,
        total_checkouts,
        total_revenue_rooms,
        total_revenue_breakfast,
        total_revenue_laundry,
        total_revenue_restaurant,
        total_revenue_overall,
        generated_at,
        status
    )
    values (
        p_property_id,
        p_date,
        v_total_checkins,
        v_total_checkouts,
        v_revenue_rooms,
        v_revenue_breakfast,
        v_revenue_laundry,
        v_revenue_restaurant,
        v_revenue_overall,
        now(),
        'rascunho'
    )
    on conflict (property_id, summary_date)
    do update set
        total_checkins            = excluded.total_checkins,
        total_checkouts           = excluded.total_checkouts,
        total_revenue_rooms       = excluded.total_revenue_rooms,
        total_revenue_breakfast   = excluded.total_revenue_breakfast,
        total_revenue_laundry     = excluded.total_revenue_laundry,
        total_revenue_restaurant  = excluded.total_revenue_restaurant,
        total_revenue_overall     = excluded.total_revenue_overall,
        generated_at              = now(),
        -- Só repõe para rascunho se ainda não foi revisto ou enviado
        status = case
            when daily_summaries.status = 'enviado' then 'enviado'
            when daily_summaries.status = 'revisto' then 'revisto'
            else 'rascunho'
        end;

end;
$$ language plpgsql;

-- =========================================================
-- COMO USAR
-- =========================================================
-- Gerar resumo do dia anterior (uso mais comum, corrido às ~07h):
--   select generate_daily_summary('00000000-0000-0000-0000-000000000001');
--
-- Gerar resumo de uma data específica:
--   select generate_daily_summary(
--       '00000000-0000-0000-0000-000000000001',
--       '2025-08-27'
--   );
--
-- Ver o resumo gerado:
--   select * from daily_summaries order by summary_date desc limit 5;
-- =========================================================

-- =========================================================
-- AGENDAMENTO AUTOMÁTICO (pg_cron — disponível no Supabase)
-- Corre todos os dias às 07h15 (hora UTC, ajustar para Angola UTC+1)
-- Descomenta e executa separadamente após ativar pg_cron no Supabase
-- =========================================================
/*
select cron.schedule(
    'gerar-resumo-diario',
    '15 06 * * *',   -- 06h15 UTC = 07h15 Angola (UTC+1)
    $$
        select generate_daily_summary('00000000-0000-0000-0000-000000000001');
    $$
);
*/

-- =========================================================
-- VISTA AUXILIAR: ocupação actual (útil para o dashboard)
-- =========================================================
create or replace view v_room_occupancy as
select
    r.number                        as room_number,
    rt.name                         as room_type,
    r.status                        as room_status,
    s.id                            as stay_id,
    g.full_name                     as guest_name,
    s.occupancy,
    s.check_in_at,
    s.check_out_planned_at,
    s.room_value,
    s.amount_due
from rooms r
join room_types rt on rt.id = r.room_type_id
left join stays s on s.room_id = r.id and s.status = 'ativo'
left join guests g on g.id = s.primary_guest_id
where r.property_id = '00000000-0000-0000-0000-000000000001'
order by r.number::int;
