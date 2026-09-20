-- ============================================================================
-- POST /v1/appointments (fatias 5 e 6)
--
-- Tudo numa transação: idempotência, validação, cliente e inserção. Se a Edge
-- Function fizesse isso em chamadas separadas, uma falha no meio deixaria
-- cliente criada sem agendamento, ou agendamento sem registro de idempotência.
-- ============================================================================

set local lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- Idempotência: retry de rede não pode virar dois agendamentos
-- ----------------------------------------------------------------------------
create table public.api_idempotency (
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  key          text        not null,
  request_hash text        not null,   -- mesma chave com pedido diferente é erro, não resposta trocada
  response     jsonb       not null,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, key)
);

alter table public.api_idempotency enable row level security;  -- sem policy: só service_role

select cron.schedule(
  'api-idempotency-cleanup',
  '17 4 * * *',
  $$delete from public.api_idempotency where created_at < now() - interval '24 hours'$$
);

-- ----------------------------------------------------------------------------
-- Sugestões de horário
--
-- Mesma data primeiro, pelas mais próximas do horário pedido (antes ou depois);
-- depois os dias seguintes em ordem. Para os dias seguintes, "mais próximo" e
-- "cronológico" são a mesma ordem.
-- ----------------------------------------------------------------------------
create function public.api_suggest_slots(
  p_professional_id uuid,
  p_procedure_id    uuid,
  p_requested       timestamp,
  p_limit           integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(slot_date, 'YYYY-MM-DD'), 'time', to_char(slot_time, 'HH24:MI'))), '[]'::jsonb)
  from (
    select s.slot_date, s.slot_time
    from public.get_available_slots(p_professional_id, p_procedure_id, p_requested::date, 14) s
    order by
      case when s.slot_date = p_requested::date then 0 else 1 end,
      abs(extract(epoch from (s.slot_date + s.slot_time) - p_requested))
    limit p_limit
  ) ordenadas;
$$;

-- ----------------------------------------------------------------------------
-- Criação
-- ----------------------------------------------------------------------------
create function public.api_create_appointment(
  p_tenant_id               uuid,
  p_professional_id         uuid,
  p_procedure_id            uuid,
  p_datetime                timestamptz,
  p_client_name             text,
  p_client_phone            text,
  p_notes                   text        default null,
  p_availability_checked_at timestamptz default null,
  p_idempotency_key         text        default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local        timestamp := p_datetime at time zone 'America/Sao_Paulo';
  v_date         date := v_local::date;
  v_time         time := v_local::time;
  v_name         text := btrim(coalesce(p_client_name, ''));
  v_phone        text;
  v_hash         text;
  v_stored       public.api_idempotency%rowtype;
  v_patient      uuid;
  v_patient_name text;
  v_appointment  uuid;
  v_blocked_at   timestamptz;
  v_body         jsonb;
  v_suggest      jsonb;
begin
  v_phone := public.normalize_br_phone(p_client_phone);
  v_hash := md5(concat_ws('|', p_professional_id, p_procedure_id, p_datetime, v_phone, v_name, coalesce(p_notes, '')));

  -- 1. Idempotência antes de qualquer coisa: o retry não deve nem revalidar.
  if p_idempotency_key is not null then
    select * into v_stored
    from public.api_idempotency
    where tenant_id = p_tenant_id and key = p_idempotency_key;

    if found then
      if v_stored.request_hash = v_hash then
        return v_stored.response;
      end if;
      return jsonb_build_object(
        'ok', false, 'http', 422, 'code', 'IDEMPOTENCY_KEY_REUSED',
        'message', 'Esta Idempotency-Key já foi usada com outro pedido.'
      );
    end if;
  end if;

  -- 2. Validação de entrada
  if v_name = '' then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'VALIDATION_ERROR',
      'message', 'Informe o nome do cliente.', 'details', jsonb_build_object('field', 'client.name'));
  end if;

  if v_phone is null then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'VALIDATION_ERROR',
      'message', 'Telefone em formato inválido.', 'details', jsonb_build_object('field', 'client.phone'));
  end if;

  -- 3. Escopo da clínica: id de outra clínica responde igual a id inexistente
  if not exists (select 1 from public.profiles p where p.id = p_professional_id and p.tenant_id = p_tenant_id) then
    return jsonb_build_object('ok', false, 'http', 404, 'code', 'PROFESSIONAL_NOT_FOUND',
      'message', 'Profissional não encontrado.');
  end if;

  if not exists (select 1 from public.procedures pr where pr.id = p_procedure_id and pr.tenant_id = p_tenant_id) then
    return jsonb_build_object('ok', false, 'http', 404, 'code', 'PROCEDURE_NOT_FOUND',
      'message', 'Procedimento não encontrado.');
  end if;

  if not exists (
    select 1 from public.professional_procedures pp
    where pp.professional_id = p_professional_id and pp.procedure_id = p_procedure_id and pp.tenant_id = p_tenant_id
  ) then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'PROCEDURE_NOT_OFFERED',
      'message', 'Esta profissional não realiza este procedimento.');
  end if;

  -- 4. O horário tem que ser um dos que o motor ofereceria: expediente,
  --    exceções, caber inteiro, não ter passado e estar na grade.
  if not exists (
    select 1 from public.get_available_slots(p_professional_id, p_procedure_id, v_date, 1) s
    where s.slot_date = v_date and s.slot_time = v_time
  ) then
    v_suggest := public.api_suggest_slots(p_professional_id, p_procedure_id, v_local);

    -- Ocupado por quem? Só isso distingue "nunca esteve livre" de "tomado no
    -- meio do caminho", e o segundo exige saber quando o bot consultou.
    select a.created_at into v_blocked_at
    from public.appointments a
    where a.professional_id = p_professional_id
      and a.status <> 'cancelled'
      and a.appointment_date between v_date - 1 and v_date + 1
      and a.occupies && public.appointment_window(v_date, v_time,
            (select pr.duration_minutes from public.procedures pr where pr.id = p_procedure_id))
    order by a.created_at
    limit 1;

    if v_blocked_at is not null
       and p_availability_checked_at is not null
       and v_blocked_at > p_availability_checked_at then
      return jsonb_build_object(
        'ok', false, 'http', 409, 'code', 'SLOT_TAKEN_MEANTIME',
        'message', 'Esse horário estava disponível, mas acabou de ser reservado por outro cliente.',
        'details', jsonb_build_object(
          'professionalId', p_professional_id, 'procedureId', p_procedure_id,
          'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
          'wasAvailableUntil', to_char(v_blocked_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
          'suggestedSlots', v_suggest));
    end if;

    return jsonb_build_object(
      'ok', false, 'http', 422, 'code', 'SLOT_NOT_AVAILABLE',
      'message', 'Esse horário não está disponível.',
      'details', jsonb_build_object(
        'professionalId', p_professional_id, 'procedureId', p_procedure_id,
        'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
        'suggestedSlots', v_suggest));
  end if;

  -- 5. Cliente: o cadastro manda no nome. Quem digitou foi a profissional;
  --    o bot recebeu o nome do WhatsApp, que costuma ser apelido.
  select p.id, p.full_name into v_patient, v_patient_name
  from public.patients p
  where p.tenant_id = p_tenant_id and p.phone_e164 = v_phone
  order by p.created_at
  limit 1;

  if v_patient is null then
    insert into public.patients (tenant_id, professional_id, full_name, phone)
    values (p_tenant_id, p_professional_id, v_name, v_phone)
    returning id, full_name into v_patient, v_patient_name;
  end if;

  -- 6. Gravação. A constraint de exclusão é a única defesa real contra dois
  --    pedidos simultâneos: entre a checagem acima e este insert há uma janela.
  begin
    insert into public.appointments (
      tenant_id, professional_id, procedure_id, patient_id,
      appointment_date, appointment_time, status, notes
    )
    values (p_tenant_id, p_professional_id, p_procedure_id, v_patient, v_date, v_time, 'confirmed', p_notes)
    returning id into v_appointment;
  exception when exclusion_violation then
    v_suggest := public.api_suggest_slots(p_professional_id, p_procedure_id, v_local);
    return jsonb_build_object(
      'ok', false, 'http', 409, 'code', 'SLOT_TAKEN_MEANTIME',
      'message', 'Esse horário estava disponível, mas acabou de ser reservado por outro cliente.',
      'details', jsonb_build_object(
        'professionalId', p_professional_id, 'procedureId', p_procedure_id,
        'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
        'wasAvailableUntil', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
        'suggestedSlots', v_suggest));
  end;

  v_body := jsonb_build_object(
    'ok', true, 'http', 201,
    'body', jsonb_build_object(
      'id', v_appointment,
      'status', 'CONFIRMED',
      'professionalId', p_professional_id,
      'procedureId', p_procedure_id,
      'dateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
      'client', jsonb_build_object('name', v_patient_name, 'phone', v_phone),
      'notes', p_notes,
      'rescheduleCount', 0));

  if p_idempotency_key is not null then
    insert into public.api_idempotency (tenant_id, key, request_hash, response)
    values (p_tenant_id, p_idempotency_key, v_hash, v_body)
    on conflict (tenant_id, key) do nothing;
  end if;

  return v_body;
end;
$$;

revoke execute on function public.api_suggest_slots(uuid, uuid, timestamp, integer) from public, anon, authenticated;
revoke execute on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text, text, text, timestamptz, text) from public, anon, authenticated;
grant  execute on function public.api_suggest_slots(uuid, uuid, timestamp, integer) to service_role;
grant  execute on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text, text, text, timestamptz, text) to service_role;
