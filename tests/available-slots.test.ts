import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, userClient } from './helpers/db';
import {
  addException,
  addShift,
  createAppointment,
  createProcedure,
  createProfessional,
  createTenant,
  hasConflict,
  slots,
  type Professional,
} from './helpers/fixtures';

/**
 * Contrato do motor de disponibilidade (doc/planejamento/agenda-de-trabalho.md).
 *
 * Datas fixas em 2030 para o resultado não depender do dia em que o teste roda.
 *   2030-01-04 sexta (5) · 2030-01-05 sábado (6) · 2030-01-06 domingo (0)
 *   2030-01-08 terça (2) · 2030-01-09 quarta (3)
 */
const FRI = '2030-01-04';
const SAT = '2030-01-05';
const SUN = '2030-01-06';
const TUE = '2030-01-08';
const WED = '2030-01-09';

/** "YYYY-MM-DD HH:MM" de `from` até `to` inclusive, de `step` em `step` minutos. */
function grid(date: string, from: string, to: string, step: number): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(from); m <= toMin(to); m += step) {
    out.push(`${date} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana' }); // passo = DEFAULT da coluna (30)
});

describe('fixtures', () => {
  // Não testa o motor: prova que as fixtures batem com o schema REAL. Se este
  // falhar, os outros vermelhos não significam nada.
  it('montam clínica, profissional, procedimento e agendamento no schema do baseline', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });
    expect(appt).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('expediente recorrente', () => {
  it('dia sem expediente → nenhum horário', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    expect(await slots(db, ana.id, proc, TUE)).toEqual([]);
  });

  it('09–12 e 13–18, 60 min, passo 30 → o slot tem que CABER inteiro na faixa (11:30 não aparece)', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '12:00' });
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '13:00', endsAt: '18:00' });

    expect(await slots(db, ana.id, proc, TUE)).toEqual([
      ...grid(TUE, '09:00', '11:00', 30),
      ...grid(TUE, '13:00', '17:00', 30),
    ]);
  });

  it('passo configurável por profissional: 60 → só hora cheia', async () => {
    const bia = await createProfessional(db, tenantId, { name: 'Bia', slotStep: 60 });
    const proc = await createProcedure(db, tenantId, 30);
    await addShift(db, { tenantId, professionalId: bia.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '12:00' });

    expect(await slots(db, bia.id, proc, TUE)).toEqual(grid(TUE, '09:00', '11:00', 60));
  });

  it('faixas sobrepostas no mesmo dia → recusadas pelo banco', async () => {
    const first = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '12:00' });
    expect(first.error).toBeNull();
    const overlap = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '11:00', endsAt: '15:00' });
    expect(overlap.error).not.toBeNull();
  });

  it('faixas encostadas (12:00 fim, 12:00 início) → aceitas: encostar não é sobrepor', async () => {
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '12:00' });
    const touching = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '12:00', endsAt: '15:00' });
    expect(touching.error).toBeNull();
  });
});

describe('exceções', () => {
  it('block parcial tira só a janela dele', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '18:00' });
    await addException(db, { tenantId, professionalId: ana.id, date: TUE, kind: 'block', startsAt: '12:00', endsAt: '14:00' });

    expect(await slots(db, ana.id, proc, TUE)).toEqual([
      ...grid(TUE, '09:00', '11:00', 30),
      ...grid(TUE, '14:00', '17:00', 30),
    ]);
  });

  it('extra em dia sem expediente abre horário', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addException(db, { tenantId, professionalId: ana.id, date: WED, kind: 'extra', startsAt: '10:00', endsAt: '12:00' });

    expect(await slots(db, ana.id, proc, WED)).toEqual(grid(WED, '10:00', '11:00', 30));
  });

  it('block e extra sobrepostos → bloqueio vence (fail-closed, D-3)', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addException(db, { tenantId, professionalId: ana.id, date: WED, kind: 'extra', startsAt: '10:00', endsAt: '14:00' });
    await addException(db, { tenantId, professionalId: ana.id, date: WED, kind: 'block', startsAt: '11:00', endsAt: '12:00' });

    expect(await slots(db, ana.id, proc, WED)).toEqual([`${WED} 10:00`, ...grid(WED, '12:00', '13:00', 30)]);
  });
});

describe('agendamentos existentes', () => {
  it('60 min às 14:00, passo 30 → somem 13:30, 14:00 e 14:30', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '13:00', endsAt: '16:00' });
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    expect(await slots(db, ana.id, proc, TUE)).toEqual([`${TUE} 13:00`, `${TUE} 15:00`]);
  });

  it('agendamento cancelado NÃO ocupa horário', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '13:00', endsAt: '16:00' });
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00', status: 'cancelled' });

    expect(await slots(db, ana.id, proc, TUE)).toEqual(grid(TUE, '13:00', '15:00', 30));
  });
});

describe('virando a meia-noite (D-7)', () => {
  it('sexta 20:00–02:00 → sábado de madrugada aparece', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '20:00', endsAt: '02:00' });

    const got = await slots(db, ana.id, proc, FRI, 2);
    expect(got).toContain(`${SAT} 00:30`);
    expect(got).toContain(`${SAT} 01:00`);
    expect(got).not.toContain(`${SAT} 01:30`); // 60 min não cabe antes das 02:00
  });

  it('slot que atravessa a meia-noite DENTRO do turno é oferecido (sexta 23:30 de 60 min)', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '22:00', endsAt: '02:00' });

    expect(await slots(db, ana.id, proc, FRI, 2)).toContain(`${FRI} 23:30`);
  });

  it('agendamento que atravessa a meia-noite ocupa o outro lado (sexta 23:30 bloqueia sábado 00:00)', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '22:00', endsAt: '02:00' });
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: FRI, time: '23:30' });

    const got = await slots(db, ana.id, proc, FRI, 2);
    expect(got).not.toContain(`${SAT} 00:00`);
    expect(got).toContain(`${SAT} 00:30`);
  });

  it('folga de dia inteiro na sexta leva junto a madrugada de sábado', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '20:00', endsAt: '02:00' });
    await addException(db, { tenantId, professionalId: ana.id, date: FRI, kind: 'block' });

    expect(await slots(db, ana.id, proc, FRI, 2)).toEqual([]);
  });

  it('block com horário no sábado 00:00–01:00 tira só isso', async () => {
    const proc = await createProcedure(db, tenantId, 30);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '22:00', endsAt: '02:00' });
    await addException(db, { tenantId, professionalId: ana.id, date: SAT, kind: 'block', startsAt: '00:00', endsAt: '01:00' });

    const sat = (await slots(db, ana.id, proc, SAT)).filter((s) => s.startsWith(SAT));
    expect(sat).toEqual([`${SAT} 01:00`, `${SAT} 01:30`]);
  });

  it('sábado 20:00–02:00 → a cauda cai no domingo, atravessando a virada da semana', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 6, startsAt: '20:00', endsAt: '02:00' });

    expect(await slots(db, ana.id, proc, SUN)).toContain(`${SUN} 00:30`);
  });

  it('turno que vira a noite sobrepondo o primeiro turno do dia seguinte → recusado', async () => {
    const first = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 5, startsAt: '20:00', endsAt: '02:00' });
    expect(first.error).toBeNull();
    const overlap = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 6, startsAt: '01:00', endsAt: '05:00' });
    expect(overlap.error).not.toBeNull();
  });

  it('turno de sábado que vira a noite sobrepondo o de domingo → recusado (virada da semana)', async () => {
    const first = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 6, startsAt: '22:00', endsAt: '03:00' });
    expect(first.error).toBeNull();
    const overlap = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 0, startsAt: '02:00', endsAt: '06:00' });
    expect(overlap.error).not.toBeNull();
  });
});

describe('hoje', () => {
  it('horário que já passou (em Brasília, não em UTC) não aparece', async () => {
    const proc = await createProcedure(db, tenantId, 15);
    for (let dow = 0; dow <= 6; dow++) {
      await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: dow, startsAt: '00:00', endsAt: '23:59' });
    }

    const now = new Date();
    const fmt = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...opts }).format(now);
    const today = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
    const nowHm = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

    const todays = (await slots(db, ana.id, proc, today)).filter((s) => s.startsWith(today));
    // Sem isto, lista vazia passaria sem provar nada. Só nos últimos 15 min do
    // dia é legítimo não sobrar horário.
    if (nowHm < '23:44') expect(todays.length).toBeGreaterThan(0);
    for (const s of todays) expect(s.slice(11) > nowHm).toBe(true);
  });
});

describe('segurança (SECURITY DEFINER + portão de tenant)', () => {
  it('profissional consultando COLEGA da mesma clínica vê a ocupação real, não "tudo livre"', async () => {
    const bia = await createProfessional(db, tenantId, { name: 'Bia' });
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: bia.id, dayOfWeek: 2, startsAt: '13:00', endsAt: '16:00' });
    await createAppointment(db, { tenantId, professionalId: bia.id, procedureId: proc, date: TUE, time: '14:00' });

    const asAna = await userClient(ana.email, ana.password);
    expect(await slots(asAna, bia.id, proc, TUE)).toEqual([`${TUE} 13:00`, `${TUE} 15:00`]);
  });

  it('profissional de OUTRA clínica → erro, não lista vazia', async () => {
    const otherTenant = await createTenant(db, 'Outra Clínica');
    const intrusa = await createProfessional(db, otherTenant, { name: 'Intrusa' });
    const proc = await createProcedure(db, tenantId, 60);
    await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '12:00' });

    const asIntrusa = await userClient(intrusa.email, intrusa.password);
    await expect(slots(asIntrusa, ana.id, proc, TUE)).rejects.toThrow(/cross-tenant/);
  });

  it('anônimo não executa o motor', async () => {
    const { localEnv } = await import('./helpers/db');
    const { createClient } = await import('@supabase/supabase-js');
    const { url, anonKey } = localEnv();
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const proc = await createProcedure(db, tenantId, 60);

    // Erro ESPECÍFICO: "função não existe" também é erro, e deixaria este teste
    // verde mesmo sem o revoke.
    await expect(slots(anon, ana.id, proc, TUE)).rejects.toThrow(/permission denied/);
  });
});

describe('expediente padrão (zero regressão)', () => {
  it('profissional nova nasce com 24h nos 7 dias — inclusive o slot que atravessa a meia-noite', async () => {
    const nova = await createProfessional(db, tenantId, { name: 'Nova', keepDefaultSchedule: true });
    const proc = await createProcedure(db, tenantId, 60);

    // 23:30 de 60 min termina 00:30 de quarta, que também é expediente.
    expect(await slots(db, nova.id, proc, TUE)).toEqual(grid(TUE, '00:00', '23:30', 30));
  });

  it('00:00–00:00 significa 24 horas, não zero', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const res = await addShift(db, { tenantId, professionalId: ana.id, dayOfWeek: 2, startsAt: '00:00', endsAt: '00:00' });
    expect(res.error).toBeNull();

    const got = await slots(db, ana.id, proc, TUE);
    expect(got[0]).toBe(`${TUE} 00:00`);
    expect(got.at(-1)).toBe(`${TUE} 23:00`); // quarta não tem expediente: 23:30 não cabe
  });
});

describe('check_appointment_conflict (lado da escrita)', () => {
  it('sobreposição no mesmo dia → conflito; encostado → livre', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    expect(await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: TUE, time: '14:30' })).toBe(true);
    expect(await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: TUE, time: '15:00' })).toBe(false);
    expect(await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: TUE, time: '13:00' })).toBe(false);
  });

  it('agendamento de sexta 23:30 (60 min) conflita com sábado 00:00 — antes passava, só olhava a mesma data', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: FRI, time: '23:30' });

    expect(await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: SAT, time: '00:00' })).toBe(true);
    expect(await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: SAT, time: '00:30' })).toBe(false);
  });

  it('o próprio agendamento não conflita consigo (remarcação)', async () => {
    const proc = await createProcedure(db, tenantId, 60);
    const appt = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TUE, time: '14:00' });

    expect(
      await hasConflict(db, { professionalId: ana.id, procedureId: proc, date: TUE, time: '14:30', ignoreAppointmentId: appt }),
    ).toBe(false);
  });
});
