-- ============================================================================
-- POST /v1/appointments/{id}/confirm (#8)
--
-- A cliente responde à mensagem de confirmação de 24 h e a IA confirma:
-- `scheduled` vira `confirmed`. Com o #7, o agendamento da IA com mais de 30 h
-- nasce `scheduled` e só vira `confirmed` por aqui.
-- ============================================================================

set local lock_timeout = '5s';

-- Quando a cliente confirmou. Nulo = não confirmou por este caminho (inclui os
-- que já nasceram `confirmed`, com 30 h ou menos, e os confirmados no app).
-- Coluna nula sem default: só catálogo, não reescreve a tabela.
alter table public.appointments add column confirmed_at timestamptz;

create function public.api_confirm_appointment(
  p_tenant_id       uuid,
  p_appointment_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt  public.appointments%rowtype;
  v_now   timestamp := public.app_local_now();
begin
  -- FOR UPDATE: o cancelamento por falta de confirmação (cron do #8) mexe na
  -- mesma linha. Quem chegar depois espera e relê o status — nunca um
  -- confirmado é sobrescrito por um cancelado, nem o contrário.
  select * into v_appt
  from public.appointments a
  where a.id = p_appointment_id and a.tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'http', 404, 'code', 'APPOINTMENT_NOT_FOUND',
      'message', 'Agendamento não encontrado.');
  end if;

  -- Confirmar o que já está confirmado é o mesmo resultado: o bot pode repetir.
  if v_appt.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'http', 200, 'body', jsonb_build_object(
      'id', v_appt.id, 'status', 'CONFIRMED',
      'confirmedAt', to_char(coalesce(v_appt.confirmed_at, v_appt.updated_at, now()) at time zone 'America/Sao_Paulo',
                             'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
  end if;

  if v_appt.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'APPOINTMENT_NOT_ACTIVE',
      'message', 'Este agendamento não está mais ativo.');
  end if;

  if v_appt.appointment_date + v_appt.appointment_time <= v_now then
    return jsonb_build_object('ok', false, 'http', 422, 'code', 'APPOINTMENT_ALREADY_STARTED',
      'message', 'O horário deste agendamento já passou.');
  end if;

  update public.appointments
     set status = 'confirmed',
         confirmed_at = now()
   where id = p_appointment_id;

  return jsonb_build_object('ok', true, 'http', 200, 'body', jsonb_build_object(
    'id', p_appointment_id, 'status', 'CONFIRMED',
    'confirmedAt', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'));
end;
$$;

revoke execute on function public.api_confirm_appointment(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.api_confirm_appointment(uuid, uuid) to service_role;
