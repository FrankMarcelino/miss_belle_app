-- ============================================================================
-- Mensagens automáticas (#12) — a confirmação da véspera fica configurável
--
-- Até aqui (#8) o horário (09:00–13:00), as tentativas (2), o intervalo (4 h)
-- e os textos eram números fixos no código. Varia de clínica para clínica, e a
-- confirmação ainda NÃO foi ligada em nenhuma (0 ciclos em produção): é o
-- momento barato de tirar do código.
--
-- automated_messages   uma linha por clínica e tipo. Qualquer usuária da
--                      clínica lê e altera (RLS por tenant).
-- confirmation_settings fica só com a ponte LIVIA/AB (integração, não é algo
--                      que a clínica edita): os textos saem dela.
-- appointment_confirmations deixa de ter "1º" e "2º" fixos: conta tentativas.
--
-- Os padrões reproduzem o comportamento da #8: 09:00, 2 tentativas, 4 h,
-- cancelar sem resposta, os mesmos textos. Sem linha para a clínica, nada sai.
-- ============================================================================

set local lock_timeout = '5s';

create table public.automated_messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  kind             text not null check (kind in ('confirmacao')),
  enabled          boolean not null default false,
  -- 06:00–20:00: o cron cobre 06:00–23:59, e horário + intervalo (até 12 h) não
  -- passa da meia-noite — o que quebraria a conta da janela do 1º envio.
  send_time        time not null default '09:00' check (send_time between '06:00' and '20:00'),
  attempts         smallint not null default 2 check (attempts between 1 and 5),
  interval_hours   smallint not null default 4 check (interval_hours between 1 and 12),
  -- 'avisar_equipe' fica para quando houver canal de aviso da agenda à LIVIA (#12).
  on_no_reply      text not null default 'cancelar' check (on_no_reply in ('cancelar', 'nada')),
  texts            jsonb not null default jsonb_build_array(
    'Oi, {nome}! 😊 Aqui é da Miss Belle. Passando para confirmar seu {procedimento} amanhã, {dia}, às {hora}, com a {profissional}. Você confirma? Se precisar, posso remarcar.',
    'Oi, {nome}! Ainda não recebemos sua confirmação para amanhã às {hora}. Pode confirmar pra gente? Sem confirmação, o horário é liberado hoje às {hora_cancelamento}.'),
  cancel_text      text not null default
    'Oi, {nome}. Como não recebemos a confirmação, o seu horário de amanhã às {hora} foi liberado. Se quiser marcar de novo, é só me chamar aqui 😊',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, kind),
  constraint automated_messages_textos_por_tentativa
    check (jsonb_typeof(texts) = 'array' and jsonb_array_length(texts) = attempts)
);

comment on table public.automated_messages is
  'Mensagens automáticas por clínica (#12): quando sai, quantas vezes, o que fazer sem resposta e os textos.';

create trigger trg_auto_tenant_id before insert on public.automated_messages
  for each row execute function public.auto_set_tenant_id();

alter table public.automated_messages enable row level security;

-- Qualquer usuária da clínica (decisão do Frank, 28/09). Sem DELETE: desligar
-- é `enabled = false`, e o histórico de configuração não some.
create policy "Clínica lê as mensagens automáticas" on public.automated_messages
  for select to authenticated using (tenant_id = (select public.auth_tenant_id()));
create policy "Clínica cria as mensagens automáticas" on public.automated_messages
  for insert to authenticated with check (tenant_id = (select public.auth_tenant_id()));
create policy "Clínica altera as mensagens automáticas" on public.automated_messages
  for update to authenticated
  using (tenant_id = (select public.auth_tenant_id()))
  with check (tenant_id = (select public.auth_tenant_id()));

-- ── Os textos saem da integração ────────────────────────────────────────────

alter table public.confirmation_settings
  drop column texto_primeiro,
  drop column texto_segundo,
  drop column texto_cancelamento;

-- ── O ciclo conta tentativas ────────────────────────────────────────────────

alter table public.appointment_confirmations
  add column sent_count smallint not null default 0,
  add column last_sent_at timestamptz,
  drop column second_sent_at;

-- ── O que está vencido agora (lendo a configuração) ─────────────────────────

drop function public.confirmacao_proximas_acoes(int, timestamp);

create function public.confirmacao_proximas_acoes(
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
-- As colunas do RETURNS TABLE viram variáveis com os mesmos nomes das colunas
-- das tabelas (appointment_id, tenant_id…): na dúvida, é a coluna.
#variable_conflict use_column
declare
  v_agora  timestamp   := coalesce(p_agora, public.app_local_now());
  v_tz     timestamptz := v_agora at time zone 'America/Sao_Paulo';
begin
  -- 1. Quem entrou na janela do 1º aviso da SUA clínica ganha o ciclo. A
  --    janela vai do horário configurado até horário + intervalo.
  insert into public.appointment_confirmations (tenant_id, appointment_id, for_date, for_time)
  select a.tenant_id, a.id, a.appointment_date, a.appointment_time
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
  on conflict (appointment_id, for_date, for_time) do nothing;

  -- 2. Escolhe a ação de cada ciclo, reserva e devolve com o texto montado.
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
            -- Cancelado por nós e a cliente ainda não sabe: avisar vale mesmo
            -- que a automação tenha sido desligada depois.
            when c.cancelled_at is not null and c.cancel_notice_sent_at is null then 'aviso_cancelamento'
            when c.cancelled_at is not null then null
            when not m.enabled then null
            -- Daqui para baixo o agendamento tem de ser AINDA o mesmo, e ainda agendado.
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
      -- Hora em que o horário será liberado: 1º envio + intervalo × tentativas.
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

-- ── Registrar o que aconteceu (conta tentativas) ────────────────────────────

drop function public.confirmacao_registrar(uuid, text, text, uuid, text, timestamp);

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
  if p_acao not in ('primeiro', 'lembrete', 'cancelar', 'aviso_cancelamento') then
    raise exception 'ação desconhecida: %', p_acao using errcode = '22023';
  end if;

  case p_resultado
    when 'enviado' then
      update public.appointment_confirmations set
        sent_count            = case when p_acao in ('primeiro', 'lembrete') then sent_count + 1 else sent_count end,
        first_sent_at         = case when p_acao = 'primeiro' then v_tz else first_sent_at end,
        last_sent_at          = case when p_acao in ('primeiro', 'lembrete') then v_tz else last_sent_at end,
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

    -- Permanente: para o ciclo. Quem nunca foi avisada nunca é cancelada.
    when 'desistiu' then
      update public.appointment_confirmations set
        gave_up_at = v_tz, last_error = p_erro, processing_until = null, updated_at = now()
      where id = p_confirmacao_id;

    else
      raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end case;
end;
$$;

revoke execute on function public.confirmacao_proximas_acoes(int, timestamp) from public, anon, authenticated;
revoke execute on function public.confirmacao_registrar(uuid, text, text, uuid, text, timestamp) from public, anon, authenticated;
grant  execute on function public.confirmacao_proximas_acoes(int, timestamp) to service_role;
grant  execute on function public.confirmacao_registrar(uuid, text, text, uuid, text, timestamp) to service_role;

-- ── O cron passa a cobrir a faixa configurável ──────────────────────────────
-- Era 09:00–22:59 (feito para o 09:00 fixo). Com horário configurável a partir
-- de 06:00, uma clínica às 08:00 não receberia nenhuma rodada — em silêncio.
-- 06:00–23:59 de Brasília = 09–23 e 0–2 em UTC.
select cron.schedule('confirmacoes', '*/15 0,1,2,9-23 * * *', 'select public.confirmacoes_disparar()');
