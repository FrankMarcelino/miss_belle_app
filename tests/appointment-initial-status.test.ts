import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';

/**
 * Status com que o agendamento da IA nasce (#7).
 *
 * Com mais de 30 h até o horário, nasce `scheduled`: 24 h antes sai a mensagem
 * de confirmação e só a resposta da cliente o torna `confirmed`. Com 30 h ou
 * menos não haverá essa mensagem, então nasce `confirmed`.
 */

let db: SupabaseClient;

beforeAll(() => {
  db = serviceClient();
});

// Data e hora locais (America/Sao_Paulo) daqui a `horas`.
function localDaqui(horas: number): { date: string; time: string } {
  const alvo = new Date(Date.now() + horas * 3600_000);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(alvo);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return { date: `${p('year')}-${p('month')}-${p('day')}`, time: `${p('hour')}:${p('minute')}` };
}

async function statusInicial(horas: number): Promise<string> {
  const { date, time } = localDaqui(horas);
  const { data, error } = await db.rpc('appointment_initial_status', { p_date: date, p_time: time });
  if (error) throw error;
  return data as string;
}

describe('appointment_initial_status', () => {
  it('mais de 30 h até o horário → scheduled (a confirmação de 24 h ainda vai sair)', async () => {
    expect(await statusInicial(48)).toBe('scheduled');
    expect(await statusInicial(31)).toBe('scheduled');
  });

  it('30 h ou menos → confirmed (não haverá mensagem de confirmação)', async () => {
    expect(await statusInicial(29)).toBe('confirmed');
    expect(await statusInicial(20)).toBe('confirmed');
  });
});
