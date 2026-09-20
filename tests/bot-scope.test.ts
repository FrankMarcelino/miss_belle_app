import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { addShift, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Recorte do assistente: o que o bot enxerga e o que ele pode agendar.
 *
 * Duas chaves com padrões OPOSTOS:
 *   profiles.bot_enabled    — padrão false. Profissional entra só se alguém disser que sim
 *                             (o expediente dela pode estar no padrão de 24h).
 *   procedures.bot_bookable — padrão true. Serviço é para ser oferecido; a exceção
 *                             (um curso de 8h) sai por decisão explícita.
 *
 * Serviço não agendável CONTINUA na lista: o agente precisa saber dele para
 * responder perguntas, e transfere quando a cliente quiser marcar.
 */
const TUE = '2030-01-08';

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;

async function create(input: { professionalId?: string; procedureId?: string } = {}) {
  const { data, error } = await db.rpc('api_create_appointment', {
    p_tenant_id: tenantId,
    p_professional_id: input.professionalId ?? ana.id,
    p_procedure_id: input.procedureId ?? proc,
    p_datetime: `${TUE}T14:00:00-03:00`,
    p_client_name: 'João Lima',
    p_client_phone: '+5588999990000',
    p_notes: null,
    p_availability_checked_at: null,
    p_idempotency_key: null,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; http: number; code?: string };
}

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana', slotStep: 30 });
  proc = await createProcedure(db, tenantId, 60);
  await db.from('professional_procedures').insert({ tenant_id: tenantId, professional_id: ana.id, procedure_id: proc });
  await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '18:00' });
});

describe('profiles.bot_enabled', () => {
  it('profissional nasce FORA do assistente', async () => {
    const { data } = await db.from('profiles').select('bot_enabled').eq('id', ana.id).single();
    expect(data?.bot_enabled).toBe(false);
  });

  it('sem a chave ligada, agendar responde "profissional não encontrado"', async () => {
    const r = await create();
    expect(r.http).toBe(404);
    expect(r.code).toBe('PROFESSIONAL_NOT_FOUND');
  });

  it('com a chave ligada, agenda normalmente', async () => {
    await db.from('profiles').update({ bot_enabled: true }).eq('id', ana.id);
    expect((await create()).http).toBe(201);
  });
});

describe('procedures.bot_bookable', () => {
  beforeEach(async () => {
    await db.from('profiles').update({ bot_enabled: true }).eq('id', ana.id);
  });

  it('serviço nasce agendável', async () => {
    const { data } = await db.from('procedures').select('bot_bookable').eq('id', proc).single();
    expect(data?.bot_bookable).toBe(true);
  });

  it('serviço marcado como não agendável recusa o agendamento com código próprio', async () => {
    await db.from('procedures').update({ bot_bookable: false }).eq('id', proc);

    const r = await create();
    expect(r.http).toBe(422);
    expect(r.code).toBe('PROCEDURE_NOT_BOOKABLE');
  });

  it('o motor continua calculando horário — quem recusa é a porta, não o cálculo', async () => {
    await db.from('procedures').update({ bot_bookable: false }).eq('id', proc);

    const { data } = await db.rpc('get_available_slots', {
      p_professional_id: ana.id,
      p_procedure_id: proc,
      p_start_date: TUE,
      p_days: 1,
    });
    expect((data as unknown[]).length).toBeGreaterThan(0);
  });
});
