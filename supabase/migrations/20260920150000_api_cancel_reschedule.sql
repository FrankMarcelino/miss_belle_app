-- ============================================================================
-- DELETE e PATCH /v1/appointments/{id} (fatias 7 e 8)
--
-- As políticas valem só para a cliente se servindo pelo bot. A profissional
-- continua cancelando e remarcando no app sem limite.
-- ============================================================================

set local lock_timeout = '5s';

-- Erro de política, reaproveitado pelos dois RPCs.
create function public.api_policy_error(p_code text, p_message text, p_details jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'http', 422, 'code', p_code, 'message', p_message, 'details', p_details);
$$;

create function public.api_cancel_appointment(
  p_tenant_id       uuid,
  p_appointment_id  uuid,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt     public.appointments%rowtype;
  v_notice   smallint;
  v_start    timestamp;
  v_now      timestamp := public.app_local_now();
begin
  select * into v_appt
  from public.appointments a
  where a.id = p_appointment_id and a.tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'http', 404, 'code', 'APPOINTMENT_NOT_FOUND',
      'message', 'Agendamento não encontrado.');
  end if;

  -- Cancelar o que já está cancelado é o mesmo resultado: o bot pode repetir.
  if v_appt.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'http', 200, 'body', jsonb_build_object(
      'id', v_appt.id, 'status', 'CANCELLED',
      'cancelledAt', to_char(coalesce(v_appt.cancelled_at, v_appt.updated_at, now()) at time zone 'America/Sao_Paulo',
                             'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
  end if;

  if v_appt.status <> 'scheduled' and v_appt.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'APPOINTMENT_NOT_ACTIVE',
      'message', 'Este agendamento não está mais ativo.');
  end if;

  -- Dinheiro registrado exige decisão humana: estornar ou virar crédito
  -- (doc/DM.md, "cancelled + paid → requer ação"). O bot transfere.
  if v_appt.payment_status <> 'none' or v_appt.has_payment then
    return public.api_policy_error('CANCELLATION_REQUIRES_STAFF',
      'Este agendamento tem pagamento registrado; o cancelamento precisa passar pelo atendimento.',
      jsonb_build_object('paymentStatus', upper(v_appt.payment_status)));
  end if;

  select p.min_notice_hours into v_notice from public.profiles p where p.id = v_appt.professional_id;
  v_start := v_appt.appointment_date + v_appt.appointment_time;

  if v_start - make_interval(hours => v_notice) <= v_now then
    return public.api_policy_error('CANCELLATION_NOT_ALLOWED',
      format('Cancelamento não permitido a menos de %sh do horário agendado.', v_notice),
      jsonb_build_object('minNoticeHours', v_notice,
        'appointmentDateTime', to_char(v_start, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
  end if;

  update public.appointments
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = coalesce(p_reason, cancellation_reason)
   where id = p_appointment_id;

  return jsonb_build_object('ok', true, 'http', 200, 'body', jsonb_build_object(
    'id', p_appointment_id, 'status', 'CANCELLED',
    'cancelledAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
end;
$$;

create function public.api_reschedule_appointment(
  p_tenant_id               uuid,
  p_appointment_id          uuid,
  p_datetime                timestamptz,
  p_availability_checked_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt       public.appointments%rowtype;
  v_notice     smallint;
  v_max        smallint;
  v_now        timestamp := public.app_local_now();
  v_local      timestamp := p_datetime at time zone 'America/Sao_Paulo';
  v_date       date := v_local::date;
  v_time       time := v_local::time;
  v_start      timestamp;
  v_suggest    jsonb;
  v_blocked_at timestamptz;
  v_patient    text;
  v_phone      text;
begin
  select * into v_appt
  from public.appointments a
  where a.id = p_appointment_id and a.tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'http', 404, 'code', 'APPOINTMENT_NOT_FOUND',
      'message', 'Agendamento não encontrado.');
  end if;

  if v_appt.status <> 'scheduled' and v_appt.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'APPOINTMENT_NOT_ACTIVE',
      'message', 'Este agendamento não está mais ativo.');
  end if;

  select p.min_notice_hours, p.max_reschedules into v_notice, v_max
  from public.profiles p where p.id = v_appt.professional_id;

  if v_appt.reschedule_count >= v_max then
    return public.api_policy_error('RESCHEDULE_NOT_ALLOWED',
      'Limite de remarcações atingido para este agendamento.',
      jsonb_build_object('maxReschedules', v_max, 'rescheduleCount', v_appt.reschedule_count));
  end if;

  -- Antecedência conta a partir do horário ATUAL: remarcar em cima da hora
  -- abre o mesmo buraco na agenda que cancelar.
  v_start := v_appt.appointment_date + v_appt.appointment_time;
  if v_start - make_interval(hours => v_notice) <= v_now then
    return public.api_policy_error('CANCELLATION_NOT_ALLOWED',
      format('Remarcação não permitida a menos de %sh do horário agendado.', v_notice),
      jsonb_build_object('minNoticeHours', v_notice,
        'appointmentDateTime', to_char(v_start, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
  end if;

  -- O próprio agendamento não pode bloquear o horário novo.
  if not exists (
    select 1 from public.get_available_slots(
      v_appt.professional_id, v_appt.procedure_id, v_date, 1, p_appointment_id) s
    where s.slot_date = v_date and s.slot_time = v_time
  ) then
    v_suggest := public.api_suggest_slots(v_appt.professional_id, v_appt.procedure_id, v_local);

    select a.created_at into v_blocked_at
    from public.appointments a
    where a.professional_id = v_appt.professional_id
      and a.status <> 'cancelled'
      and a.id <> p_appointment_id
      and a.appointment_date between v_date - 1 and v_date + 1
      and a.occupies && public.appointment_window(v_date, v_time, v_appt.duration_minutes)
    order by a.created_at
    limit 1;

    if v_blocked_at is not null and p_availability_checked_at is not null
       and v_blocked_at > p_availability_checked_at then
      return jsonb_build_object('ok', false, 'http', 409, 'code', 'SLOT_TAKEN_MEANTIME',
        'message', 'Esse horário estava disponível, mas acabou de ser reservado por outro cliente.',
        'details', jsonb_build_object(
          'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
          'wasAvailableUntil', to_char(v_blocked_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
          'suggestedSlots', v_suggest));
    end if;

    return jsonb_build_object('ok', false, 'http', 422, 'code', 'SLOT_NOT_AVAILABLE',
      'message', 'Esse horário não está disponível.',
      'details', jsonb_build_object(
        'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
        'suggestedSlots', v_suggest));
  end if;

  begin
    update public.appointments
       set rescheduled_from_date = appointment_date,
           rescheduled_from_time = appointment_time,
           appointment_date = v_date,
           appointment_time = v_time,
           reschedule_count = reschedule_count + 1
     where id = p_appointment_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'http', 409, 'code', 'SLOT_TAKEN_MEANTIME',
      'message', 'Esse horário estava disponível, mas acabou de ser reservado por outro cliente.',
      'details', jsonb_build_object(
        'requestedDateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
        'suggestedSlots', public.api_suggest_slots(v_appt.professional_id, v_appt.procedure_id, v_local)));
  end;

  select pa.full_name, pa.phone_e164 into v_patient, v_phone
  from public.patients pa where pa.id = v_appt.patient_id;

  return jsonb_build_object('ok', true, 'http', 200, 'body', jsonb_build_object(
    'id', p_appointment_id,
    'status', upper(v_appt.status),
    'professionalId', v_appt.professional_id,
    'procedureId', v_appt.procedure_id,
    'dateTime', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
    'client', jsonb_build_object('name', v_patient, 'phone', v_phone),
    'notes', v_appt.notes,
    'rescheduleCount', v_appt.reschedule_count + 1));
end;
$$;

revoke execute on function public.api_policy_error(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.api_cancel_appointment(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.api_reschedule_appointment(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.api_policy_error(text, text, jsonb) to service_role;
grant  execute on function public.api_cancel_appointment(uuid, uuid, text) to service_role;
grant  execute on function public.api_reschedule_appointment(uuid, uuid, timestamptz, timestamptz) to service_role;
