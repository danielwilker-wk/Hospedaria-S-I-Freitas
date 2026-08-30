-- =========================================================
-- SCHEMA DO SISTEMA DE GESTÃO HOTELEIRA — S&I Freitas
-- Postgres / Supabase
-- =========================================================
-- Extensões necessárias (normalmente já ativas no Supabase)
create extension if not exists "pgcrypto";

-- =========================================================
-- TIPOS ENUMERADOS
-- =========================================================
create type documento_tipo as enum ('bi', 'passaporte');
create type ocupacao_tipo as enum ('individual', 'duplo');
create type payment_method as enum ('numerario', 'tpa', 'transferencia');
create type room_status as enum ('vago', 'ocupado', 'limpeza', 'manutencao');
create type shift_period as enum ('manha', 'noite'); -- 07h-16h / 16h-07h
create type reservation_source as enum ('telefone', 'whatsapp', 'email', 'booking_com', 'presencial');
create type reservation_status as enum ('pendente', 'confirmada', 'cancelada', 'concluida');
create type stay_status as enum ('ativo', 'finalizado', 'cancelado');
create type staff_role as enum ('rececionista', 'gerencia', 'limpeza', 'admin');
create type maintenance_status as enum ('pendente', 'em_progresso', 'resolvido');
create type summary_status as enum ('rascunho', 'revisto', 'enviado');

-- =========================================================
-- 1. PROPRIEDADES (preparado para multi-hotel no futuro)
-- =========================================================
create table properties (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    nif text,
    address text,
    created_at timestamptz not null default now()
);

-- =========================================================
-- 2. TIPOLOGIA E QUARTOS
-- =========================================================
create table room_types (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id) on delete cascade,
    name text not null,               -- ex: 'Suíte Económica'
    individual_price numeric(12,2),   -- null se não aplicável (ex: Twin)
    duplo_price numeric(12,2),        -- null se não aplicável (ex: Single Junior)
    max_guests int not null default 2,
    created_at timestamptz not null default now()
);

create table rooms (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id) on delete cascade,
    room_type_id uuid not null references room_types(id),
    number text not null,             -- '1'..'24'
    status room_status not null default 'vago',
    notes text,
    unique (property_id, number)
);

-- =========================================================
-- 3. FUNCIONÁRIOS (ligado ao auth.users do Supabase)
-- =========================================================
create table staff (
    id uuid primary key references auth.users(id) on delete cascade,
    property_id uuid not null references properties(id),
    full_name text not null,
    role staff_role not null,
    phone text,
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table shifts (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    staff_id uuid not null references staff(id),
    period shift_period not null,
    started_at timestamptz not null default now(),
    ended_at timestamptz
);

-- =========================================================
-- 4. HÓSPEDES
-- =========================================================
create table guests (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    surname text,
    nif text,
    nationality text,
    birth_date date,
    document_type documento_tipo,
    document_number text,
    phone text,
    email text,
    company text,
    document_scan_url text,           -- link para o Supabase Storage
    created_at timestamptz not null default now()
);

-- =========================================================
-- 5. RESERVAS (manuais agora, Booking.com em breve)
-- =========================================================
create table reservations (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    guest_id uuid references guests(id),
    room_id uuid references rooms(id),        -- pode ficar por definir
    check_in_planned date not null,
    check_out_planned date not null,
    source reservation_source not null,
    status reservation_status not null default 'pendente',
    notes text,
    created_by uuid references staff(id),
    created_at timestamptz not null default now()
);

-- =========================================================
-- 6. ESTADIAS (CHECK-IN REAL) — substitui o Boletim de Alojamento
-- =========================================================
create table stays (
    id uuid primary key default gen_random_uuid(),
    reservation_id uuid references reservations(id),
    property_id uuid not null references properties(id),
    room_id uuid not null references rooms(id),
    primary_guest_id uuid not null references guests(id),
    occupancy ocupacao_tipo not null,
    vehicle_make text,
    vehicle_color text,
    vehicle_plate text,
    check_in_at timestamptz not null default now(),
    check_out_planned_at timestamptz,
    check_out_at timestamptz,
    room_value numeric(12,2) not null,        -- calculado a partir de room_types
    amount_paid_reservation numeric(12,2) not null default 0,
    amount_due numeric(12,2) not null default 0,
    status stay_status not null default 'ativo',
    checked_in_by uuid not null references staff(id),
    checked_out_verified_by uuid references staff(id),
    created_at timestamptz not null default now()
);

-- Hóspedes adicionais numa mesma estadia (ex: Twin com 2 pessoas)
create table stay_guests (
    id uuid primary key default gen_random_uuid(),
    stay_id uuid not null references stays(id) on delete cascade,
    guest_id uuid not null references guests(id),
    is_primary boolean not null default false
);

-- =========================================================
-- 7. PAGAMENTOS (genérico — cobre estadia, lavandaria, restaurante)
-- =========================================================
create table payments (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    source_type text not null check (source_type in ('stay', 'laundry', 'restaurant')),
    source_id uuid not null,           -- id da tabela referida por source_type
    amount numeric(12,2) not null,
    method payment_method not null,
    bank_name text,                    -- preenchido se method = 'transferencia'
    invoice_number text,
    paid_at timestamptz not null default now(),
    recorded_by uuid not null references staff(id)
);

-- =========================================================
-- 8. PEQUENOS-ALMOÇOS
-- =========================================================
create table breakfast_records (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    stay_id uuid references stays(id),
    room_id uuid not null references rooms(id),
    guest_name text not null,
    record_date date not null default current_date,
    confirmed boolean not null default false,   -- substitui a assinatura em papel
    recorded_by uuid not null references staff(id),
    created_at timestamptz not null default now()
);

-- =========================================================
-- 9. LAVANDARIA
-- =========================================================
create table laundry_records (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    stay_id uuid references stays(id),
    room_id uuid references rooms(id),
    record_date date not null default current_date,
    description text,                  -- itens entregues
    value numeric(12,2) not null default 0,
    recorded_by uuid not null references staff(id),
    created_at timestamptz not null default now()
);

-- =========================================================
-- 10. SALA DE REFEIÇÕES (restaurante)
-- =========================================================
create table restaurant_sales (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    record_date date not null default current_date,
    guest_name text,
    invoice_number text,
    value numeric(12,2) not null default 0,
    recorded_by uuid not null references staff(id),
    created_at timestamptz not null default now()
);

-- =========================================================
-- 11. LIMPEZA E VERIFICAÇÃO DOS QUARTOS
-- =========================================================
create table housekeeping_records (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    room_id uuid not null references rooms(id),
    record_date date not null default current_date,
    staff_id uuid references staff(id),        -- funcionária da limpeza
    occurred_at timestamptz not null default now(),
    occupancy ocupacao_tipo,
    cleaning_done boolean not null default false,
    maintenance_needed boolean not null default false,
    maintenance_notes text,
    laundry_service boolean not null default false,
    verified_by uuid references staff(id),      -- responsável pela verificação
    created_at timestamptz not null default now()
);

create table maintenance_requests (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    room_id uuid not null references rooms(id),
    description text not null,
    reported_by uuid not null references staff(id),
    status maintenance_status not null default 'pendente',
    reported_at timestamptz not null default now(),
    resolved_at timestamptz
);

-- =========================================================
-- 12. RESUMO DIÁRIO (gerado automaticamente, revisto antes de enviar)
-- =========================================================
create table daily_summaries (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references properties(id),
    summary_date date not null,
    total_checkins int not null default 0,
    total_checkouts int not null default 0,
    total_revenue_rooms numeric(12,2) not null default 0,
    total_revenue_breakfast numeric(12,2) not null default 0,
    total_revenue_laundry numeric(12,2) not null default 0,
    total_revenue_restaurant numeric(12,2) not null default 0,
    total_revenue_overall numeric(12,2) not null default 0,
    generated_at timestamptz not null default now(),
    reviewed_by uuid references staff(id),
    reviewed_at timestamptz,
    sent_at timestamptz,
    status summary_status not null default 'rascunho',
    notes text,
    unique (property_id, summary_date)
);

-- =========================================================
-- 13. AUDITORIA (rastreia quem fez o quê — mantém a verificação cruzada)
-- =========================================================
create table audit_log (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id),
    action text not null,
    table_name text not null,
    record_id uuid,
    details jsonb,
    changed_at timestamptz not null default now()
);

-- =========================================================
-- ÍNDICES ÚTEIS PARA RELATÓRIOS DIÁRIOS
-- =========================================================
create index idx_stays_property_date on stays (property_id, check_in_at);
create index idx_breakfast_date on breakfast_records (property_id, record_date);
create index idx_laundry_date on laundry_records (property_id, record_date);
create index idx_restaurant_date on restaurant_sales (property_id, record_date);
create index idx_housekeeping_date on housekeeping_records (property_id, record_date);
create index idx_payments_source on payments (source_type, source_id);

-- =========================================================
-- TRIGGER: calcular automaticamente o valor da estadia
-- =========================================================
create or replace function calculate_stay_value()
returns trigger as $$
declare
    v_individual numeric(12,2);
    v_duplo numeric(12,2);
begin
    select individual_price, duplo_price
    into v_individual, v_duplo
    from room_types rt
    join rooms r on r.room_type_id = rt.id
    where r.id = new.room_id;

    if new.occupancy = 'individual' then
        new.room_value := coalesce(new.room_value, v_individual);
    else
        new.room_value := coalesce(new.room_value, v_duplo);
    end if;

    return new;
end;
$$ language plpgsql;

create trigger trg_calculate_stay_value
before insert on stays
for each row execute function calculate_stay_value();

-- =========================================================
-- TRIGGER: atualizar status do quarto automaticamente
-- =========================================================
create or replace function update_room_status_on_checkin()
returns trigger as $$
begin
    update rooms set status = 'ocupado' where id = new.room_id;
    return new;
end;
$$ language plpgsql;

create trigger trg_room_status_checkin
after insert on stays
for each row execute function update_room_status_on_checkin();

create or replace function update_room_status_on_checkout()
returns trigger as $$
begin
    if new.status = 'finalizado' and old.status <> 'finalizado' then
        update rooms set status = 'limpeza' where id = new.room_id;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_room_status_checkout
after update on stays
for each row execute function update_room_status_on_checkout();

-- =========================================================
-- ROW LEVEL SECURITY (a configurar em detalhe na próxima etapa)
-- =========================================================
-- Exemplo de ativação (políticas específicas por role virão depois):
-- alter table stays enable row level security;
-- alter table guests enable row level security;
-- alter table payments enable row level security;
-- ... (uma policy por tabela, baseada em staff.role e staff.property_id)
