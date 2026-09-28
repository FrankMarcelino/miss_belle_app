import { describe, expect, it } from 'vitest';
import { serviceClient } from './helpers/db';

/**
 * O disparo do pg_cron (#8). Sem a URL e o segredo no Vault, não chama nada:
 * é uma das cinco chaves que precisam estar postas para a confirmação sair
 * (Vault, segredos da Edge Function, confirmation_settings, profissional
 * ligada, data de início).
 */
describe('confirmacoes_disparar', () => {
  it('sem os segredos no Vault → não dispara', async () => {
    const { data, error } = await serviceClient().rpc('confirmacoes_disparar');
    expect(error).toBeNull();
    expect(data).toBe('sem_configuracao');
  });
});
