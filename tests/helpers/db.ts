import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de teste apontado para o Supabase LOCAL.
 *
 * As credenciais vêm do ambiente, nunca do código — rode `supabase status`
 * e exporte SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de `npm test`.
 * (Os valores do ambiente local são fixos e públicos, mas mantê-los fora do
 * repo evita que alguém um dia cole aqui a chave de produção sem perceber.)
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Rode `supabase status` e exporte os dois.',
    );
  }
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Recusando rodar teste contra ${url} — só banco local.`);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
