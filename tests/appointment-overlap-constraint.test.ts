import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createPatient, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Constraint de exclusão: o BANCO recusa dois agendamentos sobrepostos da mesma
 * profissional. A checagem prévia (check_appointment_conflict) não resolve
 * corrida — dois pedidos simultâneos passam os dois pela checagem antes de
 * qualquer um gravar.
 *
 * Vale a partir da data de corte: produção tem 2 pares sobrepostos de
 * janeiro/2026 (medido em 19/09) que são histórico e não se mexe.
 */
const CUTOVER = '2026-09-20';
const BEFORE_CUTOVER = '2026-01-10';
const TUE = '2030-01-08';

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc60: string;
let patientId: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana' });
  proc60 = await createProcedure(db, tenantId, 60);
  patientId = await createPatient(db, tenantId, ana.id);
});

function book(date: string, time: string, status: 'confirmed' | 'cancelled' = 'confirmed', professionalId = ana.id) {
  return db.from('appointments').insert({
    tenant_id: tenantId,
    professional_id: professionalId,
    procedure_id: proc60,
    patient_id: patientId,
    appointment_date: date,
    appointment_time: time,
    status,
  });
}

describe('sobreposição de agendamentos', () => {
  it('dois que se cruzam na mesma profissional → recusado pelo banco', async () => {
    expect((await book(TUE, '14:00')).error).toBeNull();
    expect((await book(TUE, '14:30')).error?.code).toBe('23P01');
  });

  it('encostados (14:00 de 60 min e 15:00) → aceitos', async () => {
    expect((await book(TUE, '14:00')).error).toBeNull();
    expect((await book(TUE, '15:00')).error).toBeNull();
  });

  it('cancelado não ocupa: dá para remarcar alguém no mesmo horário', async () => {
    expect((await book(TUE, '14:00', 'cancelled')).error).toBeNull();
    expect((await book(TUE, '14:00')).error).toBeNull();
  });

  it('atravessando a meia-noite também é recusado', async () => {
    expect((await book('2030-01-04', '23:30')).error).toBeNull();
    expect((await book('2030-01-05', '00:00')).error?.code).toBe('23P01');
  });

  it('profissionais diferentes no mesmo horário → aceito', async () => {
    const bia = await createProfessional(db, tenantId, { name: 'Bia' });
    expect((await book(TUE, '14:00')).error).toBeNull();
    expect((await book(TUE, '14:00', 'confirmed', bia.id)).error).toBeNull();
  });

  it('histórico anterior à data de corte continua aceitando sobreposição', async () => {
    expect((await book(BEFORE_CUTOVER, '14:00')).error).toBeNull();
    expect((await book(BEFORE_CUTOVER, '14:30')).error).toBeNull();
  });

  it('a partir da data de corte, vale', async () => {
    expect((await book(CUTOVER, '14:00')).error).toBeNull();
    expect((await book(CUTOVER, '14:30')).error?.code).toBe('23P01');
  });
});
