-- ============================================================================
-- Lembrete de retoque (#12, fatia 2)
--
-- Quem teve o procedimento CONCLUÍDO há N dias recebe o lembrete NO DIA N — e
-- não "todo mundo que já passou de N dias": ligar numa segunda não dispara de
-- uma vez para as clientes dos últimos meses (eram 25 micropigmentações
-- concluídas em 120 dias na Miss Belle, 28/09).
--
-- Pares configuráveis (gatilho → retoque), ex.: Micropigmentação → Manutenção
-- da Micro. Para sozinho se a cliente responder OU já tiver o retoque do par
-- marcado depois do procedimento (inclusive por telefone). Retoque não cancela
-- nada: "sem resposta" é sempre "nada". Tentativas em DIAS.
--
-- Mesmo motor da confirmação: o ciclo ganha um tipo. A chave única passa a
-- incluir o tipo — a micro concluída já teve um ciclo de confirmação na véspera
-- com o mesmo (agendamento, data, hora).
-- ============================================================================

set local lock_timeout = '5s';

alter table public.automated_messages
  drop constraint automated_messages_kind_check,
  add constraint automated_messages_kind_check check (kind in ('confirmacao', 'retoque')),
  add column days_after smallint check (days_after between 1 and 365),
  add column interval_days smallint check (interval_days between 1 and 90),
  -- [{ "gatilho": <procedure id>, "retoque": <procedure id> }, …]
  add column procedure_pairs jsonb,
  add constraint automated_messages_retoque_completo check (
    kind <> 'retoque' or (
      days_after is not null and interval_days is not null
      and jsonb_typeof(procedure_pairs) = 'array' and jsonb_array_length(procedure_pairs) > 0
      and on_no_reply = 'nada'
    ));

alter table public.appointment_confirmations
  add column kind text not null default 'confirmacao' check (kind in ('confirmacao', 'retoque')),
  drop constraint appointment_confirmations_appointment_id_for_date_for_time_key,
  add constraint appointment_confirmations_ciclo_unico unique (kind, appointment_id, for_date, for_time);

-- ── A confirmação passa a olhar só os ciclos DELA ───────────────────────────
-- Sem isto, um ciclo de retoque (sent_count 0, agendamento `completed`) cairia
-- no case da confirmação. O resto da função é o da 20260929130000.

create or replace function public.confirmacao_proximas_acoes(
  p_limite int default 5,
  p_agora  timestamp default null
)
returns table (
  confirmacao_id         uuid,
  tenant_id              uuid,
  appointment_id         uuid,
  acao                   text,
  tentativa              int,
  conversation_id        uuid,
  primeiro_envio_em      timestamptz,
  cliente_nome           text,
  cliente_telefone       text,
  procedimento           text,
  profissional           text,
  data                   date,
  hora                   text,
  tenant_integration_id  text,
  agent_slug             text,
  livia_agent_id         uuid,
  livia_channel_id       uuid,
  texto                  text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_agora  timestamp   := coalesce(p_agora, public.app_local_now());
  v_tz     timestamptz := v_agora at time zone 'America/Sao_Paulo';
begin
  insert into public.appointment_confirmations (tenant_id, appointment_id, for_date, for_time, kind)
  select a.tenant_id, a.id, a.appointment_date, a.appointment_time, 'confirmacao'
    from public.appointments a
    join public.profiles p on p.id = a.professional_id
    join public.confirmation_settings s on s.tenant_id = a.tenant_id
    join public.automated_messages m on m.tenant_id = a.tenant_id and m.kind = 'confirmacao' and m.enabled
   where a.status = 'scheduled'
     and a.appointment_date = v_agora::date + 1
     and v_agora::time >= m.send_time
     and v_agora::time <  m.send_time + make_interval(hours => m.interval_hours)
     and p.confirmation_enabled
     and p.confirmation_starts_on is not null
     and a.appointment_date >= p.confirmation_starts_on
  on conflict (kind, appointment_id, for_date, for_time) do nothing;

  return query
  with alvo as (
    select c.id, x.acao, x.tentativa
      from public.appointment_confirmations c
      join public.appointments a on a.id = c.appointment_id
      join public.profiles p on p.id = a.professional_id
      join public.automated_messages m on m.tenant_id = c.tenant_id and m.kind = 'confirmacao'
      cross join lateral (
        select
          case
            when c.cancelled_at is not null and c.cancel_notice_sent_at is null then 'aviso_cancelamento'
            when c.cancelled_at is not null then null
            when not m.enabled then null
            when a.status <> 'scheduled'
              or a.appointment_date <> c.for_date or a.appointment_time <> c.for_time
              or not p.confirmation_enabled or p.confirmation_starts_on is null
              or a.appointment_date < p.confirmation_starts_on then null
            when c.sent_count = 0
              and v_agora::time >= m.send_time
              and v_agora::time <  m.send_time + make_interval(hours => m.interval_hours)
              and c.for_date = v_agora::date + 1 then 'primeiro'
            when c.sent_count between 1 and m.attempts - 1
              and c.first_sent_at <= v_tz - make_interval(hours => m.interval_hours * c.sent_count) then 'lembrete'
            when c.sent_count >= m.attempts and m.on_no_reply = 'cancelar'
              and c.first_sent_at <= v_tz - make_interval(hours => m.interval_hours * m.attempts)
              and (c.for_date + c.for_time) > v_agora then 'cancelar'
          end as acao,
          case when c.cancelled_at is null then c.sent_count + 1 end as tentativa
      ) x
     where c.kind = 'confirmacao'
       and x.acao is not null
       and c.gave_up_at is null
       and c.replied_at is null
       and (c.processing_until is null or c.processing_until <= v_tz)
       and (c.retry_after is null or c.retry_after <= v_tz)
       and exists (select 1 from public.confirmation_settings s where s.tenant_id = c.tenant_id)
     order by c.for_date, c.for_time
     limit greatest(p_limite, 0)
       for update of c skip locked
  ),
  reservado as (
    update public.appointment_confirmations c
       set processing_until = v_tz + interval '5 minutes',
           updated_at = now()
      from alvo
     where c.id = alvo.id
    returning c.id, alvo.acao, alvo.tentativa
  )
  select
    c.id, c.tenant_id, c.appointment_id, r.acao,
    case when r.acao in ('primeiro', 'lembrete') then r.tentativa end,
    c.conversation_id, c.first_sent_at,
    split_part(btrim(pa.full_name), ' ', 1),
    pa.phone_e164,
    pr.name,
    prof.full_name,
    c.for_date,
    to_char(c.for_time, 'HH24:MI'),
    s.tenant_integration_id, s.agent_slug, s.livia_agent_id, s.livia_channel_id,
    replace(replace(replace(replace(replace(replace(
      case
        when r.acao in ('primeiro', 'lembrete') then m.texts ->> (r.tentativa - 1)
        when r.acao = 'aviso_cancelamento' then m.cancel_text
        else ''
      end,
      '{nome}', split_part(btrim(pa.full_name), ' ', 1)),
      '{procedimento}', coalesce(pr.name, 'atendimento')),
      '{dia}', (array['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
                 [extract(dow from c.for_date)::int + 1] || ', ' || to_char(c.for_date, 'DD/MM')),
      '{hora}', to_char(c.for_time, 'HH24:MI')),
      '{profissional}', split_part(btrim(prof.full_name), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(prof.full_name), ' ', 2), ''), '')),
      '{hora_cancelamento}', coalesce(to_char(
        (coalesce(c.first_sent_at, v_tz) + make_interval(hours => m.interval_hours * m.attempts)) at time zone 'America/Sao_Paulo',
        'HH24:MI'), ''))
  from reservado r
  join public.appointment_confirmations c on c.id = r.id
  join public.appointments a on a.id = c.appointment_id
  join public.patients pa on pa.id = a.patient_id
  left join public.procedures pr on pr.id = a.procedure_id
  join public.profiles prof on prof.id = a.professional_id
  join public.confirmation_settings s on s.tenant_id = c.tenant_id
  join public.automated_messages m on m.tenant_id = c.tenant_id and m.kind = 'confirmacao';
end;
$$;

-- ── O retoque ───────────────────────────────────────────────────────────────

create function public.retoque_proximas_acoes(
  p_limite int default 5,
  p_agora  timestamp default null
)
returns table (
  confirmacao_id         uuid,
  tenant_id              uuid,
  appointment_id         uuid,
  acao                   text,
  tentativa              int,
  conversation_id        uuid,
  primeiro_envio_em      timestamptz,
  cliente_nome           text,
  cliente_telefone       text,
  procedimento           text,
  profissional           text,
  data                   date,
  hora                   text,
  tenant_integration_id  text,
  agent_slug             text,
  livia_agent_id         uuid,
  livia_channel_id       uuid,
  texto                  text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_agora  timestamp   := coalesce(p_agora, public.app_local_now());
  v_tz     timestamptz := v_agora at time zone 'America/Sao_Paulo';
  -- Retoque sai do horário configurado até as 20:00 do dia; fora disso, espera.
  v_janela boolean;
begin
  -- 1. Quem completa N dias HOJE ganha o ciclo (só o dia N: sem enxurrada ao ligar).
  insert into public.appointment_confirmations (tenant_id, appointment_id, for_date, for_time, kind)
  select a.tenant_id, a.id, a.appointment_date, a.appointment_time, 'retoque'
    from public.automated_messages m
    join public.confirmation_settings s on s.tenant_id = m.tenant_id
    cross join lateral jsonb_array_elements(m.procedure_pairs) par
    join public.appointments a
      on a.tenant_id = m.tenant_id
     and a.procedure_id = (par ->> 'gatilho')::uuid
     and a.status = 'completed'
     and a.appointment_date = v_agora::date - m.days_after
   where m.kind = 'retoque' and m.enabled
     and v_agora::time >= m.send_time and v_agora::time < time '20:00'
  on conflict (kind, appointment_id, for_date, for_time) do nothing;

  -- 2. O que está vencido: tentativa n no dia N + intervalo × (n − 1).
  return query
  with alvo as (
    select c.id, x.acao, c.sent_count + 1 as tentativa
      from public.appointment_confirmations c
      join public.appointments a on a.id = c.appointment_id
      join public.automated_messages m on m.tenant_id = c.tenant_id and m.kind = 'retoque'
      cross join lateral (
        select case
          when not m.enabled or a.status <> 'completed' then null
          when not (v_agora::time >= m.send_time and v_agora::time < time '20:00') then null
          -- Já marcou o retoque do par depois do procedimento (inclusive por telefone).
          when exists (
            select 1
              from jsonb_array_elements(m.procedure_pairs) par
              join public.appointments r
                on r.patient_id = a.patient_id
               and r.procedure_id = (par ->> 'retoque')::uuid
               and r.status <> 'cancelled'
               and r.appointment_date > c.for_date
             where (par ->> 'gatilho')::uuid = a.procedure_id) then null
          when c.sent_count = 0 and v_agora::date >= c.for_date + m.days_after then 'primeiro'
          when c.sent_count between 1 and m.attempts - 1
            and v_agora::date >= c.for_date + m.days_after + m.interval_days * c.sent_count then 'lembrete'
        end as acao
      ) x
     where c.kind = 'retoque'
       and x.acao is not null
       and c.gave_up_at is null
       and c.replied_at is null
       and (c.processing_until is null or c.processing_until <= v_tz)
       and (c.retry_after is null or c.retry_after <= v_tz)
       and exists (select 1 from public.confirmation_settings s where s.tenant_id = c.tenant_id)
     order by c.for_date, c.for_time
     limit greatest(p_limite, 0)
       for update of c skip locked
  ),
  reservado as (
    update public.appointment_confirmations c
       set processing_until = v_tz + interval '5 minutes',
           updated_at = now()
      from alvo
     where c.id = alvo.id
    returning c.id, alvo.acao, alvo.tentativa
  )
  select
    c.id, c.tenant_id, c.appointment_id, r.acao, r.tentativa,
    c.conversation_id, c.first_sent_at,
    split_part(btrim(pa.full_name), ' ', 1),
    pa.phone_e164,
    pr.name,
    prof.full_name,
    c.for_date,
    to_char(c.for_time, 'HH24:MI'),
    s.tenant_integration_id, s.agent_slug, s.livia_agent_id, s.livia_channel_id,
    replace(replace(replace(replace(
      m.texts ->> (r.tentativa - 1),
      '{nome}', split_part(btrim(pa.full_name), ' ', 1)),
      '{procedimento}', coalesce(pr.name, 'atendimento')),
      '{profissional}', split_part(btrim(prof.full_name), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(prof.full_name), ' ', 2), ''), '')),
      '{dias}', (v_agora::date - c.for_date)::text)
  from reservado r
  join public.appointment_confirmations c on c.id = r.id
  join public.appointments a on a.id = c.appointment_id
  join public.patients pa on pa.id = a.patient_id
  left join public.procedures pr on pr.id = a.procedure_id
  join public.profiles prof on prof.id = a.professional_id
  join public.confirmation_settings s on s.tenant_id = c.tenant_id
  join public.automated_messages m on m.tenant_id = c.tenant_id and m.kind = 'retoque';
end;
$$;

revoke execute on function public.retoque_proximas_acoes(int, timestamp) from public, anon, authenticated;
grant  execute on function public.retoque_proximas_acoes(int, timestamp) to service_role;
