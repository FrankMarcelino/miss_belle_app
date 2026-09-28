-- ============================================================================
-- Pares do retoque seguros (#12) — achado da revisão de segurança, 28/09
--
-- Qualquer usuária da clínica edita a automação (decisão do Frank), e o banco
-- só conferia que procedure_pairs era uma lista não vazia. Um par malformado
-- ('nao-e-uuid') fazia `(par ->> 'gatilho')::uuid` estourar dentro de
-- retoque_proximas_acoes — que processa TODAS as clínicas numa consulta só — e
-- a rodada inteira da Edge Function caía, confirmações de todo mundo junto.
-- Também passava par apontando para procedimento de outra clínica.
--
-- Três camadas:
--   1. trigger: cada par tem gatilho e retoque que são procedimentos DESTA
--      clínica; no máximo 20 pares. Inválido é recusado ao salvar.
--   2. função: uuid_ou_nulo — elemento malformado que escape é ignorado, não
--      derruba a consulta das outras clínicas.
--   3. Edge Function: falha do retoque não impede as confirmações.
-- ============================================================================

set local lock_timeout = '5s';

-- CASE garante a ordem: o cast só roda quando o texto tem forma de uuid,
-- mesmo que o planejador avalie a condição do join antes do where.
create function public.uuid_ou_nulo(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create function public.automated_messages_valida_pares()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_par       jsonb;
  v_esperados int;
  v_achados   int;
begin
  if new.procedure_pairs is null then
    return new;
  end if;
  if jsonb_typeof(new.procedure_pairs) <> 'array' or jsonb_array_length(new.procedure_pairs) > 20 then
    raise exception 'procedure_pairs: precisa ser uma lista de até 20 pares' using errcode = '22023';
  end if;
  for v_par in select jsonb_array_elements(new.procedure_pairs) loop
    if jsonb_typeof(v_par) <> 'object'
       or public.uuid_ou_nulo(v_par ->> 'gatilho') is null
       or public.uuid_ou_nulo(v_par ->> 'retoque') is null then
      raise exception 'procedure_pairs: cada par precisa de gatilho e retoque' using errcode = '22023';
    end if;
    -- Contado à parte: o IF do PL/pgSQL lê a condição até o 1º `then`, e o de
    -- um CASE dentro dela cortaria a condição no meio.
    v_esperados := case when (v_par ->> 'gatilho') = (v_par ->> 'retoque') then 1 else 2 end;
    select count(*) into v_achados from public.procedures p
     where p.tenant_id = new.tenant_id
       and p.id in (public.uuid_ou_nulo(v_par ->> 'gatilho'), public.uuid_ou_nulo(v_par ->> 'retoque'));
    if v_achados < v_esperados then
      raise exception 'procedure_pairs: procedimento não é desta clínica' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

-- Depois do trg_auto_tenant_id (ordem alfabética dos BEFORE): o tenant já está preenchido.
create trigger trg_valida_pares before insert or update of procedure_pairs, tenant_id on public.automated_messages
  for each row execute function public.automated_messages_valida_pares();

-- retoque_proximas_acoes com os casts seguros (resto igual à 20260929140000).
create or replace function public.retoque_proximas_acoes(
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
     and a.procedure_id = public.uuid_ou_nulo(par ->> 'gatilho')
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
               and r.procedure_id = public.uuid_ou_nulo(par ->> 'retoque')
               and r.status <> 'cancelled'
               and r.appointment_date > c.for_date
             where public.uuid_ou_nulo(par ->> 'gatilho') = a.procedure_id) then null
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
