import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localEnv, serviceClient } from './helpers/db';
import { addShift, createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * A porta HTTP de verdade: o Agent Builder chama a URL, não o RPC.
 * A função está no ar por `supabase functions serve` (tests/helpers/serve.ts).
 */
const TUE = '2030-01-08';
const base = () => `${localEnv().url}/functions/v1/api/v1`;

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;
let key: string;

async function issueKey(tenant: string, name = 'Agent Builder'): Promise<string> {
  const { data, error } = await db.rpc('api_issue_key', { p_tenant_id: tenant, p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

async function call(
  path: string,
  init: RequestInit & { apiKey?: string | null } = {},
): Promise<{ status: number; body: any }> {
  const { apiKey = key, headers, ...rest } = init;
  const res = await fetch(`${base()}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(headers as Record<string, string>),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana Souza', slotStep: 30 });
  proc = await createProcedure(db, tenantId, 60);
  await db.from('procedures').update({ description: 'Corte e escova', synonyms: ['escova'] }).eq('id', proc);
  await db.from('professional_procedures').insert({ tenant_id: tenantId, professional_id: ana.id, procedure_id: proc });
  await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '18:00' });
  key = await issueKey(tenantId);
});

describe('autenticação', () => {
  it('sem chave → 401', async () => {
    const r = await call('/professionals', { apiKey: null });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
  });

  it('chave inválida → 401 com o MESMO corpo (não diz se a chave existe)', async () => {
    const semChave = await call('/professionals', { apiKey: null });
    const chaveErrada = await call('/professionals', { apiKey: 'mb_nao_existe' });

    expect(chaveErrada.status).toBe(401);
    expect(chaveErrada.body).toEqual(semChave.body);
  });

  it('chave revogada → 401', async () => {
    const hash = createHash('sha256').update(key).digest('hex');
    await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('key_hash', hash);

    expect((await call('/professionals')).status).toBe(401);
  });

  it('a chave de uma clínica não enxerga a outra', async () => {
    const outra = await createTenant(db, 'Outra Clínica');
    await createProfessional(db, outra, { name: 'Bia' });

    const r = await call('/professionals', { apiKey: await issueKey(outra, 'AB outra') });
    expect(r.body.data.map((p: any) => p.name)).toEqual(['Bia']);
  });
});

describe('leituras', () => {
  it('GET /professionals', async () => {
    const r = await call('/professionals');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([
      { id: ana.id, name: 'Ana Souza', avatarUrl: null, specialty: null, available: true },
    ]);
  });

  it('GET /professionals/{id}/procedures traz descrição, sinônimos e variablePrice', async () => {
    const r = await call(`/professionals/${ana.id}/procedures`);
    expect(r.body.data).toEqual([
      {
        id: proc,
        name: expect.any(String),
        description: 'Corte e escova',
        synonyms: ['escova'],
        durationMinutes: 60,
        price: 100,
        variablePrice: false,
      },
    ]);
  });

  it('GET /procedures de profissional de outra clínica → 404', async () => {
    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia' });

    const r = await call(`/professionals/${bia.id}/procedures`);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('PROFESSIONAL_NOT_FOUND');
  });

  it('GET /availability devolve todo dia da janela, mesmo vazio', async () => {
    const r = await call(`/professionals/${ana.id}/availability?procedureId=${proc}&startDate=${TUE}&days=2`);

    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(2);
    expect(r.body.data[0].date).toBe(TUE);
    expect(r.body.data[0].slots).toContain('09:00');
    expect(r.body.data[1]).toEqual({ date: '2030-01-09', slots: [] }); // quarta sem expediente
  });

  it('days acima de 60 → 400 MAX_RANGE_EXCEEDED', async () => {
    const r = await call(`/professionals/${ana.id}/availability?procedureId=${proc}&days=61`);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('MAX_RANGE_EXCEEDED');
  });

  it('procedimento que a profissional não faz → 422 PROCEDURE_NOT_OFFERED', async () => {
    const outro = await createProcedure(db, tenantId, 30);
    const r = await call(`/professionals/${ana.id}/availability?procedureId=${outro}&days=1`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('PROCEDURE_NOT_OFFERED');
  });
});

describe('escritas', () => {
  const novo = (extra: Record<string, unknown> = {}) => ({
    method: 'POST',
    body: JSON.stringify({
      professionalId: ana.id,
      procedureId: proc,
      dateTime: `${TUE}T14:00:00-03:00`,
      client: { name: 'João Lima', phone: '+5588999990000' },
      ...extra,
    }),
  });

  it('POST cria e devolve 201 no formato do contrato', async () => {
    const r = await call('/appointments', novo({ notes: 'sem sulfato' }));

    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      status: 'CONFIRMED',
      dateTime: `${TUE}T14:00:00-03:00`,
      client: { name: 'João Lima', phone: '+5588999990000' },
      notes: 'sem sulfato',
      rescheduleCount: 0,
    });
  });

  it('dateTime sem offset → 422 VALIDATION_ERROR apontando o campo', async () => {
    const r = await call('/appointments', novo({ dateTime: `${TUE}T14:00:00` }));

    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details.field).toBe('dateTime');
  });

  it('Idempotency-Key repetida não cria outro agendamento', async () => {
    const first = await call('/appointments', { ...novo(), headers: { 'Idempotency-Key': 'k-1' } });
    const second = await call('/appointments', { ...novo(), headers: { 'Idempotency-Key': 'k-1' } });

    expect(second.body.id).toBe(first.body.id);
    const { count } = await db.from('appointments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    expect(count).toBe(1);
  });

  it('horário ocupado sem availabilityCheckedAt → 422 com sugestões', async () => {
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    const r = await call('/appointments', novo());
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('SLOT_NOT_AVAILABLE');
    expect(r.body.error.details.suggestedSlots.length).toBeGreaterThan(0);
  });

  it('DELETE cancela', async () => {
    const created = await call('/appointments', novo());

    const r = await call(`/appointments/${created.body.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Não poderá comparecer' }),
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: created.body.id, status: 'CANCELLED' });
  });

  it('PATCH remarca e devolve 200 com rescheduleCount', async () => {
    const created = await call('/appointments', novo());

    const r = await call(`/appointments/${created.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ dateTime: `${TUE}T16:00:00-03:00` }),
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dateTime: `${TUE}T16:00:00-03:00`, rescheduleCount: 1 });
  });

  it('agendamento de outra clínica → 404', async () => {
    const outra = await createTenant(db, 'Outra');
    const bia = await createProfessional(db, outra, { name: 'Bia' });
    const procB = await createProcedure(db, outra, 60);
    const alheio = await createAppointment(db, { tenantId: outra, professionalId: bia.id, procedureId: procB, date: TUE, time: '14:00' });

    const r = await call(`/appointments/${alheio}`, { method: 'DELETE', body: '{}' });
    expect(r.status).toBe(404);
  });
});

describe('busca por telefone', () => {
  it('acha o agendamento mesmo com o telefone sem o 9º dígito', async () => {
    await call('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        professionalId: ana.id,
        procedureId: proc,
        dateTime: `${TUE}T14:00:00-03:00`,
        client: { name: 'João Lima', phone: '+5588999990000' },
      }),
    });

    const r = await call(`/appointments?phone=${encodeURIComponent('8899990000')}&from=2030-01-01T00:00:00-03:00`);

    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({
      status: 'CONFIRMED',
      professionalName: 'Ana Souza',
      dateTime: `${TUE}T14:00:00-03:00`,
      client: { name: 'João Lima', phone: '+5588999990000' },
    });
    expect(r.body.data[0].procedureName).toEqual(expect.any(String));
  });

  it('sem agendamento → data vazio, nunca 404', async () => {
    const r = await call(`/appointments?phone=${encodeURIComponent('+5588912345678')}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: [] });
  });

  it('status inválido → 422', async () => {
    const r = await call(`/appointments?phone=${encodeURIComponent('+5588999990000')}&status=BANANA`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
});
