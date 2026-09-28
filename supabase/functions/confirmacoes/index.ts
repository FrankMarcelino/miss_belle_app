import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processarConfirmacoes, type Acao } from './processar.ts';

/**
 * Confirmação automática 24 h antes (#8) — chamada pelo pg_cron a cada 15 min.
 *
 * Fina de propósito: a regra de QUANDO vive no banco (confirmacao_proximas_acoes)
 * e a de O QUE FAZER com cada resposta vive em processar.ts, testado no vitest.
 * Aqui só se liga banco, Agent Builder e relógio.
 *
 * Fail-closed: sem os segredos, recusa. Uma função que manda mensagem e cancela
 * horário de cliente não roda "meio configurada".
 *
 * Segredos (supabase secrets set):
 *   CONFIRMACOES_CRON_SECRET  quem chama (o pg_cron) manda no Authorization
 *   AB_BASE_URL               agent-runtime (ex.: https://…/api/outbound)
 *   AB_OUTBOUND_KEY           OUTBOUND_INTERNAL_KEY do agent-runtime
 */
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  const segredo = Deno.env.get('CONFIRMACOES_CRON_SECRET') ?? '';
  const abBase = (Deno.env.get('AB_BASE_URL') ?? '').replace(/\/+$/, '');
  const abKey = Deno.env.get('AB_OUTBOUND_KEY') ?? '';
  if (!segredo || !abBase || !abKey) {
    console.error('confirmacoes: segredos ausentes — nada feito');
    return json(503, { error: 'not_configured' });
  }
  if (req.headers.get('Authorization') !== `Bearer ${segredo}`) {
    return json(401, { error: 'unauthorized' });
  }

  const ab = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const res = await fetch(`${abBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${abKey}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    return { http: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  const resultado = await processarConfirmacoes({
    proximas: async (limite) => {
      const { data, error } = await admin.rpc('confirmacao_proximas_acoes', { p_limite: limite });
      if (error) throw new Error(`confirmacao_proximas_acoes: ${error.message}`);
      return (data ?? []) as Acao[];
    },
    registrar: async (id, acao, res, conversationId, erro) => {
      const { error } = await admin.rpc('confirmacao_registrar', {
        p_confirmacao_id: id, p_acao: acao, p_resultado: res, p_conversation_id: conversationId, p_erro: erro,
      });
      if (error) console.error('confirmacoes: falha ao registrar', { id, acao, res, error: error.message });
    },
    cancelar: async (id) => {
      const { data, error } = await admin.rpc('confirmacao_cancelar_agendamento', { p_confirmacao_id: id });
      if (error) throw new Error(`confirmacao_cancelar_agendamento: ${error.message}`);
      return data as { ok: boolean; motivo?: string };
    },
    iniciarConversa: (pedido) => ab('POST', '/conversations/start', pedido),
    respondeu: (conversationId, since) =>
      ab('GET', `/conversations/${encodeURIComponent(conversationId)}/customer-reply?since=${encodeURIComponent(since)}`),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
    aleatorio: Math.random,
  });

  console.log('confirmacoes: rodada', resultado);
  return json(200, resultado);
});
