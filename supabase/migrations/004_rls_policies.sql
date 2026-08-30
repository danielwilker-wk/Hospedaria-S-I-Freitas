-- =========================================================
-- ROW LEVEL SECURITY (RLS) — S&I Freitas
-- Aplicar DEPOIS do seed_data.sql
-- =========================================================
-- Lógica de acesso:
--   rececionista  → mesmas permissões que gerencia em tudo operacional
--   gerencia      → igual ao rececionista + gere staff + vê audit_log
--   limpeza       → só vê e edita housekeeping_records
--   admin         → acesso total (todas as properties)
--
-- Diferenças rececionista vs gerencia (apenas 2):
--   1. Gestão de staff (criar/editar/apagar funcionários) → só gerencia/admin
--   2. Audit log (ver histórico completo)                 → só gerencia/admin
-- =========================================================

-- Função auxiliar: devolve o role do utilizador autenticado
create or replace function auth_role()
returns text as $$
    select role::text
    from staff
    where id = auth.uid();
$$ language sql stable security definer;

-- Função auxiliar: devolve a property_id do utilizador autenticado
create or replace function auth_property_id()
returns uuid as $$
    select property_id
    from staff
    where id = auth.uid();
$$ language sql stable security definer;

-- Macro interna: rececionista ou gerencia ou admin (usado em quase tudo)
-- Não é uma função real — apenas um padrão repetido nos checks abaixo

-- =========================================================
-- ATIVAR RLS EM TODAS AS TABELAS
-- =========================================================
alter table properties           enable row level security;
alter table room_types           enable row level security;
alter table rooms                enable row level security;
alter table staff                enable row level security;
alter table shifts               enable row level security;
alter table guests               enable row level security;
alter table reservations         enable row level security;
alter table stays                enable row level security;
alter table stay_guests          enable row level security;
alter table payments             enable row level security;
alter table breakfast_records    enable row level security;
alter table laundry_records      enable row level security;
alter table restaurant_sales     enable row level security;
alter table housekeeping_records enable row level security;
alter table maintenance_requests enable row level security;
alter table daily_summaries      enable row level security;
alter table audit_log            enable row level security;

-- =========================================================
-- PROPERTIES
-- =========================================================
create policy "properties: ver a sua unidade"
on properties for select
using (
    auth_role() = 'admin'
    or id = auth_property_id()
);

-- =========================================================
-- ROOM_TYPES
-- =========================================================
create policy "room_types: ver"
on room_types for select
using (
    auth_role() = 'admin'
    or property_id = auth_property_id()
);

-- Rececionista e gerencia podem editar (preços, tipos)
create policy "room_types: gerir (rececionista, gerencia, admin)"
on room_types for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- ROOMS
-- =========================================================
create policy "rooms: ver"
on rooms for select
using (
    auth_role() = 'admin'
    or property_id = auth_property_id()
);

create policy "rooms: gerir (rececionista, gerencia, admin)"
on rooms for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- STAFF
-- ÚNICA tabela onde rececionista NÃO tem as mesmas permissões:
-- rececionista pode ver colegas, mas não criar/editar/apagar
-- =========================================================
create policy "staff: ver colegas da mesma property"
on staff for select
using (
    auth_role() = 'admin'
    or property_id = auth_property_id()
);

create policy "staff: gerir (gerencia/admin apenas)"
on staff for insert
with check (auth_role() in ('gerencia', 'admin'));

create policy "staff: editar (gerencia/admin apenas)"
on staff for update
using (auth_role() in ('gerencia', 'admin'));

create policy "staff: apagar (gerencia/admin apenas)"
on staff for delete
using (auth_role() in ('gerencia', 'admin'));

-- =========================================================
-- SHIFTS
-- =========================================================
create policy "shifts: ver e gerir"
on shifts for all
using (
    auth_role() = 'admin'
    or property_id = auth_property_id()
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- GUESTS
-- =========================================================
create policy "guests: ver, criar, editar, apagar"
on guests for all
using (auth_role() in ('rececionista', 'gerencia', 'admin'))
with check (auth_role() in ('rececionista', 'gerencia', 'admin'));

-- =========================================================
-- RESERVATIONS
-- =========================================================
create policy "reservations: ver e gerir"
on reservations for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- STAYS
-- =========================================================
create policy "stays: ver e gerir"
on stays for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- STAY_GUESTS
-- =========================================================
create policy "stay_guests: ver e gerir"
on stay_guests for all
using (auth_role() in ('rececionista', 'gerencia', 'admin'))
with check (auth_role() in ('rececionista', 'gerencia', 'admin'));

-- =========================================================
-- PAYMENTS
-- =========================================================
create policy "payments: ver e gerir"
on payments for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- BREAKFAST_RECORDS
-- =========================================================
create policy "breakfast: ver e gerir"
on breakfast_records for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- LAUNDRY_RECORDS
-- =========================================================
create policy "laundry: ver e gerir"
on laundry_records for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- RESTAURANT_SALES
-- =========================================================
create policy "restaurant: ver e gerir"
on restaurant_sales for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- HOUSEKEEPING_RECORDS
-- =========================================================
create policy "housekeeping: ver (todos da property)"
on housekeeping_records for select
using (
    auth_role() = 'admin'
    or property_id = auth_property_id()
);

create policy "housekeeping: registar e atualizar"
on housekeeping_records for insert
with check (
    auth_role() in ('limpeza', 'rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

create policy "housekeeping: editar"
on housekeeping_records for update
using (
    auth_role() in ('limpeza', 'rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

create policy "housekeeping: apagar (rececionista, gerencia, admin)"
on housekeeping_records for delete
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- MAINTENANCE_REQUESTS
-- =========================================================
create policy "maintenance: ver e gerir"
on maintenance_requests for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- DAILY_SUMMARIES
-- =========================================================
create policy "daily_summaries: ver e gerir"
on daily_summaries for all
using (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
)
with check (
    auth_role() in ('rececionista', 'gerencia', 'admin')
    and (auth_role() = 'admin' or property_id = auth_property_id())
);

-- =========================================================
-- AUDIT_LOG
-- SEGUNDA tabela onde rececionista NÃO tem as mesmas permissões:
-- rececionista pode inserir logs, mas não ler o histórico completo
-- =========================================================
create policy "audit_log: ver (gerencia/admin apenas)"
on audit_log for select
using (auth_role() in ('gerencia', 'admin'));

create policy "audit_log: inserir (todos os perfis operacionais)"
on audit_log for insert
with check (auth_role() in ('rececionista', 'gerencia', 'admin', 'limpeza'));
