import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fixtures contra o schema REAL (baseline). Cada teste monta a própria clínica,
 * com e-mails únicos, então os testes não enxergam dado uns dos outros.
 */

function must<T>(label: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${label}: sem dados`);
  return res.data;
}

export async function createTenant(db: SupabaseClient, name = 'Clínica Teste'): Promise<string> {
  const row = must(
    'tenant',
    await db.from('tenants').insert({ name, slug: `teste-${randomUUID()}` }).select('id').single(),
  );
  return row.id;
}

export type Professional = { id: string; email: string; password: string };

export async function createProfessional(
  db: SupabaseClient,
  tenantId: string,
  opts: { role?: 'user' | 'super_admin'; slotStep?: 15 | 30 | 60; name?: string } = {},
): Promise<Professional> {
  const email = `prof-${randomUUID()}@teste.local`;
  const password = `senha-${randomUUID()}`;

  // profiles.id é FK para auth.users: a profissional precisa existir no Auth.
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`auth user: ${created.error.message}`);
  const id = created.data.user.id;

  // Nenhum trigger cria o profile sozinho — em produção quem faz isso é o
  // RPC register_user_profile (signup) ou a Edge Function create-user (convite).
  const profile: Record<string, unknown> = {
    id,
    email,
    full_name: opts.name ?? 'Profissional Teste',
    role: opts.role ?? 'user',
    tenant_id: tenantId,
  };
  if (opts.slotStep !== undefined) profile.slot_step_minutes = opts.slotStep;
  must('profile', await db.from('profiles').insert(profile).select('id').single());

  return { id, email, password };
}

export async function createProcedure(db: SupabaseClient, tenantId: string, durationMinutes: number): Promise<string> {
  const row = must(
    'procedure',
    await db
      .from('procedures')
      .insert({ name: `Proc ${durationMinutes}min ${randomUUID()}`, duration_minutes: durationMinutes, default_price: 100, tenant_id: tenantId })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function createPatient(db: SupabaseClient, tenantId: string, professionalId: string): Promise<string> {
  const row = must(
    'patient',
    await db
      .from('patients')
      .insert({ full_name: 'Cliente Teste', phone: '+5588999990000', professional_id: professionalId, tenant_id: tenantId })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function createAppointment(
  db: SupabaseClient,
  a: {
    tenantId: string;
    professionalId: string;
    procedureId: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  },
): Promise<string> {
  const patientId = await createPatient(db, a.tenantId, a.professionalId);
  const row = must(
    'appointment',
    await db
      .from('appointments')
      .insert({
        tenant_id: a.tenantId,
        professional_id: a.professionalId,
        procedure_id: a.procedureId,
        patient_id: patientId,
        appointment_date: a.date,
        appointment_time: a.time,
        status: a.status ?? 'confirmed',
      })
      .select('id')
      .single(),
  );
  return row.id;
}

/** 0 = domingo … 6 = sábado. `endsAt` menor que `startsAt` = vira a meia-noite. */
export async function addShift(
  db: SupabaseClient,
  s: { tenantId: string; professionalId: string; dayOfWeek: number; startsAt: string; endsAt: string },
) {
  return db.from('professional_schedules').insert({
    tenant_id: s.tenantId,
    professional_id: s.professionalId,
    day_of_week: s.dayOfWeek,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
  });
}

export async function addException(
  db: SupabaseClient,
  e: {
    tenantId: string;
    professionalId: string;
    date: string;
    kind: 'block' | 'extra';
    startsAt?: string;
    endsAt?: string;
  },
) {
  return db.from('schedule_exceptions').insert({
    tenant_id: e.tenantId,
    professional_id: e.professionalId,
    exception_date: e.date,
    kind: e.kind,
    starts_at: e.startsAt ?? null,
    ends_at: e.endsAt ?? null,
  });
}

/** Chama o motor e devolve "YYYY-MM-DD HH:MM", ordenado — fácil de comparar e de ler no diff. */
export async function slots(
  db: SupabaseClient,
  professionalId: string,
  procedureId: string,
  startDate: string,
  days = 1,
): Promise<string[]> {
  const { data, error } = await db.rpc('get_available_slots', {
    p_professional_id: professionalId,
    p_procedure_id: procedureId,
    p_start_date: startDate,
    p_days: days,
  });
  if (error) throw new Error(`get_available_slots: ${error.message}`);
  return (data as { slot_date: string; slot_time: string }[])
    .map((r) => `${r.slot_date} ${r.slot_time.slice(0, 5)}`)
    .sort();
}
