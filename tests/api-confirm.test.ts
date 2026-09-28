import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * POST /v1/appointments/{id}/confirm (#8).
 *
 * A cliente responde à mensagem de confirmação de 24 h e a IA confirma:
 * `scheduled` vira `confirmed`. Confirmar de novo é o mesmo resultado, para o
 * bot poder repetir a chamada sem medo.
 */
const TUE = '2030-01-08';

type Result = { ok: boolean; http: number; code?: string; body?: Record<string, unknown> };

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana', slotStep: 30 });
  proc = await createProcedure(db, tenantId, 60);
});

function confirm(id: string, tenant = tenantId): Promise<Result> {
  return db
    .rpc('api_confirm_appointment', { p_tenant_id: tenant, p_appointment_id: id })
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as Result;
    });
}

function appt(status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled', date = TUE, time = '14:00') {
  return createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date, time, status });
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

describe('confirmação', () => {
  it('agendado vira confirmado e grava quando', async () => {
    const id = await appt('scheduled');

    const r = await confirm(id);

    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ id, status: 'CONFIRMED' });
    expect(r.body!.confirmedAt).toMatch(/-03:00$/);

    const { data } = await db.from('appointments').select('status, confirmed_at').eq('id', id).single();
    expect(data?.status).toBe('confirmed');
    expect(data?.confirmed_at).not.toBeNull();
  });

  it('confirmar de novo devolve a mesma coisa e não mexe no confirmed_at', async () => {
    const id = await appt('scheduled');
    await confirm(id);
    const { data: antes } = await db.from('appointments').select('confirmed_at').eq('id', id).single();

    const r = await confirm(id);

    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ id, status: 'CONFIRMED' });
    const { data: depois } = await db.from('appointments').select('confirmed_at').eq('id', id).single();
    expect(depois?.confirmed_at).toBe(antes?.confirmed_at);
  });

  it('já nascido confirmado (≤ 30 h) também devolve 200', async () => {
    const id = await appt('confirmed');

    const r = await confirm(id);

    expect(r.http).toBe(200);
    expect(r.body).toMatchObject({ id, status: 'CONFIRMED' });
  });

  it.each(['cancelled', 'completed'] as const)('%s → APPOINTMENT_NOT_ACTIVE', async (status) => {
    const id = await appt(status);

    const r = await confirm(id);

    expect(r.http).toBe(422);
    expect(r.code).toBe('APPOINTMENT_NOT_ACTIVE');
    const { data } = await db.from('appointments').select('status').eq('id', id).single();
    expect(data?.status).toBe(status);
  });

  it('horário que já passou → APPOINTMENT_ALREADY_STARTED', async () => {
    const { date, time } = brasiliaIn(-2);
    const id = await appt('scheduled', date, time);

    const r = await confirm(id);

    expect(r.http).toBe(422);
    expect(r.code).toBe('APPOINTMENT_ALREADY_STARTED');
    const { data } = await db.from('appointments').select('status').eq('id', id).single();
    expect(data?.status).toBe('scheduled');
  });

  it('agendamento de outra clínica → 404 e não confirma', async () => {
    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia' });
    const procB = await createProcedure(db, outra, 60);
    const alheio = await createAppointment(db, {
      tenantId: outra, professionalId: bia.id, procedureId: procB, date: TUE, time: '14:00', status: 'scheduled',
    });

    const r = await confirm(alheio);

    expect(r.http).toBe(404);
    expect(r.code).toBe('APPOINTMENT_NOT_FOUND');
    const { data } = await db.from('appointments').select('status').eq('id', alheio).single();
    expect(data?.status).toBe('scheduled');
  });
});
