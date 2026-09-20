import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { addShift, createAppointment, createProcedure, createProfessional, createTenant, slots, type Professional } from './helpers/fixtures';

/**
 * A duração passa a ser COPIADA para o agendamento no momento da marcação.
 *
 * Antes, motor e conflito liam duration_minutes do procedimento via JOIN: mudar
 * "Corte" de 60 para 90 min esticava todos os agendamentos já marcados, e
 * horários que estavam livres passavam a colidir sem ninguém ter mexido neles.
 * A cópia também é o que permite a constraint de exclusão (fatia 3), porque
 * constraint não consulta outra tabela.
 */
const TUE = '2030-01-08';

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana', slotStep: 30 });
});

async function durationOf(id: string): Promise<number | null> {
  const { data } = await db.from('appointments').select('duration_minutes').eq('id', id).single();
  return data?.duration_minutes ?? null;
}

describe('appointments.duration_minutes', () => {
  it('é copiada do procedimento ao marcar', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    expect(await durationOf(appt)).toBe(60);
  });

  it('mudar a duração do procedimento NÃO mexe em agendamento já marcado', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    await db.from('procedures').update({ duration_minutes: 30 }).eq('id', proc);

    expect(await durationOf(appt)).toBe(60);
  });

  it('o motor respeita a duração congelada, não a atual do procedimento', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '13:00', endsAt: '16:00' });
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    // Encolher o procedimento não pode liberar 14:30 de um agendamento de 60 min.
    await db.from('procedures').update({ duration_minutes: 30 }).eq('id', proc);

    const livres = await slots(db, ana.id, proc, TUE);
    expect(livres).not.toContain(`${TUE} 14:30`);
    expect(livres).toContain(`${TUE} 15:00`);
  });

  it('trocar o procedimento do agendamento recopia a duração', async () => {
    const curto = await createProcedure(db, tenantId, 30);
    const longo = await createProcedure(db, tenantId, 90);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: curto, date: TUE, time: '14:00' });

    await db.from('appointments').update({ procedure_id: longo }).eq('id', appt);

    expect(await durationOf(appt)).toBe(90);
  });
});

describe('colunas do contrato', () => {
  it('procedimento nasce com descrição vazia e sem sinônimos', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const { data } = await db.from('procedures').select('description, synonyms').eq('id', proc).single();

    expect(data).toEqual({ description: '', synonyms: [] });
  });

  it('sinônimos guardam uma lista', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const { data, error } = await db
      .from('procedures')
      .update({ description: 'Corte e escova', synonyms: ['escova', 'corte + finalização'] })
      .eq('id', proc)
      .select('description, synonyms')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ description: 'Corte e escova', synonyms: ['escova', 'corte + finalização'] });
  });

  it('profissional nasce com 2h de antecedência e 1 remarcação', async () => {
    const { data } = await db.from('profiles').select('min_notice_hours, max_reschedules').eq('id', ana.id).single();

    expect(data).toEqual({ min_notice_hours: 2, max_reschedules: 1 });
  });

  it('valores negativos de política são recusados', async () => {
    const res = await db.from('profiles').update({ min_notice_hours: -1 }).eq('id', ana.id);
    expect(res.error?.code).toBe('23514'); // check_violation — "coluna não existe" também seria erro
  });

  it('agendamento guarda observação e hora do cancelamento', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    const { data, error } = await db
      .from('appointments')
      .update({ notes: 'Prefere shampoo sem sulfato', status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', appt)
      .select('notes, cancelled_at')
      .single();

    expect(error).toBeNull();
    expect(data?.notes).toBe('Prefere shampoo sem sulfato');
    expect(data?.cancelled_at).not.toBeNull();
  });
});
