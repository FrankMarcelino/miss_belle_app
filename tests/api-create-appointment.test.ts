import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { addShift, createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * api_create_appointment: o POST /v1/appointments do contrato, numa transação.
 *
 * Cliente, validação de horário, inserção e idempotência juntos — se fossem
 * chamadas separadas da Edge Function, uma falha no meio deixaria cliente sem
 * agendamento, ou agendamento sem registro de idempotência.
 */
const TUE = '2030-01-08'; // terça
const WED = '2030-01-09';

type Result = {
  ok: boolean;
  http: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

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

async function create(input: Partial<{
  tenantId: string;
  professionalId: string;
  procedureId: string;
  dateTime: string;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  checkedAt: string | null;
  idempotencyKey: string | null;
}> = {}): Promise<Result> {
  const { data, error } = await db.rpc('api_create_appointment', {
    p_tenant_id: input.tenantId ?? tenantId,
    p_professional_id: input.professionalId ?? ana.id,
    p_procedure_id: input.procedureId ?? proc,
    p_datetime: input.dateTime ?? `${TUE}T14:00:00-03:00`,
    p_client_name: input.clientName ?? 'João Lima',
    p_client_phone: input.clientPhone ?? '+5588999990000',
    p_notes: input.notes ?? null,
    p_availability_checked_at: input.checkedAt ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw new Error(`api_create_appointment: ${error.message}`);
  return data as Result;
}

/** Agendamento da colega ocupando o horário, com created_at controlado. */
async function blockSlot(createdAt: string, time = '14:00'): Promise<void> {
  const id = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time });
  await db.from('appointments').update({ created_at: createdAt }).eq('id', id);
}

describe('caminho feliz', () => {
  it('cria o agendamento no formato do contrato', async () => {
    const r = await create({ notes: 'Prefere shampoo sem sulfato' });

    expect(r.http).toBe(201);
    expect(r.ok).toBe(true);
    expect(r.body).toMatchObject({
      status: 'CONFIRMED',
      professionalId: ana.id,
      procedureId: proc,
      dateTime: `${TUE}T14:00:00-03:00`,
      notes: 'Prefere shampoo sem sulfato',
      rescheduleCount: 0,
      client: { name: 'João Lima', phone: '+5588999990000' },
    });

    const { data } = await db.from('appointments').select('status, appointment_time, duration_minutes').eq('id', r.body!.id as string).single();
    expect(data).toMatchObject({ status: 'confirmed', appointment_time: '14:00:00', duration_minutes: 60 });
  });

  it('reutiliza cliente já cadastrada pelo telefone — e o nome do cadastro vence', async () => {
    const { data: existing } = await db
      .from('patients')
      .insert({ full_name: 'João Lima Silva', phone: '(88) 9999-0000', professional_id: ana.id, tenant_id: tenantId })
      .select('id')
      .single();

    const r = await create({ clientName: 'Joao', clientPhone: '+5588999990000' });

    expect((r.body!.client as { name: string }).name).toBe('João Lima Silva');
    const { data } = await db.from('appointments').select('patient_id').eq('id', r.body!.id as string).single();
    expect(data?.patient_id).toBe(existing!.id);

    const { count } = await db.from('patients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    expect(count).toBe(1);
  });

  it('cria a cliente quando o telefone é novo', async () => {
    await create({ clientPhone: '88988887777', clientName: 'Maria' });

    const { data } = await db.from('patients').select('full_name, phone_e164').eq('tenant_id', tenantId).single();
    expect(data).toEqual({ full_name: 'Maria', phone_e164: '+5588988887777' });
  });
});

describe('validação', () => {
  it('telefone impossível de normalizar → VALIDATION_ERROR apontando o campo', async () => {
    const r = await create({ clientPhone: '99990000' });

    expect(r.http).toBe(422);
    expect(r.code).toBe('VALIDATION_ERROR');
    expect(r.details?.field).toBe('client.phone');
  });

  it('nome vazio → VALIDATION_ERROR', async () => {
    const r = await create({ clientName: '   ' });
    expect(r.code).toBe('VALIDATION_ERROR');
    expect(r.details?.field).toBe('client.name');
  });

  it('profissional de outra clínica → 404, sem revelar que existe', async () => {
    const outra = await createTenant(db, 'Outra');
    const intrusa = await createProfessional(db, outra, { name: 'Intrusa' });

    const r = await create({ professionalId: intrusa.id });
    expect(r.http).toBe(404);
    expect(r.code).toBe('PROFESSIONAL_NOT_FOUND');
  });

  it('procedimento que a profissional não realiza → PROCEDURE_NOT_OFFERED', async () => {
    const outro = await createProcedure(db, tenantId, 30);

    const r = await create({ procedureId: outro });
    expect(r.http).toBe(422);
    expect(r.code).toBe('PROCEDURE_NOT_OFFERED');
  });
});

describe('horário', () => {
  it('fora do expediente → SLOT_NOT_AVAILABLE com até 5 sugestões', async () => {
    const r = await create({ dateTime: `${TUE}T06:00:00-03:00` });

    expect(r.http).toBe(422);
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
    const sugestoes = r.details?.suggestedSlots as { date: string; time: string }[];
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes.length).toBeLessThanOrEqual(5);
    expect(sugestoes[0]).toEqual({ date: TUE, time: '09:00' });
  });

  it('fora da grade (14:10 com passo de 30) → SLOT_NOT_AVAILABLE', async () => {
    const r = await create({ dateTime: `${TUE}T14:10:00-03:00` });
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('onde o procedimento não cabe inteiro (17:30 de 60 min até as 18:00) → SLOT_NOT_AVAILABLE', async () => {
    const r = await create({ dateTime: `${TUE}T17:30:00-03:00` });
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('dia sem expediente → SLOT_NOT_AVAILABLE', async () => {
    const r = await create({ dateTime: `${WED}T14:00:00-03:00` });
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('data no passado → SLOT_NOT_AVAILABLE', async () => {
    const r = await create({ dateTime: '2020-01-07T14:00:00-03:00' });
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('sugestões: mesma data primeiro, pelas mais próximas do horário pedido', async () => {
    // Ocupa 14:00; o pedido das 14:00 deve sugerir 13:30 e 15:00 antes de 09:00.
    await blockSlot('2030-01-01T10:00:00Z');

    const r = await create({ dateTime: `${TUE}T14:00:00-03:00` });
    const sugestoes = r.details?.suggestedSlots as { date: string; time: string }[];

    expect(sugestoes.slice(0, 2).map((s) => s.time).sort()).toEqual(['13:00', '15:00']);
    expect(sugestoes.every((s) => s.date === TUE)).toBe(true);
  });
});

describe('corrida: 409 × 422', () => {
  it('ocupado DEPOIS da consulta → SLOT_TAKEN_MEANTIME com wasAvailableUntil', async () => {
    const consultouEm = '2030-01-07T12:00:00-03:00';
    await blockSlot('2030-01-07T15:30:00Z'); // depois da consulta

    const r = await create({ checkedAt: consultouEm });

    expect(r.http).toBe(409);
    expect(r.code).toBe('SLOT_TAKEN_MEANTIME');
    expect(new Date(r.details!.wasAvailableUntil as string).toISOString()).toBe('2030-01-07T15:30:00.000Z');
  });

  it('ocupado ANTES da consulta → SLOT_NOT_AVAILABLE, sem wasAvailableUntil', async () => {
    await blockSlot('2030-01-07T10:00:00Z');

    const r = await create({ checkedAt: '2030-01-07T12:00:00-03:00' });

    expect(r.http).toBe(422);
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
    expect(r.details?.wasAvailableUntil).toBeUndefined();
  });

  it('sem availabilityCheckedAt → 422, porque não dá para provar corrida', async () => {
    await blockSlot('2030-01-07T15:30:00Z');

    const r = await create({ checkedAt: null });
    expect(r.http).toBe(422);
    expect(r.code).toBe('SLOT_NOT_AVAILABLE');
  });
});

describe('idempotência', () => {
  it('mesma chave e mesmo corpo → a MESMA resposta, sem criar outro agendamento', async () => {
    const first = await create({ idempotencyKey: 'abc-123' });
    const second = await create({ idempotencyKey: 'abc-123' });

    expect(second.http).toBe(201);
    expect(second.body!.id).toBe(first.body!.id);

    const { count } = await db.from('appointments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    expect(count).toBe(1);
  });

  it('mesma chave com corpo diferente → IDEMPOTENCY_KEY_REUSED', async () => {
    await create({ idempotencyKey: 'abc-123' });

    const r = await create({ idempotencyKey: 'abc-123', dateTime: `${TUE}T15:00:00-03:00` });
    expect(r.http).toBe(422);
    expect(r.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('a chave é por clínica: a mesma string em outra clínica não colide', async () => {
    await create({ idempotencyKey: 'abc-123' });

    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia', slotStep: 30 });
    const procB = await createProcedure(db, outra, 60);
    await db.from('professional_procedures').insert({ tenant_id: outra, professional_id: bia.id, procedure_id: procB });
    await addShift(db, { tenantId: outra, professionalId: bia.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '18:00' });

    const r = await create({ tenantId: outra, professionalId: bia.id, procedureId: procB, idempotencyKey: 'abc-123' });
    expect(r.http).toBe(201);
  });
});
