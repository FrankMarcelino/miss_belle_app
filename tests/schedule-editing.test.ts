import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, userClient } from './helpers/db';
import { addShift, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Caminhos de ESCRITA usados pela tela de expediente, com a RLS valendo
 * (cliente logado como a profissional, não service_role).
 */

type Range = { starts_at: string; ends_at: string };

async function daySchedule(db: SupabaseClient, professionalId: string, dow: number): Promise<string[]> {
  const { data, error } = await db
    .from('professional_schedules')
    .select('starts_at, ends_at')
    .eq('professional_id', professionalId)
    .eq('day_of_week', dow)
    .order('starts_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => `${r.starts_at.slice(0, 5)}-${r.ends_at.slice(0, 5)}`);
}

function setDay(db: SupabaseClient, professionalId: string, dow: number, ranges: Range[]) {
  return db.rpc('set_day_schedule', { p_professional_id: professionalId, p_day_of_week: dow, p_ranges: ranges });
}

let admin: SupabaseClient;
let tenantId: string;
let ana: Professional;
let asAna: SupabaseClient;

beforeEach(async () => {
  admin = serviceClient();
  tenantId = await createTenant(admin);
  ana = await createProfessional(admin, tenantId, { name: 'Ana' });
  asAna = await userClient(ana.email, ana.password);
});

describe('set_day_schedule — salvar um dia é uma transação só', () => {
  it('troca as faixas do dia', async () => {
    await addShift(admin, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '08:00', endsAt: '10:00' });

    const res = await setDay(asAna, ana.id, 2, [
      { starts_at: '09:00', ends_at: '12:00' },
      { starts_at: '13:00', ends_at: '18:00' },
    ]);
    expect(res.error).toBeNull();
    expect(await daySchedule(admin, ana.id, 2)).toEqual(['09:00-12:00', '13:00-18:00']);
  });

  it('faixas sobrepostas → erro, e o dia ANTIGO continua intacto (nada de dia vazio)', async () => {
    await addShift(admin, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '08:00', endsAt: '10:00' });

    const res = await setDay(asAna, ana.id, 2, [
      { starts_at: '09:00', ends_at: '12:00' },
      { starts_at: '11:00', ends_at: '15:00' },
    ]);
    expect(res.error?.code).toBe('23P01'); // exclusion_violation, do trigger de sobreposição
    expect(await daySchedule(admin, ana.id, 2)).toEqual(['08:00-10:00']);
  });

  it('lista vazia → folga naquele dia', async () => {
    await addShift(admin, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '08:00', endsAt: '10:00' });

    expect((await setDay(asAna, ana.id, 2, [])).error).toBeNull();
    expect(await daySchedule(admin, ana.id, 2)).toEqual([]);
  });

  it('não mexe nos outros dias', async () => {
    await addShift(admin, { tenantId, professionalId: ana.id, dayOfWeek: 3, startsAt: '08:00', endsAt: '10:00' });

    expect((await setDay(asAna, ana.id, 2, [{ starts_at: '09:00', ends_at: '12:00' }])).error).toBeNull();
    expect(await daySchedule(admin, ana.id, 3)).toEqual(['08:00-10:00']);
  });

  it('profissional comum NÃO altera o expediente da colega — erro, não sucesso silencioso', async () => {
    const bia = await createProfessional(admin, tenantId, { name: 'Bia' });
    await addShift(admin, { tenantId, professionalId: bia.id, dayOfWeek: 2, startsAt: '08:00', endsAt: '10:00' });

    // Lista vazia é o caso traiçoeiro: sem portão explícito, o DELETE sob RLS
    // apagaria 0 linhas e a função "daria certo" sem fazer nada.
    const res = await setDay(asAna, bia.id, 2, []);
    expect(res.error?.code).toBe('42501');
    expect(await daySchedule(admin, bia.id, 2)).toEqual(['08:00-10:00']);
  });

  it('admin da clínica altera o expediente da colega', async () => {
    const dona = await createProfessional(admin, tenantId, { name: 'Dona', role: 'super_admin' });
    const asDona = await userClient(dona.email, dona.password);

    expect((await setDay(asDona, ana.id, 2, [{ starts_at: '10:00', ends_at: '14:00' }])).error).toBeNull();
    expect(await daySchedule(admin, ana.id, 2)).toEqual(['10:00-14:00']);
  });

  it('admin de OUTRA clínica não altera', async () => {
    const outra = await createTenant(admin, 'Outra');
    const intrusa = await createProfessional(admin, outra, { role: 'super_admin' });
    const asIntrusa = await userClient(intrusa.email, intrusa.password);

    expect((await setDay(asIntrusa, ana.id, 2, [{ starts_at: '10:00', ends_at: '14:00' }])).error?.code).toBe('42501');
    expect(await daySchedule(admin, ana.id, 2)).toEqual([]);
  });
});

describe('passo da grade e exceções — escrita direta com RLS', () => {
  it('a profissional muda o próprio passo; valor fora de 15/30/60 é recusado', async () => {
    const ok = await asAna.from('profiles').update({ slot_step_minutes: 60 }).eq('id', ana.id).select('slot_step_minutes');
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ slot_step_minutes: 60 }]);

    const bad = await asAna.from('profiles').update({ slot_step_minutes: 45 }).eq('id', ana.id);
    expect(bad.error).not.toBeNull();
  });

  it('a profissional cria e apaga as próprias exceções', async () => {
    const created = await asAna
      .from('schedule_exceptions')
      .insert({ professional_id: ana.id, exception_date: '2030-01-08', kind: 'block', reason: 'Médico' })
      .select('id, tenant_id')
      .single();
    expect(created.error).toBeNull();
    expect(created.data?.tenant_id).toBe(tenantId); // preenchido pelo trigger

    const del = await asAna.from('schedule_exceptions').delete().eq('id', created.data!.id).select('id');
    expect(del.data).toHaveLength(1);
  });

  it('a profissional NÃO cria exceção para a colega', async () => {
    const bia = await createProfessional(admin, tenantId, { name: 'Bia' });
    const res = await asAna
      .from('schedule_exceptions')
      .insert({ professional_id: bia.id, exception_date: '2030-01-08', kind: 'block' });
    expect(res.error).not.toBeNull();
  });
});
