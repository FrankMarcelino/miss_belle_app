import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from './auth.ts';
import { apiError, fromRpc, json, STATUS_FROM_API, STATUS_TO_API, stampToIso, toIso } from './format.ts';
import { dateOnly, days as parseDays, isoWithOffset, nonEmpty, optionalIsoWithOffset, uuid, ValidationError } from './validate.ts';

/**
 * API pública de agendamento v1 (doc/api/agendamento-v1.md).
 *
 * A função é fina de propósito: autentica a chave, valida entrada, chama um
 * RPC por operação e traduz para HTTP. A regra de negócio vive no banco, onde
 * cada operação é uma transação só.
 *
 * ATENÇÃO: service_role ignora a RLS e o portão de tenant do motor. Toda
 * consulta aqui filtra por tenant_id explicitamente — é a regra número um.
 */

const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Profissional fora do assistente (`bot_enabled = false`) responde como
 * inexistente: para quem chama, não há nada a fazer com esse id.
 */
async function professionalOf(tenantId: string, id: string) {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('bot_enabled', true)
    .maybeSingle();
  return data;
}

async function procedureOf(tenantId: string, id: string) {
  const { data } = await admin
    .from('procedures')
    .select('id, name, duration_minutes, bot_bookable')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function offers(tenantId: string, professionalId: string, procedureId: string) {
  const { data } = await admin
    .from('professional_procedures')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('professional_id', professionalId)
    .eq('procedure_id', procedureId)
    .maybeSingle();
  return Boolean(data);
}

async function listProfessionals(tenantId: string, url: URL): Promise<Response> {
  const onlyAvailable = (url.searchParams.get('available') ?? 'true') !== 'false';

  let query = admin
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('tenant_id', tenantId)
    .eq('bot_enabled', true)
    .order('full_name');
  if (onlyAvailable) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível listar profissionais.');

  return json({
    data: (data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      avatarUrl: null,
      specialty: null,
      available: p.is_active ?? false,
    })),
  });
}

async function listProcedures(tenantId: string, professionalId: string): Promise<Response> {
  if (!(await professionalOf(tenantId, professionalId))) {
    return apiError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
  }

  const { data, error } = await admin
    .from('professional_procedures')
    .select('procedures:procedure_id (id, name, description, synonyms, duration_minutes, default_price, is_variable_price, is_active, bot_bookable)')
    .eq('tenant_id', tenantId)
    .eq('professional_id', professionalId);
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível listar procedimentos.');

  const procedures = (data ?? [])
    .map((row) => (Array.isArray(row.procedures) ? row.procedures[0] : row.procedures))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p.is_active !== false)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return json({
    data: procedures.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      synonyms: p.synonyms ?? [],
      durationMinutes: p.duration_minutes,
      price: Number(p.default_price),
      variablePrice: Boolean(p.is_variable_price),
      // false: o agente fala sobre o serviço, mas não marca — transfere.
      bookable: p.bot_bookable !== false,
    })),
  });
}

async function availability(tenantId: string, professionalId: string, url: URL): Promise<Response> {
  const procedureId = uuid(url.searchParams.get('procedureId'), 'procedureId');
  const days = parseDays(url.searchParams.get('days'));
  if (days > 60) {
    return apiError(400, 'MAX_RANGE_EXCEEDED', 'A janela de consulta não pode passar de 60 dias.', { maxDays: 60 });
  }

  const startParam = url.searchParams.get('startDate');
  const startDate = startParam
    ? dateOnly(startParam, 'startDate')
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  if (!(await professionalOf(tenantId, professionalId))) {
    return apiError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
  }
  const procedure = await procedureOf(tenantId, procedureId);
  if (!procedure) {
    return apiError(404, 'PROCEDURE_NOT_FOUND', 'Procedimento não encontrado.');
  }
  if (!(await offers(tenantId, professionalId, procedureId))) {
    return apiError(422, 'PROCEDURE_NOT_OFFERED', 'Esta profissional não realiza este procedimento.');
  }
  if (procedure.bot_bookable === false) {
    return apiError(422, 'PROCEDURE_NOT_BOOKABLE', 'Este serviço não é agendado pelo assistente.');
  }

  const { data, error } = await admin.rpc('get_available_slots', {
    p_professional_id: professionalId,
    p_procedure_id: procedureId,
    p_start_date: startDate,
    p_days: days,
  });
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível calcular os horários.');

  const byDate = new Map<string, string[]>();
  for (let i = 0; i < days; i++) {
    const d = new Date(`${startDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    byDate.set(d.toISOString().slice(0, 10), []);
  }
  for (const slot of (data ?? []) as { slot_date: string; slot_time: string }[]) {
    byDate.get(slot.slot_date)?.push(slot.slot_time.slice(0, 5));
  }

  return json({ data: [...byDate.entries()].map(([date, slots]) => ({ date, slots })) });
}

async function createAppointment(tenantId: string, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const client = (body.client ?? {}) as Record<string, unknown>;

  const { data, error } = await admin.rpc('api_create_appointment', {
    p_tenant_id: tenantId,
    p_professional_id: uuid(body.professionalId, 'professionalId'),
    p_procedure_id: uuid(body.procedureId, 'procedureId'),
    p_datetime: isoWithOffset(body.dateTime, 'dateTime'),
    p_client_name: nonEmpty(client.name, 'client.name'),
    p_client_phone: nonEmpty(client.phone, 'client.phone'),
    p_notes: typeof body.notes === 'string' ? body.notes : null,
    p_availability_checked_at: optionalIsoWithOffset(body.availabilityCheckedAt, 'availabilityCheckedAt'),
    p_idempotency_key: req.headers.get('Idempotency-Key'),
  });
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível criar o agendamento.');

  return fromRpc(data);
}

async function cancelAppointment(tenantId: string, id: string, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));

  const { data, error } = await admin.rpc('api_cancel_appointment', {
    p_tenant_id: tenantId,
    p_appointment_id: id,
    p_reason: typeof body?.reason === 'string' ? body.reason : null,
  });
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível cancelar o agendamento.');

  return fromRpc(data);
}

async function rescheduleAppointment(tenantId: string, id: string, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));

  const { data, error } = await admin.rpc('api_reschedule_appointment', {
    p_tenant_id: tenantId,
    p_appointment_id: id,
    p_datetime: isoWithOffset(body.dateTime, 'dateTime'),
    p_availability_checked_at: optionalIsoWithOffset(body.availabilityCheckedAt, 'availabilityCheckedAt'),
  });
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível remarcar o agendamento.');

  return fromRpc(data);
}

async function listAppointments(tenantId: string, url: URL): Promise<Response> {
  const phone = nonEmpty(url.searchParams.get('phone'), 'phone');
  const from = optionalIsoWithOffset(url.searchParams.get('from'), 'from') ?? new Date().toISOString();

  const statuses = (url.searchParams.get('status') ?? 'SCHEDULED,CONFIRMED')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const unknown = statuses.find((s) => !(s in STATUS_FROM_API));
  if (unknown) {
    throw new ValidationError('status', `status inválido: ${unknown}.`);
  }

  const { data: normalized } = await admin.rpc('normalize_br_phone', { p_phone: phone });
  if (!normalized) return json({ data: [] });

  const fromDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(from));

  const { data, error } = await admin
    .from('appointments')
    .select(`
      id, status, appointment_date, appointment_time, professional_id, procedure_id,
      patients!inner (full_name, phone_e164),
      procedures (name),
      profiles!appointments_professional_id_fkey (full_name)
    `)
    .eq('tenant_id', tenantId)
    .eq('patients.phone_e164', normalized)
    .in('status', statuses.map((s) => STATUS_FROM_API[s]))
    .gte('appointment_date', fromDate)
    .order('appointment_date')
    .order('appointment_time');
  if (error) return apiError(500, 'INTERNAL_ERROR', 'Não foi possível listar os agendamentos.');

  const one = <T>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

  const rows = (data ?? [])
    .map((a) => ({
      id: a.id,
      status: STATUS_TO_API[a.status],
      professionalId: a.professional_id,
      professionalName: one(a.profiles as { full_name: string }[] | { full_name: string } | null)?.full_name ?? '',
      procedureId: a.procedure_id,
      procedureName: one(a.procedures as { name: string }[] | { name: string } | null)?.name ?? '',
      dateTime: toIso(a.appointment_date, a.appointment_time),
      client: {
        name: one(a.patients as { full_name: string; phone_e164: string }[] | { full_name: string; phone_e164: string } | null)?.full_name ?? '',
        phone: normalized as string,
      },
    }))
    // O filtro por data é por dia; aqui refina pela hora do primeiro dia.
    .filter((a) => new Date(a.dateTime) >= new Date(from));

  return json({ data: rows });
}

serve(async (req) => {
  const url = new URL(req.url);
  // /functions/v1/api/v1/<recurso> → [<recurso>, ...]
  const path = url.pathname.replace(/^.*?\/api\/v1\/?/, '').split('/').filter(Boolean);

  try {
    const tenantId = await authenticate(req, admin);
    if (!tenantId) {
      return apiError(401, 'UNAUTHORIZED', 'Chave de API ausente ou inválida.');
    }

    if (path[0] === 'professionals') {
      if (req.method === 'GET' && path.length === 1) return await listProfessionals(tenantId, url);
      if (req.method === 'GET' && path.length === 3 && path[2] === 'procedures') {
        return await listProcedures(tenantId, uuid(path[1], 'professionalId'));
      }
      if (req.method === 'GET' && path.length === 3 && path[2] === 'availability') {
        return await availability(tenantId, uuid(path[1], 'professionalId'), url);
      }
    }

    if (path[0] === 'appointments') {
      if (req.method === 'POST' && path.length === 1) return await createAppointment(tenantId, req);
      if (req.method === 'GET' && path.length === 1) return await listAppointments(tenantId, url);
      if (req.method === 'DELETE' && path.length === 2) return await cancelAppointment(tenantId, uuid(path[1], 'id'), req);
      if (req.method === 'PATCH' && path.length === 2) return await rescheduleAppointment(tenantId, uuid(path[1], 'id'), req);
    }

    return apiError(404, 'NOT_FOUND', 'Rota não encontrada.');
  } catch (err) {
    if (err instanceof ValidationError) {
      return apiError(422, 'VALIDATION_ERROR', err.message, { field: err.field });
    }
    console.error('erro não tratado', err);
    return apiError(500, 'INTERNAL_ERROR', 'Erro interno.');
  }
});
