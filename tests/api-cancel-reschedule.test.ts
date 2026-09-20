import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { addShift, createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * DELETE e PATCH /v1/appointments/{id}.
 *
 * As políticas (minNoticeHours, maxReschedules) valem só para a cliente se
 * servindo pelo bot. A profissional continua livre no app.
 */
const TUE = '2030-01-08';

type Result = { ok: boolean; http: number; code?: string; details?: Record<string, unknown>; body?: Record<string, unknown> };

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana', slotStep: 30 });
  proc = await createProcedure(db, tenantId, 60);
  await db.from('professional_procedures').insert({ tenant_id: tenantId, professional_id: ana.id, procedure_id: proc });
  await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '18:00' });
});

function cancel(id: string, reason: string | null = null, tenant = tenantId): Promise<Result> {
  return db
    .rpc('api_cancel_appointment', { p_tenant_id: tenant, p_appointment_id: id, p_reason: reason })
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as Result;
    });
}

function reschedule(id: string, dateTime: string, checkedAt: string | null = null, tenant = tenantId): Promise<Result> {
  return db
    .rpc('api_reschedule_appointment', {
      p_tenant_id: tenant,
      p_appointment_id: id,
      p_datetime: dateTime,
      p_availability_checked_at: checkedAt,
    })
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as Result;
    });
}

/** Data/hora em Brasília daqui a N horas, como o banco grava (date + time). */
function brasiliaIn(hours: number): { date: string; time: string } {
  const t = new Date(Date.now() + hours * 3_600_000);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...o }).format(t);
  return {
    date: fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  };
}

describe('cancelamento', () => {
  it('cancela e devolve o formato do contrato', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    const r = await cancel(appt, 'Cliente não poderá comparecer');

    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ id: appt, status: 'CANCELLED' });
    expect(r.body!.cancelledAt).toMatch(/-03:00$/);

    const { data } = await db.from('appointments').select('status, cancellation_reason, cancelled_at').eq('id', appt).single();
    expect(data?.status).toBe('cancelled');
    expect(data?.cancellation_reason).toBe('Cliente não poderá comparecer');
    expect(data?.cancelled_at).not.toBeNull();
  });

  it('cancelar de novo devolve a mesma coisa (o bot pode repetir sem medo)', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });
    await cancel(appt);

    const r = await cancel(appt);
    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ status: 'CANCELLED' });
  });

  it('em cima da hora → CANCELLATION_NOT_ALLOWED com a regra no details', async () => {
    const { date, time } = brasiliaIn(1); // padrão da profissional é 2h
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date, time });

    const r = await cancel(appt);
    expect(r.http).toBe(422);
    expect(r.code).toBe('CANCELLATION_NOT_ALLOWED');
    expect(r.details?.minNoticeHours).toBe(2);
    expect(r.details?.appointmentDateTime).toMatch(/-03:00$/);
  });

  it('respeita a antecedência de CADA profissional', async () => {
    await db.from('profiles').update({ min_notice_hours: 0 }).eq('id', ana.id);
    const { date, time } = brasiliaIn(1);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date, time });

    expect((await cancel(appt)).http).toBe(200);
  });

  it('com pagamento registrado → CANCELLATION_REQUIRES_STAFF (o dinheiro exige decisão humana)', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });
    await db.from('appointments').update({ payment_status: 'paid', has_payment: true }).eq('id', appt);

    const r = await cancel(appt);
    expect(r.http).toBe(422);
    expect(r.code).toBe('CANCELLATION_REQUIRES_STAFF');

    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).not.toBe('cancelled');
  });

  it('já concluído → APPOINTMENT_NOT_ACTIVE', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00', status: 'completed' });

    const r = await cancel(appt);
    expect(r.code).toBe('APPOINTMENT_NOT_ACTIVE');
  });

  it('de outra clínica → 404', async () => {
    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia' });
    const procB = await createProcedure(db, outra, 60);
    const appt = await createAppointment(db, { tenantId: outra, professionalId: bia.id, procedureId: procB, date: TUE, time: '14:00' });

    const r = await cancel(appt);
    expect(r.http).toBe(404);
    expect(r.code).toBe('APPOINTMENT_NOT_FOUND');

    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).toBe('confirmed');
  });
});

describe('remarcação', () => {
  it('remarca, guarda de onde veio e conta a remarcação', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    const r = await reschedule(appt, `${TUE}T16:00:00-03:00`);

    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ id: appt, status: 'CONFIRMED', dateTime: `${TUE}T16:00:00-03:00`, rescheduleCount: 1 });

    const { data } = await db
      .from('appointments')
      .select('appointment_time, rescheduled_from_time, reschedule_count')
      .eq('id', appt)
      .single();
    expect(data).toMatchObject({ appointment_time: '16:00:00', rescheduled_from_time: '14:00:00', reschedule_count: 1 });
  });

  it('o próprio agendamento não bloqueia o horário novo', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    // 14:30 sobrepõe o horário atual dele mesmo — tem que ser permitido.
    expect((await reschedule(appt, `${TUE}T14:30:00-03:00`)).http).toBe(200);
  });

  it('limite de remarcações → RESCHEDULE_NOT_ALLOWED', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });
    await reschedule(appt, `${TUE}T16:00:00-03:00`); // padrão é 1

    const r = await reschedule(appt, `${TUE}T10:00:00-03:00`);
    expect(r.http).toBe(422);
    expect(r.code).toBe('RESCHEDULE_NOT_ALLOWED');
    expect(r.details).toMatchObject({ maxReschedules: 1, rescheduleCount: 1 });
  });

  it('remarcar em cima da hora → CANCELLATION_NOT_ALLOWED (abre o mesmo buraco que cancelar)', async () => {
    const { date, time } = brasiliaIn(1);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date, time });

    const r = await reschedule(appt, `${TUE}T16:00:00-03:00`);
    expect(r.code).toBe('CANCELLATION_NOT_ALLOWED');
  });

  it('horário novo fora do expediente → SLOT_NOT_AVAILABLE com sugestões', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    const r = await reschedule(appt, `${TUE}T06:00:00-03:00`);
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
    expect((r.details?.suggestedSlots as unknown[]).length).toBeGreaterThan(0);
  });

  it('horário novo ocupado depois da consulta → SLOT_TAKEN_MEANTIME', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '10:00' });
    const outro = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '16:00' });
    await db.from('appointments').update({ created_at: '2030-01-07T15:30:00Z' }).eq('id', outro);

    const r = await reschedule(appt, `${TUE}T16:00:00-03:00`, '2030-01-07T12:00:00-03:00');
    expect(r.http).toBe(409);
    expect(r.code).toBe('SLOT_TAKEN_MEANTIME');
  });

  it('cancelado não se remarca', async () => {
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00', status: 'cancelled' });

    const r = await reschedule(appt, `${TUE}T16:00:00-03:00`);
    expect(r.code).toBe('APPOINTMENT_NOT_ACTIVE');
  });

  it('de outra clínica → 404', async () => {
    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia' });
    const procB = await createProcedure(db, outra, 60);
    const appt = await createAppointment(db, { tenantId: outra, professionalId: bia.id, procedureId: procB, date: TUE, time: '14:00' });

    expect((await reschedule(appt, `${TUE}T16:00:00-03:00`)).http).toBe(404);
  });
});
