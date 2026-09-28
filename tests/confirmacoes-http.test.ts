import { describe, expect, it } from 'vitest';
import { localEnv } from './helpers/db';

/**
 * A Edge Function `confirmacoes` de verdade (#8), servida pelo Deno.
 *
 * Prova que ela compila e sobe — e a trava fail-closed: sem os segredos
 * (CONFIRMACOES_CRON_SECRET, AB_BASE_URL, AB_OUTBOUND_KEY), recusa sem tocar em
 * nada. Uma função que manda mensagem e cancela horário não roda meio
 * configurada. O comportamento com cada resposta está em confirmacoes-processar.
 */
describe('POST /functions/v1/confirmacoes', () => {
  it('sem os segredos configurados → 503 not_configured', async () => {
    const res = await fetch(`${localEnv().url}/functions/v1/confirmacoes`, {
      method: 'POST',
      headers: { Authorization: 'Bearer qualquer-coisa' },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });
});
