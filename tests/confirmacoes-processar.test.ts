import { describe, expect, it, vi } from 'vitest';
import { processarConfirmacoes, type Acao, type Dependencias } from '../supabase/functions/confirmacoes/processar';

/**
 * O que a Edge Function `confirmacoes` faz com cada ação vencida (#8).
 *
 * A regra que atravessa tudo: NA DÚVIDA, NÃO CANCELA. Se não deu para saber se
 * a cliente respondeu, o ciclo espera a próxima rodada em vez de liberar o
 * horário dela.
 */
const base: Acao = {
  confirmacao_id: 'c1',
  appointment_id: 'a1',
  acao: 'primeiro',
  conversation_id: null,
  primeiro_envio_em: null,
  cliente_nome: 'Ana',
  cliente_telefone: '+5588999418111',
  tenant_integration_id: 'integ-1',
  agent_slug: 'atendente-missbelle',
  livia_agent_id: 'agente-livia',
  livia_channel_id: 'canal-livia',
  texto: 'Oi, Ana! Passando para confirmar…',
};

const CONV = '0f0e0d0c-0000-4000-8000-0000000000c1';

function deps(acoes: Acao[][], over: Partial<Dependencias> = {}): Dependencias {
  const lotes = [...acoes];
  return {
    proximas: vi.fn(async () => lotes.shift() ?? []),
    registrar: vi.fn(async () => undefined),
    cancelar: vi.fn(async () => ({ ok: true })),
    iniciarConversa: vi.fn(async () => ({ http: 200, body: { conversation_id: CONV, historico_gravado: true } })),
    respondeu: vi.fn(async () => ({ http: 200, body: { replied: false } })),
    esperar: vi.fn(async () => undefined),
    aleatorio: () => 0.5,
    ...over,
  };
}

describe('1º aviso', () => {
  it('envia pelo AB com os dados da integração e registra a conversa', async () => {
    const d = deps([[base]]);
    await processarConfirmacoes(d);

    expect(d.iniciarConversa).toHaveBeenCalledWith({
      tenant_integration_id: 'integ-1', agent_slug: 'atendente-missbelle', livia_agent_id: 'agente-livia',
      channel_id: 'canal-livia', phone: '+5588999418111', contact_name: 'Ana', message: base.texto,
    });
    expect(d.registrar).toHaveBeenCalledWith('c1', 'primeiro', 'enviado', CONV, null);
    expect(d.respondeu).not.toHaveBeenCalled();
  });

  it('sem telefone: desiste sem chamar o AB', async () => {
    const d = deps([[{ ...base, cliente_telefone: null }]]);
    await processarConfirmacoes(d);
    expect(d.iniciarConversa).not.toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'primeiro', 'desistiu', null, 'sem telefone');
  });

  it('4xx do AB (número sem WhatsApp) é permanente: desiste', async () => {
    const d = deps([[base]], {
      iniciarConversa: vi.fn(async () => ({ http: 422, body: { error: 'phone_not_on_whatsapp', permanent: true } })),
    });
    await processarConfirmacoes(d);
    expect(d.registrar).toHaveBeenCalledWith('c1', 'primeiro', 'desistiu', null, '422 phone_not_on_whatsapp');
  });

  it.each([[502], [504], [429]])('%i é transitório: registra erro para tentar de novo', async (http) => {
    const d = deps([[base]], { iniciarConversa: vi.fn(async () => ({ http, body: { error: 'x' } })) });
    await processarConfirmacoes(d);
    expect(d.registrar).toHaveBeenCalledWith('c1', 'primeiro', 'erro', null, `${http} x`);
  });

  it('exceção de rede também é transitória', async () => {
    const d = deps([[base]], { iniciarConversa: vi.fn(async () => { throw new Error('fetch failed'); }) });
    await processarConfirmacoes(d);
    expect(d.registrar).toHaveBeenCalledWith('c1', 'primeiro', 'erro', null, 'Error: fetch failed');
  });
});

describe('2º aviso', () => {
  const segundo: Acao = { ...base, acao: 'segundo', conversation_id: CONV, primeiro_envio_em: '2030-01-07T12:30:00+00:00' };

  it('pergunta se respondeu desde o 1º envio; não respondeu → envia', async () => {
    const d = deps([[segundo]]);
    await processarConfirmacoes(d);
    expect(d.respondeu).toHaveBeenCalledWith(CONV, '2030-01-07T12:30:00+00:00');
    expect(d.iniciarConversa).toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'segundo', 'enviado', CONV, null);
  });

  it('respondeu → registra e NÃO envia', async () => {
    const d = deps([[segundo]], { respondeu: vi.fn(async () => ({ http: 200, body: { replied: true } })) });
    await processarConfirmacoes(d);
    expect(d.iniciarConversa).not.toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'segundo', 'respondeu', null, null);
  });

  it('não deu para saber → erro, sem enviar', async () => {
    const d = deps([[segundo]], { respondeu: vi.fn(async () => ({ http: 504, body: { error: 'gateway_unreachable' } })) });
    await processarConfirmacoes(d);
    expect(d.iniciarConversa).not.toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'segundo', 'erro', null, 'respondeu? 504 gateway_unreachable');
  });
});

describe('cancelamento', () => {
  const cancelar: Acao = { ...base, acao: 'cancelar', conversation_id: CONV, primeiro_envio_em: '2030-01-07T12:30:00+00:00', texto: '' };
  const aviso: Acao = { ...base, acao: 'aviso_cancelamento', conversation_id: CONV, texto: 'Oi, Ana. Como não recebemos…' };

  it('não respondeu → cancela, e o aviso sai na mesma rodada', async () => {
    const d = deps([[cancelar], [aviso]]);
    await processarConfirmacoes(d);
    expect(d.cancelar).toHaveBeenCalledWith('c1');
    expect(d.iniciarConversa).toHaveBeenCalledTimes(1);
    expect(d.iniciarConversa).toHaveBeenCalledWith(expect.objectContaining({ message: aviso.texto }));
    expect(d.registrar).toHaveBeenCalledWith('c1', 'aviso_cancelamento', 'enviado', CONV, null);
  });

  it('respondeu → NÃO cancela', async () => {
    const d = deps([[cancelar]], { respondeu: vi.fn(async () => ({ http: 200, body: { replied: true } })) });
    await processarConfirmacoes(d);
    expect(d.cancelar).not.toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'cancelar', 'respondeu', null, null);
  });

  it('não deu para saber se respondeu → NÃO cancela (na dúvida, não mexe no horário)', async () => {
    const d = deps([[cancelar]], { respondeu: vi.fn(async () => { throw new Error('timeout'); }) });
    await processarConfirmacoes(d);
    expect(d.cancelar).not.toHaveBeenCalled();
    expect(d.registrar).toHaveBeenCalledWith('c1', 'cancelar', 'erro', null, 'respondeu? Error: timeout');
  });

  it('cancelamento recusado pelo banco (confirmou no último instante) → sem aviso', async () => {
    const d = deps([[cancelar]], { cancelar: vi.fn(async () => ({ ok: false, motivo: 'nao_esta_agendado' })) });
    await processarConfirmacoes(d);
    expect(d.iniciarConversa).not.toHaveBeenCalled();
  });
});

describe('ritmo', () => {
  it('espera um intervalo aleatório entre envios, não antes do primeiro', async () => {
    const d = deps([[base, { ...base, confirmacao_id: 'c2' }, { ...base, confirmacao_id: 'c3' }]]);
    await processarConfirmacoes(d);
    expect(d.iniciarConversa).toHaveBeenCalledTimes(3);
    expect(d.esperar).toHaveBeenCalledTimes(2);
    // aleatorio() = 0.5 → meio do intervalo de 10 a 30 s
    expect(d.esperar).toHaveBeenCalledWith(20_000);
  });

  it('para quando não há mais nada vencido', async () => {
    const d = deps([]);
    const r = await processarConfirmacoes(d);
    expect(r).toEqual({ processadas: 0 });
    expect(d.proximas).toHaveBeenCalledTimes(1);
  });
});
