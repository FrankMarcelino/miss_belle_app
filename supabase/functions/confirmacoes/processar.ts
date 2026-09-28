/**
 * O que a Edge Function `confirmacoes` faz com cada ação vencida (#8).
 *
 * Módulo puro: banco, Agent Builder e relógio chegam por parâmetro. É o que
 * deixa testar no vitest sem subir a função; `index.ts` só liga os fios.
 *
 * A regra que atravessa tudo: NA DÚVIDA, NÃO CANCELA. Se não deu para saber se
 * a cliente respondeu, o ciclo espera a próxima rodada em vez de liberar o
 * horário dela.
 */

export type Acao = {
  confirmacao_id: string;
  appointment_id: string;
  acao: 'primeiro' | 'segundo' | 'cancelar' | 'aviso_cancelamento';
  conversation_id: string | null;
  primeiro_envio_em: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  tenant_integration_id: string;
  agent_slug: string;
  livia_agent_id: string;
  livia_channel_id: string;
  texto: string;
};

type Resposta = { http: number; body: Record<string, unknown> };
type Resultado = 'enviado' | 'respondeu' | 'erro' | 'desistiu';

export type Dependencias = {
  proximas: (limite: number) => Promise<Acao[]>;
  registrar: (id: string, acao: Acao['acao'], resultado: Resultado, conversationId: string | null, erro: string | null) => Promise<void>;
  cancelar: (id: string) => Promise<{ ok: boolean; motivo?: string }>;
  iniciarConversa: (pedido: Record<string, string>) => Promise<Resposta>;
  respondeu: (conversationId: string, since: string) => Promise<Resposta>;
  esperar: (ms: number) => Promise<void>;
  aleatorio: () => number;
};

// Poucos por rodada e com intervalo aleatório: o canal é Evolution (WhatsApp não
// oficial), e rajada do mesmo número em segundos é o padrão que a Meta trata
// como spam. A rodada é a cada 15 min; a fila genérica é a gateway#278.
const POR_LOTE = 3;
const LOTES_POR_RODADA = 3;
const INTERVALO_MIN_MS = 10_000;
const INTERVALO_MAX_MS = 30_000;

const descreve = (r: Resposta) => `${r.http} ${String(r.body?.error ?? '')}`.trim();

// 4xx é recusa do pedido (número sem WhatsApp, contato silenciado): repetir não
// muda. 429 e 5xx passam: são do momento.
const permanente = (http: number) => http >= 400 && http < 500 && http !== 429;

export async function processarConfirmacoes(d: Dependencias): Promise<{ processadas: number }> {
  let processadas = 0;
  let enviou = false;

  const enviar = async (a: Acao): Promise<void> => {
    if (!a.cliente_telefone) {
      await d.registrar(a.confirmacao_id, a.acao, 'desistiu', null, 'sem telefone');
      return;
    }
    if (enviou) {
      await d.esperar(Math.round(INTERVALO_MIN_MS + d.aleatorio() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS)));
    }
    enviou = true;

    let r: Resposta;
    try {
      r = await d.iniciarConversa({
        tenant_integration_id: a.tenant_integration_id,
        agent_slug: a.agent_slug,
        livia_agent_id: a.livia_agent_id,
        channel_id: a.livia_channel_id,
        phone: a.cliente_telefone,
        contact_name: a.cliente_nome ?? '',
        message: a.texto,
      });
    } catch (err) {
      await d.registrar(a.confirmacao_id, a.acao, 'erro', null, String(err));
      return;
    }

    if (r.http === 200) {
      const conversa = typeof r.body?.conversation_id === 'string' ? r.body.conversation_id : a.conversation_id;
      await d.registrar(a.confirmacao_id, a.acao, 'enviado', conversa ?? null, null);
      return;
    }
    await d.registrar(a.confirmacao_id, a.acao, permanente(r.http) ? 'desistiu' : 'erro', null, descreve(r));
  };

  // true = pode seguir (não respondeu); false = parar aqui (respondeu ou não deu
  // para saber — e aí já registrou).
  const seguirSemResposta = async (a: Acao): Promise<boolean> => {
    if (!a.conversation_id || !a.primeiro_envio_em) return true;
    let r: Resposta;
    try {
      r = await d.respondeu(a.conversation_id, a.primeiro_envio_em);
    } catch (err) {
      await d.registrar(a.confirmacao_id, a.acao, 'erro', null, `respondeu? ${String(err)}`);
      return false;
    }
    if (r.http !== 200) {
      await d.registrar(a.confirmacao_id, a.acao, 'erro', null, `respondeu? ${descreve(r)}`);
      return false;
    }
    if (r.body?.replied === true) {
      await d.registrar(a.confirmacao_id, a.acao, 'respondeu', null, null);
      return false;
    }
    return true;
  };

  for (let lote = 0; lote < LOTES_POR_RODADA; lote++) {
    const acoes = await d.proximas(POR_LOTE);
    if (acoes.length === 0) break;

    for (const a of acoes) {
      processadas++;
      switch (a.acao) {
        case 'primeiro':
        case 'aviso_cancelamento':
          await enviar(a);
          break;
        case 'segundo':
          if (await seguirSemResposta(a)) await enviar(a);
          break;
        case 'cancelar':
          // O aviso à cliente vira uma ação própria (`aviso_cancelamento`) e sai
          // no próximo lote desta mesma rodada: se o envio falhar, o
          // cancelamento já está gravado e só o aviso é repetido.
          if (await seguirSemResposta(a)) await d.cancelar(a.confirmacao_id);
          break;
      }
    }
  }
  return { processadas };
}
