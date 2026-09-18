-- ============================================================================
-- Agenda de trabalho: expediente recorrente + exceções + motor de disponibilidade
-- Spec: doc/planejamento/agenda-de-trabalho.md
--
-- Tudo num arquivo só: tabelas, motor e backfill precisam entrar juntos. Se as
-- tabelas entrassem sem o backfill, o motor responderia "zero horário" para
-- todo mundo até o arquivo seguinte — apagão auto-infligido.
-- ============================================================================

-- Tabela nova com FK trava a referenciada (profiles, tenants) até o commit.
-- Se algo estiver segurando essas tabelas, falhar rápido em vez de enfileirar
-- toda escrita do app atrás desta migration.
set local lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 1. Passo da grade, por profissional (D-6)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column slot_step_minutes smallint not null default 30
    constraint profiles_slot_step_minutes_check check (slot_step_minutes in (15, 30, 60));

-- ----------------------------------------------------------------------------
-- 2. Hora de parede de Brasília
--
-- O Postgres do Supabase roda em UTC; agendamento é gravado em date + time sem
-- fuso (hora de parede). Das 21h às 24h de Brasília, em UTC já é amanhã — sem
-- isto o motor acharia que "hoje" é amanhã. Fuso fixo porque todas as clínicas
-- estão no mesmo; o Brasil não tem horário de verão desde 2019.
-- ----------------------------------------------------------------------------
create function public.app_local_now()
returns timestamp
language sql
stable
set search_path = ''
as $$
  select now() at time zone 'America/Sao_Paulo'
$$;

-- ----------------------------------------------------------------------------
-- 3. Faixa de horário -> intervalo absoluto (tsrange)
--
-- Fim > início: mesmo dia. Fim <= início: termina no dia seguinte (D-7).
-- Consequência: 00:00-00:00 = 24 horas exatas.
-- Toda a matemática de horário do motor passa por aqui: com intervalo
-- absoluto, a meia-noite deixa de ser caso especial.
-- ----------------------------------------------------------------------------
create function public.time_window(p_date date, p_starts time, p_ends time)
returns tsrange
language sql
immutable
set search_path = ''
as $$
  select tsrange(
    p_date + p_starts,
    case when p_ends > p_starts then p_date + p_ends else (p_date + 1) + p_ends end,
    '[)'
  )
$$;

-- Quanto tempo um agendamento ocupa, em intervalo absoluto.
-- Definição ÚNICA de "ocupa": usada pelo motor e pelo check_appointment_conflict.
create function public.appointment_window(p_date date, p_time time, p_duration_minutes integer)
returns tsrange
language sql
immutable
set search_path = ''
as $$
  select tsrange(
    p_date + p_time,
    p_date + p_time + make_interval(mins => coalesce(p_duration_minutes, 30)),
    '[)'
  )
$$;

-- ----------------------------------------------------------------------------
-- 4. Tabelas
-- ----------------------------------------------------------------------------
create table public.professional_schedules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week     smallint not null check (day_of_week between 0 and 6), -- 0 = domingo
  starts_at       time not null,
  ends_at         time not null,  -- <= starts_at: vira a meia-noite (D-7)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index professional_schedules_professional_dow_idx
  on public.professional_schedules (professional_id, day_of_week);

create table public.schedule_exceptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  exception_date  date not null,
  kind            text not null check (kind in ('block', 'extra')),
  starts_at       time,  -- null + block = folga o dia inteiro
  ends_at         time,
  reason          text,
  created_at      timestamptz not null default now(),
  constraint schedule_exceptions_both_or_neither_time
    check ((starts_at is null) = (ends_at is null)),
  constraint schedule_exceptions_extra_needs_time
    check (kind = 'block' or starts_at is not null)
);

create index schedule_exceptions_professional_date_idx
  on public.schedule_exceptions (professional_id, exception_date);

-- tenant_id preenchido pelo mesmo trigger das outras tabelas
create trigger trg_auto_tenant_id before insert on public.professional_schedules
  for each row execute function public.auto_set_tenant_id();
create trigger trg_auto_tenant_id before insert on public.schedule_exceptions
  for each row execute function public.auto_set_tenant_id();

create trigger update_professional_schedules_updated_at before update on public.professional_schedules
  for each row execute function public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. Não-sobreposição de faixas (D-8)
--
-- Constraint de exclusão não serve: tsrange/timerange com fim < início não
-- existe, e D-7 permite isso. Então um trigger, com a MESMA time_window() do
-- motor, numa semana de referência (2000-01-02 foi domingo). Compara também
-- com a semana anterior e a seguinte para pegar a virada sábado -> domingo.
--
-- O lock advisory serializa gravações no expediente da MESMA profissional:
-- sem ele, dois INSERT simultâneos passariam os dois pela checagem.
-- ----------------------------------------------------------------------------
create function public.professional_schedules_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ref constant date := date '2000-01-02';
  v_new tsrange;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('professional_schedules:' || new.professional_id::text, 0)
  );

  v_new := public.time_window(v_ref + new.day_of_week, new.starts_at, new.ends_at);

  if exists (
    select 1
    from public.professional_schedules s,
         lateral (select public.time_window(v_ref + s.day_of_week, s.starts_at, s.ends_at) as w) o
    where s.professional_id = new.professional_id
      and s.id is distinct from new.id
      and (
           v_new && o.w
        or v_new && tsrange(lower(o.w) + interval '7 days', upper(o.w) + interval '7 days', '[)')
        or v_new && tsrange(lower(o.w) - interval '7 days', upper(o.w) - interval '7 days', '[)')
      )
  ) then
    raise exception 'faixa de expediente sobrepõe outra da mesma profissional'
      using errcode = '23P01';  -- exclusion_violation: o mesmo erro que a constraint daria
  end if;

  return new;
end;
$$;

create trigger trg_professional_schedules_no_overlap
  before insert or update of day_of_week, starts_at, ends_at, professional_id
  on public.professional_schedules
  for each row execute function public.professional_schedules_no_overlap();

-- ----------------------------------------------------------------------------
-- 6. RLS — mesmo padrão de appointments: a própria profissional ou o admin
--    da clínica. (select ...) faz o Postgres avaliar uma vez, não por linha.
-- ----------------------------------------------------------------------------
alter table public.professional_schedules enable row level security;
alter table public.schedule_exceptions    enable row level security;

create policy "Own or admin: schedules" on public.professional_schedules
  for all to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (professional_id = (select auth.uid()) or (select public.is_super_admin()))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (professional_id = (select auth.uid()) or (select public.is_super_admin()))
  );

create policy "Own or admin: exceptions" on public.schedule_exceptions
  for all to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (professional_id = (select auth.uid()) or (select public.is_super_admin()))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (professional_id = (select auth.uid()) or (select public.is_super_admin()))
  );

-- ----------------------------------------------------------------------------
-- 7. Motor de disponibilidade (D-5)
--
--   livre = (turnos ∪ extras) − bloqueios − agendamentos
--
-- em tsmultirange (conjunto de intervalos com soma e subtração nativas).
--
-- SECURITY DEFINER porque a RLS de appointments esconde a agenda da colega:
-- rodando como quem chama, consultar a colega daria "tudo livre" — resposta
-- plausível e errada. O portão de tenant fica explícito aqui dentro.
-- ----------------------------------------------------------------------------
create function public.get_available_slots(
  p_professional_id uuid,
  p_procedure_id    uuid,
  p_start_date      date    default null,  -- null = hoje, em Brasília
  p_days            integer default 7
)
returns table (slot_date date, slot_time time)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_step     integer;
  v_duration integer;
  v_now      timestamp := public.app_local_now();
  v_first    date;
  v_last     date;  -- último dia cujo slot pode ser devolvido
  v_free     tsmultirange;
begin
  select p.tenant_id, p.slot_step_minutes
    into v_tenant, v_step
    from public.profiles p
   where p.id = p_professional_id;

  if v_tenant is null then
    raise exception 'professional not found' using errcode = 'P0002';
  end if;

  -- is distinct from, não <>: com <>, auth_tenant_id() NULL daria NULL e o
  -- portão passaria batido. Sem auth.uid() = service_role (a API), que
  -- responde pelo próprio escopo de tenant.
  if (select auth.uid()) is not null
     and (select public.auth_tenant_id()) is distinct from v_tenant then
    raise exception 'cross-tenant access denied' using errcode = '42501';
  end if;

  select pr.duration_minutes
    into v_duration
    from public.procedures pr
   where pr.id = p_procedure_id
     and pr.tenant_id = v_tenant;

  if v_duration is null then
    raise exception 'procedure not found' using errcode = 'P0002';
  end if;

  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'p_days must be between 1 and 60' using errcode = '22023';
  end if;

  v_first := coalesce(p_start_date, v_now::date);
  v_last  := v_first + p_days - 1;

  with
  -- um dia antes (turno de ontem que vira a noite) e um depois (slot que
  -- começa no último dia e termina no seguinte)
  days as (
    select d::date as d
    from pg_catalog.generate_series(v_first - 1, v_last + 1, interval '1 day') as g(d)
  ),
  day_off as (  -- folga de dia inteiro: mata o turno que COMEÇA no dia, cauda inclusa
    select e.exception_date as d
    from public.schedule_exceptions e
    where e.professional_id = p_professional_id
      and e.kind = 'block'
      and e.starts_at is null
      and e.exception_date between v_first - 1 and v_last + 1
  ),
  working as (
    select public.time_window(days.d, s.starts_at, s.ends_at) as w
    from days
    join public.professional_schedules s
      on s.professional_id = p_professional_id
     and s.day_of_week = extract(dow from days.d)
    where days.d not in (select d from day_off)
    union all
    select public.time_window(e.exception_date, e.starts_at, e.ends_at)
    from public.schedule_exceptions e
    where e.professional_id = p_professional_id
      and e.kind = 'extra'
      and e.exception_date between v_first - 1 and v_last + 1
      and e.exception_date not in (select d from day_off)
  ),
  blocked as (
    select public.time_window(e.exception_date, e.starts_at, e.ends_at) as w
    from public.schedule_exceptions e
    where e.professional_id = p_professional_id
      and e.kind = 'block'
      and e.starts_at is not null
      and e.exception_date between v_first - 1 and v_last + 1
  ),
  busy as (
    select public.appointment_window(a.appointment_date, a.appointment_time, pr.duration_minutes) as w
    from public.appointments a
    join public.procedures pr on pr.id = a.procedure_id
    where a.professional_id = p_professional_id
      and a.status <> 'cancelled'
      and a.appointment_date between v_first - 1 and v_last + 1
  )
  select
      coalesce((select pg_catalog.range_agg(w) from working), '{}'::tsmultirange)
    - coalesce((select pg_catalog.range_agg(w) from blocked), '{}'::tsmultirange)
    - coalesce((select pg_catalog.range_agg(w) from busy),    '{}'::tsmultirange)
  into v_free;

  -- Candidatos alinhados ao relógio (09:00, 09:30…), mantendo só o que CABE
  -- inteiro no pedaço livre. O passo divide 1440, então o alinhamento é o
  -- mesmo dos dois lados da meia-noite.
  return query
  select g.c::date, g.c::time
  from pg_catalog.unnest(v_free) as fr(r),
       lateral (
         select date_trunc('day', lower(fr.r))
              + make_interval(mins => (ceil(
                  extract(epoch from lower(fr.r) - date_trunc('day', lower(fr.r))) / 60.0 / v_step
                ) * v_step)::integer) as first_c
       ) a,
       lateral pg_catalog.generate_series(
         a.first_c,
         upper(fr.r) - make_interval(mins => v_duration),
         make_interval(mins => v_step)
       ) as g(c)
  where g.c::date between v_first and v_last
    and g.c > v_now
  order by g.c;
end;
$$;

-- Toda função nova em public nasce executável por anon no Supabase.
revoke execute on function public.get_available_slots(uuid, uuid, date, integer) from public, anon;
grant  execute on function public.get_available_slots(uuid, uuid, date, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. check_appointment_conflict passa a usar o MESMO appointment_window()
--
-- A versão anterior só comparava agendamentos da mesma data: sexta 23:30 de
-- 60 min não conflitava com sábado 00:00 (provado contra o banco em 18/09).
-- Mesma assinatura: o app continua chamando igual.
-- ----------------------------------------------------------------------------
create or replace function public.check_appointment_conflict(
  p_professional_id  uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_procedure_id     uuid,
  p_appointment_id   uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_duration integer;
begin
  select pr.duration_minutes into v_duration
    from public.procedures pr
   where pr.id = p_procedure_id;

  return exists (
    select 1
    from public.appointments a
    join public.procedures pr on pr.id = a.procedure_id
    where a.professional_id = p_professional_id
      and a.status <> 'cancelled'
      and (p_appointment_id is null or a.id <> p_appointment_id)
      and a.appointment_date between p_appointment_date - 1 and p_appointment_date + 1
      and public.appointment_window(a.appointment_date, a.appointment_time, pr.duration_minutes)
       && public.appointment_window(p_appointment_date, p_appointment_time, v_duration)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Expediente padrão = 24h nos 7 dias
--
-- É exatamente o que o app oferecia antes (loop 00:00-23:45), então ninguém
-- perde horário — nem quem já existe (backfill) nem quem se cadastrar depois
-- (trigger). Restringir é trabalho da tela de expediente, não da migration.
-- ----------------------------------------------------------------------------
create function public.seed_default_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.professional_schedules (tenant_id, professional_id, day_of_week, starts_at, ends_at)
  select new.tenant_id, new.id, d, time '00:00', time '00:00'
  from pg_catalog.generate_series(0, 6) as d;
  return new;
end;
$$;

revoke execute on function public.seed_default_schedule() from public, anon, authenticated;

create trigger trg_seed_default_schedule
  after insert on public.profiles
  for each row execute function public.seed_default_schedule();

insert into public.professional_schedules (tenant_id, professional_id, day_of_week, starts_at, ends_at)
select p.tenant_id, p.id, d, time '00:00', time '00:00'
from public.profiles p
cross join pg_catalog.generate_series(0, 6) as d;
