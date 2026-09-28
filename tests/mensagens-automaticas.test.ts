import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, userClient } from './helpers/db';
import { createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Mensagens automáticas (#12): a confirmação da véspera deixa de ter números
 * fixos no código. Horário, tentativas, intervalo, o que fazer sem resposta e
 * os textos vêm da configuração da clínica — e qualquer usuária da clínica edita.
 */
const TER = '2030-01-08';

type Acao = { confirmacao_id: string; appointment_id: string; acao: string; tentativa: number | null; texto: string };

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana Paula' });
  proc = await createProcedure(db, tenantId, 60);
  await db.from('procedures').update({ name: `Design ${randomUUID().slice(0, 8)}` }).eq('id', proc);
  await db.from('profiles').update({ confirmation_enabled: true, confirmation_starts_on: '2030-01-01' }).eq('id', ana.id);
  const { error } = await db.from('confirmation_settings').insert({
    tenant_id: tenantId, tenant_integration_id: 'integ-1', agent_slug: 'atendente-missbelle',
    livia_agent_id: '3fb1ee86-15c3-4891-8bba-d3ec917eadc1', livia_channel_id: 'a87ac6e0-fec7-4b6f-8c12-2f736324178c',
  });
  if (error) throw new Error(error.message);
});

async function configurar(campos: Record<string, unknown>) {
  const { error } = await db.from('automated_messages').insert({ tenant_id: tenantId, kind: 'confirmacao', enabled: true, ...campos });
  if (error) throw new Error(error.message);
}

async function acoes(agora: string, appt: string): Promise<Acao[]> {
  const { data, error } = await db.rpc('confirmacao_proximas_acoes', { p_limite: 1000, p_agora: agora });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Acao[]).filter((a) => a.appointment_id === appt);
}

async function registrar(id: string, acao: string, agora: string) {
  const { error } = await db.rpc('confirmacao_registrar', {
    p_confirmacao_id: id, p_acao: acao, p_resultado: 'enviado', p_conversation_id: null, p_erro: null, p_agora: agora,
  });
  if (error) throw new Error(error.message);
}

const agendado = () => createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TER, time: '15:00', status: 'scheduled' });

describe('configuração da confirmação', () => {
  it('sem a automação da clínica → nada sai (fail-closed)', async () => {
    const appt = await agendado();
    expect(await acoes('2030-01-07 09:30:00', appt)).toHaveLength(0);
  });

  it('automação desligada → nada sai', async () => {
    await configurar({ enabled: false });
    const appt = await agendado();
    expect(await acoes('2030-01-07 09:30:00', appt)).toHaveLength(0);
  });

  it('08:00, 3 tentativas a cada 2 h: 08:30 → 10:30 → 12:30 → cancela às 14:30', async () => {
    await configurar({
      send_time: '08:00', attempts: 3, interval_hours: 2,
      texts: ['Um {nome}', 'Dois {nome}', 'Três {nome}, liberado às {hora_cancelamento}'],
    });
    const appt = await agendado();

    expect(await acoes('2030-01-07 07:59:00', appt)).toHaveLength(0);
    const [a1] = await acoes('2030-01-07 08:30:00', appt);
    expect(a1).toMatchObject({ acao: 'primeiro', tentativa: 1, texto: 'Um Cliente' });
    await registrar(a1.confirmacao_id, 'primeiro', '2030-01-07 08:30:00');

    expect(await acoes('2030-01-07 10:29:00', appt)).toHaveLength(0);
    const [a2] = await acoes('2030-01-07 10:30:00', appt);
    expect(a2).toMatchObject({ acao: 'lembrete', tentativa: 2, texto: 'Dois Cliente' });
    await registrar(a2.confirmacao_id, 'lembrete', '2030-01-07 10:30:00');

    const [a3] = await acoes('2030-01-07 12:30:00', appt);
    expect(a3).toMatchObject({ acao: 'lembrete', tentativa: 3, texto: 'Três Cliente, liberado às 14:30' });
    await registrar(a3.confirmacao_id, 'lembrete', '2030-01-07 12:30:00');

    expect(await acoes('2030-01-07 14:29:00', appt)).toHaveLength(0);
    const [c] = await acoes('2030-01-07 14:30:00', appt);
    expect(c.acao).toBe('cancelar');
  });

  it('janela do 1º envio: do horário até horário + intervalo', async () => {
    await configurar({ send_time: '08:00', interval_hours: 2 });
    const appt = await agendado();
    expect(await acoes('2030-01-07 10:00:00', appt)).toHaveLength(0);
    expect((await acoes('2030-01-07 09:59:00', appt))[0]?.acao).toBe('primeiro');
  });

  it('sem resposta = "nada": depois da última tentativa, para sem cancelar', async () => {
    await configurar({ on_no_reply: 'nada' });
    const appt = await agendado();
    const [a1] = await acoes('2030-01-07 09:30:00', appt);
    await registrar(a1.confirmacao_id, 'primeiro', '2030-01-07 09:30:00');
    const [a2] = await acoes('2030-01-07 13:30:00', appt);
    await registrar(a2.confirmacao_id, 'lembrete', '2030-01-07 13:30:00');
    expect(await acoes('2030-01-07 20:00:00', appt)).toHaveLength(0);
  });

  it('um texto por tentativa: 3 tentativas com 2 textos é recusado', async () => {
    const { error } = await db.from('automated_messages').insert({
      tenant_id: tenantId, kind: 'confirmacao', attempts: 3, texts: ['a', 'b'],
    });
    expect(error?.message).toMatch(/automated_messages_textos_por_tentativa/);
  });
});

describe('quem edita', () => {
  it('qualquer usuária da clínica lê e altera; outra clínica não enxerga', async () => {
    await configurar({});
    const colega = await createProfessional(db, tenantId, { name: 'Colega' });
    const asColega = await userClient(colega.email, colega.password);

    const { data: lida } = await asColega.from('automated_messages').select('kind, send_time').eq('tenant_id', tenantId);
    expect(lida).toEqual([{ kind: 'confirmacao', send_time: '09:00:00' }]);

    const { error: eUpd } = await asColega.from('automated_messages').update({ send_time: '10:00' }).eq('tenant_id', tenantId);
    expect(eUpd).toBeNull();
    const { data: depois } = await db.from('automated_messages').select('send_time').eq('tenant_id', tenantId).single();
    expect(depois?.send_time).toBe('10:00:00');

    const outra = await createTenant(db, 'Outra');
    const estranha = await createProfessional(db, outra, { name: 'Estranha' });
    const asEstranha = await userClient(estranha.email, estranha.password);
    const { data: nada } = await asEstranha.from('automated_messages').select('kind').eq('tenant_id', tenantId);
    expect(nada).toEqual([]);
    await asEstranha.from('automated_messages').update({ send_time: '06:00' }).eq('tenant_id', tenantId);
    const { data: intacta } = await db.from('automated_messages').select('send_time').eq('tenant_id', tenantId).single();
    expect(intacta?.send_time).toBe('10:00:00');
  });
});
