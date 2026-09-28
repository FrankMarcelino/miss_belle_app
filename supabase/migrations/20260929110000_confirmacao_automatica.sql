-- ============================================================================
-- Confirmação automática 24 h antes (#8)
--
-- 09:00 do dia anterior sai o 1º aviso; sem resposta em 4 h, o 2º; sem resposta
-- em mais 4 h, o agendamento é cancelado e a cliente é avisada. Qualquer
-- resposta dela suspende tudo (quem pergunta à LIVIA é a Edge Function
-- `confirmacoes`). A mensagem passa pelo Agent Builder, que a grava no
-- histórico do agente e pede ao gateway da LIVIA para enviar.
--
-- DUAS CHAVES
--   profiles.confirmation_enabled   por profissional, nasce DESLIGADA: a
--                                   confirmação cancela horário de cliente, então
--                                   entrar é decisão explícita (fail-closed).
--   profiles.confirmation_starts_on sem data, nada sai. É o que impede o
--                                   primeiro dia ligado de pegar agendamentos
--                                   antigos de surpresa.
--
-- O CICLO PERTENCE A UMA DATA E HORA
--   A linha de `appointment_confirmations` guarda para qual data/hora ela vale.
--   Remarcou depois do 1º aviso → a linha antiga deixa de casar e não cancela o
--   horário novo (que ganha ciclo próprio, se ainda couber na janela).
--
-- RESERVA, NÃO LOCK
--   Entre escolher o item e registrar o resultado há uma chamada HTTP ao AB — e
--   cada RPC é uma transação. Um FOR UPDATE não atravessa isso; a reserva
--   (`processing_until`, 5 min) atravessa, e o SKIP LOCKED na escolha impede
--   duas execuções simultâneas de pegarem o mesmo item.
--
-- O RELÓGIO É INJETÁVEL
--   `p_agora` (horário de Brasília, sem fuso) existe para os testes. Em
--   produção vem nulo e vale `app_local_now()`.
-- ============================================================================

set local lock_timeout = '5s';

alter table public.profiles
  add column confirmation_enabled boolean not null default false,
  add column confirmation_starts_on date;

comment on column public.profiles.confirmation_enabled is
  'Confirmação automática 24 h antes (#8) para os agendamentos desta profissional. Padrão desligado.';
comment on column public.profiles.confirmation_starts_on is
  'Só agendamentos a partir desta data recebem confirmação. Sem data, nada sai.';

-- ── Configuração por clínica: a ponte com a LIVIA e os textos ───────────────

create table public.confirmation_settings (
  tenant_id              uuid primary key references public.tenants(id) on delete cascade,
  tenant_integration_id  text not null,  -- tenants.agent_builder_integration_id na LIVIA
  agent_slug             text not null,  -- agente do AB que conduz a conversa
  livia_agent_id         uuid not null,  -- agents.id na LIVIA (vira o ai_agent_id da conversa)
  livia_channel_id       uuid not null,  -- canal de WhatsApp da LIVIA que envia
  texto_primeiro         text not null default
    'Oi, {nome}! 😊 Aqui é da Miss Belle. Passando para confirmar seu {procedimento} amanhã, {dia}, às {hora}, com a {profissional}. Você confirma? Se precisar, posso remarcar.',
  texto_segundo          text not null default
    'Oi, {nome}! Ainda não recebemos sua confirmação para amanhã às {hora}. Pode confirmar pra gente? Sem confirmação, o horário é liberado hoje às {hora_cancelamento}.',
  texto_cancelamento     text not null default
    'Oi, {nome}. Como não recebemos a confirmação, o seu horário de amanhã às {hora} foi liberado. Se quiser marcar de novo, é só me chamar aqui 😊',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.confirmation_settings is
  'Confirmação automática (#8): como falar com a LIVIA/AB por clínica, e os textos. Sem linha, a clínica não confirma.';

alter table public.confirmation_settings enable row level security;

-- ── Uma linha por ciclo de confirmação ──────────────────────────────────────

create table public.appointment_confirmations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  appointment_id         uuid not null references public.appointments(id) on delete cascade,
  for_date               date not null,
  for_time               time not null,
  conversation_id        uuid,                -- conversa da LIVIA aberta no 1º aviso
  first_sent_at          timestamptz,
  second_sent_at         timestamptz,
  replied_at             timestamptz,
  cancelled_at           timestamptz,
  cancel_notice_sent_at  timestamptz,
  gave_up_at             timestamptz,
  attempts               smallint not null default 0,
  last_error             text,
  retry_after            timestamptz,
  processing_until       timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (appointment_id, for_date, for_time)
);

comment on table public.appointment_confirmations is
  'Ciclo da confirmação 24 h (#8): 1º aviso, 2º aviso, cancelamento, aviso de cancelamento. Vale para UMA data/hora do agendamento.';

alter table public.appointment_confirmations enable row level security;

-- ── O que está vencido agora ────────────────────────────────────────────────

create function public.confirmacao_proximas_acoes(
  p_limite int default 5,
  p_agora  timestamp default null
)
returns table (
  confirmacao_id         uuid,
  tenant_id              uuid,
  appointment_id         uuid,
  acao                   text,
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
-- As colunas do RETURNS TABLE viram variáveis com os mesmos nomes das colunas
-- das tabelas (appointment_id, tenant_id…): na dúvida, é a coluna.
#variable_conflict use_column
declare
  v_agora  timestamp   := coalesce(p_agora, public.app_local_now());
  v_tz     timestamptz := v_agora at time zone 'America/Sao_Paulo';
begin
  -- 1. Quem entrou na janela do 1º aviso ganha o seu ciclo.
  if v_agora::time >= time '09:00' and v_agora::time < time '13:00' then
    insert into public.appointment_confirmations (tenant_id, appointment_id, for_date, for_time)
    select a.tenant_id, a.id, a.appointment_date, a.appointment_time
      from public.appointments a
      join public.profiles p on p.id = a.professional_id
      join public.confirmation_settings s on s.tenant_id = a.tenant_id
     where a.status = 'scheduled'
       and a.appointment_date = v_agora::date + 1
       and p.confirmation_enabled
       and p.confirmation_starts_on is not null
       and a.appointment_date >= p.confirmation_starts_on
    on conflict (appointment_id, for_date, for_time) do nothing;
  end if;

  -- 2. Escolhe a ação de cada ciclo, reserva e devolve com o texto montado.
  return query
  with alvo as (
    select c.id, x.acao
      from public.appointment_confirmations c
      join public.appointments a on a.id = c.appointment_id
      join public.profiles p on p.id = a.professional_id
      cross join lateral (
        select case
          -- Cancelado por nós e a cliente ainda não sabe: avisar vale mesmo que a
          -- profissional tenha desligado a chave depois.
          when c.cancelled_at is not null and c.cancel_notice_sent_at is null then 'aviso_cancelamento'
          when c.cancelled_at is not null then null
          -- Daqui para baixo o agendamento tem de ser AINDA o mesmo, e ainda agendado.
          when a.status <> 'scheduled'
            or a.appointment_date <> c.for_date or a.appointment_time <> c.for_time
            or not p.confirmation_enabled or p.confirmation_starts_on is null
            or a.appointment_date < p.confirmation_starts_on then null
          when c.first_sent_at is null
            and v_agora::time >= time '09:00' and v_agora::time < time '13:00'
            and c.for_date = v_agora::date + 1 then 'primeiro'
          when c.first_sent_at is not null and c.second_sent_at is null
            and c.first_sent_at <= v_tz - interval '4 hours' then 'segundo'
          when c.second_sent_at is not null
            and c.first_sent_at <= v_tz - interval '8 hours'
            and (c.for_date + c.for_time) > v_agora then 'cancelar'
        end as acao
      ) x
     where x.acao is not null
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
    returning c.id, alvo.acao
  )
  select
    c.id, c.tenant_id, c.appointment_id, r.acao, c.conversation_id, c.first_sent_at,
    split_part(btrim(pa.full_name), ' ', 1),
    pa.phone_e164,
    pr.name,
    prof.full_name,
    c.for_date,
    to_char(c.for_time, 'HH24:MI'),
    s.tenant_integration_id, s.agent_slug, s.livia_agent_id, s.livia_channel_id,
    replace(replace(replace(replace(replace(replace(
      case r.acao
        when 'primeiro' then s.texto_primeiro
        when 'segundo' then s.texto_segundo
        when 'aviso_cancelamento' then s.texto_cancelamento
        else ''
      end,
      '{nome}', split_part(btrim(pa.full_name), ' ', 1)),
      '{procedimento}', coalesce(pr.name, 'atendimento')),
      '{dia}', (array['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
                 [extract(dow from c.for_date)::int + 1] || ', ' || to_char(c.for_date, 'DD/MM')),
      '{hora}', to_char(c.for_time, 'HH24:MI')),
      '{profissional}', split_part(btrim(prof.full_name), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(prof.full_name), ' ', 2), ''), '')),
      '{hora_cancelamento}', coalesce(to_char((c.first_sent_at + interval '8 hours') at time zone 'America/Sao_Paulo', 'HH24:MI'), ''))
  from reservado r
  join public.appointment_confirmations c on c.id = r.id
  join public.appointments a on a.id = c.appointment_id
  join public.patients pa on pa.id = a.patient_id
  left join public.procedures pr on pr.id = a.procedure_id
  join public.profiles prof on prof.id = a.professional_id
  join public.confirmation_settings s on s.tenant_id = c.tenant_id;
end;
$$;

-- ── Registrar o que aconteceu ───────────────────────────────────────────────

create function public.confirmacao_registrar(
  p_confirmacao_id  uuid,
  p_acao            text,
  p_resultado       text,
  p_conversation_id uuid default null,
  p_erro            text default null,
  p_agora           timestamp default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz timestamptz := coalesce(p_agora, public.app_local_now()) at time zone 'America/Sao_Paulo';
begin
  if p_acao not in ('primeiro', 'segundo', 'cancelar', 'aviso_cancelamento') then
    raise exception 'ação desconhecida: %', p_acao using errcode = '22023';
  end if;

  case p_resultado
    when 'enviado' then
      update public.appointment_confirmations set
        first_sent_at         = case when p_acao = 'primeiro' then v_tz else first_sent_at end,
        second_sent_at        = case when p_acao = 'segundo' then v_tz else second_sent_at end,
        cancel_notice_sent_at = case when p_acao = 'aviso_cancelamento' then v_tz else cancel_notice_sent_at end,
        conversation_id       = coalesce(p_conversation_id, conversation_id),
        processing_until = null, retry_after = null, last_error = null, updated_at = now()
      where id = p_confirmacao_id;

    when 'respondeu' then
      update public.appointment_confirmations set
        replied_at = v_tz, processing_until = null, updated_at = now()
      where id = p_confirmacao_id;

    -- Transitório: tenta de novo em 15 min; na 5ª tentativa, desiste.
    when 'erro' then
      update public.appointment_confirmations set
        attempts = attempts + 1,
        last_error = p_erro,
        retry_after = v_tz + interval '15 minutes',
        gave_up_at = case when attempts + 1 >= 5 then v_tz else gave_up_at end,
        processing_until = null, updated_at = now()
      where id = p_confirmacao_id;

    -- Permanente (número sem WhatsApp, contato silenciado…): para o ciclo. Quem
    -- nunca foi avisada nunca é cancelada.
    when 'desistiu' then
      update public.appointment_confirmations set
        gave_up_at = v_tz, last_error = p_erro, processing_until = null, updated_at = now()
      where id = p_confirmacao_id;

    else
      raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end case;
end;
$$;

-- ── Cancelar por falta de confirmação ───────────────────────────────────────

create function public.confirmacao_cancelar_agendamento(
  p_confirmacao_id uuid,
  p_agora          timestamp default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz    timestamptz := coalesce(p_agora, public.app_local_now()) at time zone 'America/Sao_Paulo';
  v_conf  public.appointment_confirmations%rowtype;
  v_appt  public.appointments%rowtype;
  v_motivo text;
begin
  select * into v_conf from public.appointment_confirmations where id = p_confirmacao_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;

  -- FOR UPDATE: a cliente pode estar confirmando neste instante
  -- (api_confirm_appointment trava a mesma linha). Quem chegar depois relê.
  select * into v_appt from public.appointments where id = v_conf.appointment_id for update;

  if v_appt.status <> 'scheduled'
     or v_appt.appointment_date <> v_conf.for_date or v_appt.appointment_time <> v_conf.for_time then
    v_motivo := 'nao_esta_agendado';
  elsif v_appt.payment_status <> 'none' or v_appt.has_payment then
    -- Dinheiro registrado exige decisão humana (estorno ou crédito), como no
    -- cancelamento pela API.
    v_motivo := 'requer_equipe';
  end if;

  if v_motivo is not null then
    update public.appointment_confirmations set
      gave_up_at = v_tz, last_error = v_motivo, processing_until = null, updated_at = now()
    where id = p_confirmacao_id;
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  update public.appointments set
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = 'Cancelado automaticamente: a cliente não respondeu à confirmação'
  where id = v_appt.id;

  update public.appointment_confirmations set
    cancelled_at = v_tz, processing_until = null, updated_at = now()
  where id = p_confirmacao_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.confirmacao_proximas_acoes(int, timestamp) from public, anon, authenticated;
revoke execute on function public.confirmacao_registrar(uuid, text, text, uuid, text, timestamp) from public, anon, authenticated;
revoke execute on function public.confirmacao_cancelar_agendamento(uuid, timestamp) from public, anon, authenticated;
grant  execute on function public.confirmacao_proximas_acoes(int, timestamp) to service_role;
grant  execute on function public.confirmacao_registrar(uuid, text, text, uuid, text, timestamp) to service_role;
grant  execute on function public.confirmacao_cancelar_agendamento(uuid, timestamp) to service_role;
