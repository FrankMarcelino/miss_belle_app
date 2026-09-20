-- ============================================================================
-- Colunas do contrato da API v1 + duração congelada no agendamento (fatia 2)
-- ============================================================================

set local lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 1. Procedimento: texto e sinônimos para o bot casar linguagem natural
-- ----------------------------------------------------------------------------
alter table public.procedures
  add column description text   not null default '',
  add column synonyms    text[] not null default '{}';

comment on column public.procedures.synonyms is
  'Como a cliente chama este serviço ("escova", "corte + finalização"). Usado para casar texto livre.';

-- ----------------------------------------------------------------------------
-- 2. Políticas por profissional (valem só para a API; no app a profissional é livre)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column min_notice_hours smallint not null default 2
    constraint profiles_min_notice_hours_check check (min_notice_hours >= 0),
  add column max_reschedules  smallint not null default 1
    constraint profiles_max_reschedules_check check (max_reschedules >= 0);

-- ----------------------------------------------------------------------------
-- 3. Campos que o contrato devolve e não existiam
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column notes        text,
  add column cancelled_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. Duração congelada
--
-- Antes, motor e conflito liam a duração do procedimento por JOIN: mudar
-- "Corte" de 60 para 90 min esticava TODOS os agendamentos já marcados, e
-- horários livres passavam a colidir sem ninguém ter mexido neles.
-- É também o que torna possível a constraint de exclusão da fatia seguinte,
-- porque constraint não enxerga outra tabela.
-- ----------------------------------------------------------------------------
alter table public.appointments add column duration_minutes integer;

create function public.appointments_copy_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select p.duration_minutes into new.duration_minutes
  from public.procedures p
  where p.id = new.procedure_id;

  if new.duration_minutes is null then
    new.duration_minutes := 30;  -- mesmo fallback que o código antigo usava
  end if;

  return new;
end;
$$;

create trigger trg_appointments_copy_duration
  before insert or update of procedure_id on public.appointments
  for each row execute function public.appointments_copy_duration();

update public.appointments a
   set duration_minutes = coalesce(p.duration_minutes, 30)
  from public.procedures p
 where p.id = a.procedure_id
   and a.duration_minutes is null;

alter table public.appointments alter column duration_minutes set not null;

-- ----------------------------------------------------------------------------
-- 5. Motor e conflito passam a ler a duração congelada
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
  -- O candidato ainda não é agendamento: a duração dele vem do procedimento.
  select pr.duration_minutes into v_duration
    from public.procedures pr
   where pr.id = p_procedure_id;

  return exists (
    select 1
    from public.appointments a
    where a.professional_id = p_professional_id
      and a.status <> 'cancelled'
      and (p_appointment_id is null or a.id <> p_appointment_id)
      and a.appointment_date between p_appointment_date - 1 and p_appointment_date + 1
      and public.appointment_window(a.appointment_date, a.appointment_time, a.duration_minutes)
       && public.appointment_window(p_appointment_date, p_appointment_time, v_duration)
  );
end;
$$;

create or replace function public.get_available_slots(
  p_professional_id uuid,
  p_procedure_id    uuid,
  p_start_date      date    default null,  -- null = hoje, em Brasília
  p_days            integer default 7,
  p_exclude_appointment_id uuid default null  -- remarcação: o próprio não bloqueia
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
    select public.appointment_window(a.appointment_date, a.appointment_time, a.duration_minutes) as w
    from public.appointments a
    where a.professional_id = p_professional_id
      and a.status <> 'cancelled'
      and a.id is distinct from p_exclude_appointment_id
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
