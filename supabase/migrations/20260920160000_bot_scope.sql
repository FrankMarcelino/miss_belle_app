-- ============================================================================
-- Recorte do assistente (bot_enabled / bot_bookable)
--
-- Duas chaves com padrões OPOSTOS, e a razão de cada um:
--
--   profiles.bot_enabled    false. A profissional só entra no assistente quando
--                           alguém disser que sim — o expediente dela pode
--                           estar no padrão de 24h, e o bot ofereceria 03:00.
--   procedures.bot_bookable true. Serviço existe para ser oferecido; a exceção
--                           (curso de 8 horas) sai por decisão explícita.
--
-- Serviço não agendável CONTINUA na listagem: o agente precisa saber dele para
-- responder a cliente, e transfere quando ela quiser marcar.
-- ============================================================================

set local lock_timeout = '5s';

alter table public.profiles
  add column bot_enabled boolean not null default false;

alter table public.procedures
  add column bot_bookable boolean not null default true;

comment on column public.profiles.bot_enabled is
  'A profissional atende pelo assistente (API pública). Padrão desligado: entrar é decisão explícita.';
comment on column public.procedures.bot_bookable is
  'O assistente pode AGENDAR este serviço. Desligado, ele ainda aparece na listagem para o agente falar sobre ele.';

create or replace function public.api_create_appointment(
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
    delete from public.api_idempotency
     where tenant_id = p_tenant_id
       and created_at < now() - interval '24 hours';

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
  -- bot_enabled junto com o escopo do tenant, e não como erro separado: para
  -- quem chama, profissional fora do assistente e profissional inexistente são
  -- a mesma coisa — não há nada a fazer com esse id.
  if not exists (
    select 1 from public.profiles p
    where p.id = p_professional_id and p.tenant_id = p_tenant_id and p.bot_enabled
  ) then
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

  -- Serviço que existe e o assistente não agenda (um curso de 8h, por exemplo).
  -- Continua aparecendo na listagem para o agente conversar sobre ele; aqui é
  -- onde ele para, e o código próprio é o sinal para transferir ao humano.
  if not exists (
    select 1 from public.procedures pr
    where pr.id = p_procedure_id and pr.bot_bookable
  ) then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'PROCEDURE_NOT_BOOKABLE',
      'message', 'Este serviço não é agendado pelo assistente.');
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
