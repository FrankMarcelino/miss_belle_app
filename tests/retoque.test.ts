import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createAppointment, createProcedure, createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Lembrete de retoque (#12, fatia 2).
 *
 * Quem teve o procedimento CONCLUÍDO há N dias recebe o lembrete no dia N — não
 * "todo mundo que já passou de N dias": ligar não dispara de uma vez para as
 * clientes dos últimos meses. Para sozinho se ela responder ou já tiver o
 * retoque do par marcado. Retoque não cancela nada.
 */
const PROC_EM = '2030-01-01'; // procedimento concluído (terça)
const DIA_40 = '2030-02-10';  // 40 dias depois

type Acao = { confirmacao_id: string; appointment_id: string; acao: string; tentativa: number | null; texto: string };

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;
let micro: string;
let manutencao: string;
let design: string;

async function proc(nome: string) {
  const id = await createProcedure(db, tenantId, 60);
  await db.from('procedures').update({ name: `${nome} ${randomUUID().slice(0, 8)}` }).eq('id', id);
  return id;
}

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana Paula' });
  micro = await proc('Micropigmentação');
  manutencao = await proc('Manutenção da Micro');
  design = await proc('Design');
  const { error } = await db.from('confirmation_settings').insert({
    tenant_id: tenantId, tenant_integration_id: 'integ-1', agent_slug: 'atendente-missbelle',
    livia_agent_id: '3fb1ee86-15c3-4891-8bba-d3ec917eadc1', livia_channel_id: 'a87ac6e0-fec7-4b6f-8c12-2f736324178c',
  });
  if (error) throw new Error(error.message);
});

async function configurar(campos: Record<string, unknown> = {}) {
  const { error } = await db.from('automated_messages').insert({
    tenant_id: tenantId, kind: 'retoque', enabled: true, send_time: '10:00', attempts: 2,
    interval_hours: 1, days_after: 40, interval_days: 15, on_no_reply: 'nada',
    procedure_pairs: [{ gatilho: micro, retoque: manutencao }],
    texts: ['Oi, {nome}! Já faz {dias} dias da sua {procedimento}. Vamos marcar o retoque?', 'Oi, {nome}! Lembrete do retoque 💖'],
    ...campos,
  });
  if (error) throw new Error(error.message);
}

async function acoes(agora: string, appt: string): Promise<Acao[]> {
  const { data, error } = await db.rpc('retoque_proximas_acoes', { p_limite: 1000, p_agora: agora });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Acao[]).filter((a) => a.appointment_id === appt);
}

async function registrar(id: string, acao: string, resultado: string, agora: string) {
  const { error } = await db.rpc('confirmacao_registrar', {
    p_confirmacao_id: id, p_acao: acao, p_resultado: resultado, p_conversation_id: null, p_erro: null, p_agora: agora,
  });
  if (error) throw new Error(error.message);
}

// createAppointment cria uma paciente nova a cada chamada; o retoque tem de ser
// da MESMA cliente do procedimento.
async function mesmaPaciente(de: string, para: string) {
  const { data } = await db.from('appointments').select('patient_id').eq('id', de).single();
  const { error } = await db.from('appointments').update({ patient_id: data?.patient_id }).eq('id', para);
  if (error) throw new Error(error.message);
}

const concluido = (procedureId = micro, date = PROC_EM) =>
  createAppointment(db, { tenantId, professionalId: ana.id, procedureId, date, time: '14:00', status: 'completed' });

describe('lembrete de retoque', () => {
  it('no dia 40, a partir do horário → primeiro, com o texto montado', async () => {
    await configurar();
    const appt = await concluido();

    expect(await acoes(`${DIA_40} 09:59:00`, appt)).toHaveLength(0);
    expect(await acoes('2030-02-09 10:30:00', appt)).toHaveLength(0); // dia 39
    const [a] = await acoes(`${DIA_40} 10:30:00`, appt);
    expect(a).toMatchObject({ acao: 'primeiro', tentativa: 1 });
    expect(a.texto).toMatch(/^Oi, Cliente! Já faz 40 dias da sua Micropigmentação .+\. Vamos marcar o retoque\?$/);
  });

  it('só no dia N: quem passou do dia (ligou depois) não recebe — sem enxurrada ao ligar', async () => {
    await configurar();
    const antigo = await concluido(micro, '2029-11-01');
    expect(await acoes(`${DIA_40} 10:30:00`, antigo)).toHaveLength(0);
  });

  it('2º lembrete 15 dias depois; e acabou (retoque não cancela)', async () => {
    await configurar();
    const appt = await concluido();
    const [a] = await acoes(`${DIA_40} 10:30:00`, appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', `${DIA_40} 10:30:00`);

    expect(await acoes('2030-02-24 10:30:00', appt)).toHaveLength(0);
    const [b] = await acoes('2030-02-25 10:30:00', appt);
    expect(b).toMatchObject({ acao: 'lembrete', tentativa: 2, texto: 'Oi, Cliente! Lembrete do retoque 💖' });
    await registrar(b.confirmacao_id, 'lembrete', 'enviado', '2030-02-25 10:30:00');

    expect(await acoes('2030-03-30 10:30:00', appt)).toHaveLength(0);
    const { data } = await db.from('appointments').select('status').eq('id', appt).single();
    expect(data?.status).toBe('completed');
  });

  it('já marcou o retoque do par → não envia', async () => {
    await configurar();
    const appt = await concluido();
    await mesmaPaciente(appt, await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: manutencao, date: '2030-02-20', time: '10:00', status: 'scheduled' }));
    expect(await acoes(`${DIA_40} 10:30:00`, appt)).toHaveLength(0);
  });

  it('marcou outra coisa (não o retoque do par) → envia mesmo assim', async () => {
    await configurar();
    const appt = await concluido();
    await mesmaPaciente(appt, await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: design, date: '2030-02-20', time: '10:00', status: 'scheduled' }));
    expect((await acoes(`${DIA_40} 10:30:00`, appt))[0]?.acao).toBe('primeiro');
  });

  it('procedimento fora dos pares, ou não concluído → nada', async () => {
    await configurar();
    const outro = await concluido(design);
    const agendado = await createAppointment(db, { tenantId, professionalId: ana.id, procedureId: micro, date: PROC_EM, time: '16:00', status: 'scheduled' });
    expect(await acoes(`${DIA_40} 10:30:00`, outro)).toHaveLength(0);
    expect(await acoes(`${DIA_40} 10:30:00`, agendado)).toHaveLength(0);
  });

  it('respondeu → para', async () => {
    await configurar();
    const appt = await concluido();
    const [a] = await acoes(`${DIA_40} 10:30:00`, appt);
    await registrar(a.confirmacao_id, 'primeiro', 'enviado', `${DIA_40} 10:30:00`);
    await registrar(a.confirmacao_id, 'lembrete', 'respondeu', '2030-02-25 10:30:00');
    expect(await acoes('2030-02-25 11:00:00', appt)).toHaveLength(0);
  });

  it('automação desligada → nada', async () => {
    await configurar({ enabled: false });
    const appt = await concluido();
    expect(await acoes(`${DIA_40} 10:30:00`, appt)).toHaveLength(0);
  });

  it('o ciclo de retoque não colide com o de confirmação do mesmo agendamento, e a confirmação não o pega', async () => {
    await configurar();
    const appt = await concluido();
    await db.from('appointment_confirmations').insert({ tenant_id: tenantId, appointment_id: appt, for_date: PROC_EM, for_time: '14:00' });
    expect((await acoes(`${DIA_40} 10:30:00`, appt))[0]?.acao).toBe('primeiro');

    const { data } = await db.rpc('confirmacao_proximas_acoes', { p_limite: 1000, p_agora: `${DIA_40} 10:35:00` });
    expect(((data ?? []) as Acao[]).filter((x) => x.appointment_id === appt)).toHaveLength(0);
  });

  it('retoque exige dias, pares e "sem resposta = nada"', async () => {
    const { error } = await db.from('automated_messages').insert({
      tenant_id: tenantId, kind: 'retoque', attempts: 1, texts: ['a'], on_no_reply: 'cancelar',
    });
    expect(error?.message).toMatch(/automated_messages_retoque_completo/);
  });
});
