import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Confirmação automática 24 h antes (#8).
 *
 * 09:00 do dia anterior sai o 1º aviso; sem resposta em 4 h, o 2º; sem resposta
 * em mais 4 h, o agendamento é cancelado e a cliente é avisada. Qualquer
 * resposta dela suspende tudo. Vale por PROFISSIONAL (chave + data de início) e
 * por clínica (dados da integração com a LIVIA).
 *
 * O relógio é injetado (`p_agora`, horário de Brasília) para as janelas não
 * dependerem da hora em que o teste roda.
 */
const SEG_0930 = '2030-01-07 09:30:00'; // segunda
const TER = '2030-01-08';

type Acao = {
  confirmacao_id: string;
  appointment_id: string;
  acao: 'primeiro' | 'lembrete' | 'cancelar' | 'aviso_cancelamento';
  tentativa: number | null;
  conversation_id: string | null;
  primeiro_envio_em: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  procedimento: string;
  profissional: string;
  data: string;
  hora: string;
  tenant_integration_id: string;
  agent_slug: string;
  livia_agent_id: string;
  livia_channel_id: string;
  texto: string;
};

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let proc: string;
let procNome: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana Paula' });
  proc = await createProcedure(db, tenantId, 60);
  // procedures.name é UNIQUE no banco inteiro (não por clínica — pendência
  // conhecida): o nome precisa ser único a cada teste.
  procNome = `Design ${randomUUID().slice(0, 8)}`;
  const { error: e } = await db.from('procedures').update({ name: procNome }).eq('id', proc);
  if (e) throw new Error(e.message);
  await db.from('profiles').update({ confirmation_enabled: true, confirmation_starts_on: '2030-01-01' }).eq('id', ana.id);
  const { error } = await db.from('confirmation_settings').insert({
    tenant_id: tenantId,
    tenant_integration_id: 'integ-1',
    agent_slug: 'atendente-missbelle',
    livia_agent_id: '3fb1ee86-15c3-4891-8bba-d3ec917eadc1',
    livia_channel_id: 'a87ac6e0-fec7-4b6f-8c12-2f736324178c',
  });
  if (error) throw new Error(error.message);
  // #12: a automação da clínica, com os padrões (09:00, 2 tentativas, 4 h, cancelar).
  const { error: eAuto } = await db.from('automated_messages').insert({ tenant_id: tenantId, kind: 'confirmacao', enabled: true });
  if (eAuto) throw new Error(eAuto.message);
});

// Limite alto: o banco local acumula clínicas de outros testes, e um limite
// baixo poderia ser consumido por elas. Cada teste filtra pelo agendamento.
async function proximas(agora: string, limite = 1000): Promise<Acao[]> {
  const { data, error } = await db.rpc('confirmacao_proximas_acoes', { p_limite: limite, p_agora: agora });
  if (error) throw new Error(error.message);
  return (data ?? []) as Acao[];
}

async function registrar(id: string, acao: string, resultado: string, agora: string, conversa: string | null = null, erro: string | null = null) {
  const { error } = await db.rpc('confirmacao_registrar', {
    p_confirmacao_id: id, p_acao: acao, p_resultado: resultado, p_conversation_id: conversa, p_erro: erro, p_agora: agora,
  });
  if (error) throw new Error(error.message);
}

async function cancelar(id: string, agora: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data, error } = await db.rpc('confirmacao_cancelar_agendamento', { p_confirmacao_id: id, p_agora: agora });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; motivo?: string };
}

const agendado = (time = '15:00', date = TER) =>
  createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date, time, status: 'scheduled' });

const doTenant = (acoes: Acao[], appt: string) => acoes.filter((a) => a.appointment_id === appt);

describe('1º aviso', () => {
  it('agendado de amanhã, profissional ligada, dentro da janela → primeiro, com os dados do texto', async () => {
    const appt = await agendado();
    const [a, ...resto] = doTenant(await proximas(SEG_0930), appt);

    expect(resto).toHaveLength(0);
    expect(a).toMatchObject({
      acao: 'primeiro', cliente_nome: 'Cliente', cliente_telefone: '+5588999990000',
      procedimento: procNome, profissional: 'Ana Paula', hora: '15:00',
      tenant_integration_id: 'integ-1', agent_slug: 'atendente-missbelle',
    });
    expect(a.texto).toContain('Oi, Cliente!');
    expect(a.texto).toContain(`${procNome} amanhã, terça-feira, 08/01, às 15:00, com a Ana Paula`);
  });

  it('pedir de novo logo em seguida não devolve o mesmo (reserva)', async () => {
    const appt = await agendado();
    await proximas(SEG_0930);
    expect(doTenant(await proximas('2030-01-07 09:31:00'), appt)).toHaveLength(0);
  });

  it.each([
    ['profissional desligada', { confirmation_enabled: false }],
    ['sem data de início', { confirmation_starts_on: null }],
    ['data de início depois do agendamento', { confirmation_starts_on: '2030-01-09' }],
  ])('%s → nada', async (_, patch) => {
    const appt = await agendado();
    await db.from('profiles').update(patch).eq('id', ana.id);
    expect(doTenant(await proximas(SEG_0930), appt)).toHaveLength(0);
  });

  it.each([['08:59'], ['13:00']])('fora da janela 09:00–13:00 (%s) → nada', async (hora) => {
    const appt = await agendado();
    expect(doTenant(await proximas(`2030-01-07 ${hora}:00`), appt)).toHaveLength(0);
  });

  it('já confirmado, ou não é amanhã → nada', async () => {
    const confirmado = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: proc, date: TER, time: '10:00', status: 'confirmed' });
    const depois = await agendado('10:00', '2030-01-09');
    const acoes = await proximas(SEG_0930);
    expect(doTenant(acoes, confirmado)).toHaveLength(0);
    expect(doTenant(acoes, depois)).toHaveLength(0);
  });

  it('clínica sem configuração da integração → nada', async () => {
    const appt = await agendado();
    await db.from('confirmation_settings').delete().eq('tenant_id', tenantId);
    expect(doTenant(await proximas(SEG_0930), appt)).toHaveLength(0);
  });
});

describe('relógio 4 h + 4 h', () => {
  it('enviado às 09:30: nada às 13:29; segundo às 13:30', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930, '0f0e0d0c-0000-4000-8000-0000000000c1');

    expect(doTenant(await proximas('2030-01-07 13:29:00'), appt)).toHaveLength(0);
    const [s] = doTenant(await proximas('2030-01-07 13:30:00'), appt);
    expect(s).toMatchObject({ acao: 'lembrete', tentativa: 2, conversation_id: '0f0e0d0c-0000-4000-8000-0000000000c1' });
    expect(s.primeiro_envio_em).toMatch(/2030-01-07T12:30:00/); // 09:30 de Brasília em UTC
    expect(s.texto).toContain('o horário é liberado hoje às 17:30');
  });

  it('segundo enviado: às 17:30 cancela; depois avisa a cliente; e acabou', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930, '0f0e0d0c-0000-4000-8000-0000000000c1');
    await registrar(a.confirmacao_id, 'lembrete', 'enviado', '2030-01-07 13:30:00');

    expect(doTenant(await proximas('2030-01-07 17:29:00'), appt)).toHaveLength(0);
    const [c] = doTenant(await proximas('2030-01-07 17:30:00'), appt);
    expect(c.acao).toBe('cancelar');

    expect(await cancelar(c.confirmacao_id, '2030-01-07 17:30:00')).toEqual({ ok: true });
    const { data } = await db.from('appointments').select('status, cancellation_reason').eq('id', appt).single();
    expect(data?.status).toBe('cancelled');
    expect(data?.cancellation_reason).toMatch(/confirmação/i);

    const [aviso] = doTenant(await proximas('2030-01-07 17:31:00'), appt);
    expect(aviso.acao).toBe('aviso_cancelamento');
    expect(aviso.texto).toContain('o seu horário de amanhã às 15:00 foi liberado');
    await registrar(aviso.confirmacao_id, 'aviso_cancelamento', 'enviado', '2030-01-07 17:31:00');
    expect(doTenant(await proximas('2030-01-07 20:00:00'), appt)).toHaveLength(0);
  });

  it('respondeu: nunca mais sai nada', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930);
    await registrar(a.confirmacao_id, 'lembrete', 'respondeu', '2030-01-07 13:30:00');
    expect(doTenant(await proximas('2030-01-07 13:31:00'), appt)).toHaveLength(0);
    expect(doTenant(await proximas('2030-01-07 20:00:00'), appt)).toHaveLength(0);
  });

  it('confirmou (status mudou) depois do 1º: não há 2º nem cancelamento', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930);
    await db.from('appointments').update({ status: 'confirmed' }).eq('id', appt);
    expect(doTenant(await proximas('2030-01-07 13:30:00'), appt)).toHaveLength(0);
  });

  it('remarcado depois do 1º: o ciclo antigo não cancela o horário novo', async () => {
    const appt = await agendado('15:00');
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930);
    await registrar(a.confirmacao_id, 'lembrete', 'enviado', '2030-01-07 13:30:00');
    await db.from('appointments').update({ appointment_time: '16:00' }).eq('id', appt);

    const acoes = doTenant(await proximas('2030-01-07 17:30:00'), appt);
    expect(acoes.find((x) => x.acao === 'cancelar')).toBeUndefined();
  });
});

describe('cancelamento', () => {
  it('com pagamento registrado não cancela: fica para a equipe e o ciclo para', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930);
    await registrar(a.confirmacao_id, 'lembrete', 'enviado', '2030-01-07 13:30:00');
    await db.from('appointments').update({ has_payment: true }).eq('id', appt);

    const [c] = doTenant(await proximas('2030-01-07 17:30:00'), appt);
    expect(await cancelar(c.confirmacao_id, '2030-01-07 17:30:00')).toEqual({ ok: false, motivo: 'requer_equipe' });
    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).toBe('scheduled');
    expect(doTenant(await proximas('2030-01-07 18:00:00'), appt)).toHaveLength(0);
  });

  it('a cliente confirmou no último instante: o cancelamento não vence', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', SEG_0930);
    await registrar(a.confirmacao_id, 'lembrete', 'enviado', '2030-01-07 13:30:00');
    const [c] = doTenant(await proximas('2030-01-07 17:30:00'), appt);
    await db.from('appointments').update({ status: 'confirmed' }).eq('id', appt);

    expect(await cancelar(c.confirmacao_id, '2030-01-07 17:30:00')).toEqual({ ok: false, motivo: 'nao_esta_agendado' });
    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).toBe('confirmed');
  });
});

describe('falhas de envio', () => {
  it('erro transitório: tenta de novo depois de 15 min; no 5º desiste', async () => {
    const appt = await agendado();
    let [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'erro', SEG_0930, null, '502 send_failed');
    expect(doTenant(await proximas('2030-01-07 09:40:00'), appt)).toHaveLength(0);

    let agora = new Date('2030-01-07T09:45:00');
    for (let i = 2; i <= 5; i++) {
      const hhmm = agora.toTimeString().slice(0, 5);
      [a] = doTenant(await proximas(`2030-01-07 ${hhmm}:00`), appt);
      expect(a?.acao).toBe('primeiro');
      await registrar(a.confirmacao_id, 'primeiro', 'erro', `2030-01-07 ${hhmm}:00`, null, '502 send_failed');
      agora = new Date(agora.getTime() + 16 * 60_000);
    }
    const { data } = await db.from('appointment_confirmations').select('attempts, gave_up_at, last_error').eq('appointment_id', appt).single();
    expect(data).toMatchObject({ attempts: 5, last_error: '502 send_failed' });
    expect(data?.gave_up_at).not.toBeNull();
  });

  it('erro permanente (número sem WhatsApp): desiste na hora e nunca cancela', async () => {
    const appt = await agendado();
    const [a] = doTenant(await proximas(SEG_0930), appt);
    await registrar(a.confirmacao_id, 'primeiro', 'desistiu', SEG_0930, null, '422 phone_not_on_whatsapp');
    expect(doTenant(await proximas('2030-01-07 17:30:00'), appt)).toHaveLength(0);
    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).toBe('scheduled');
  });
});
