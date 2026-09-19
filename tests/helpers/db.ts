import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LocalEnv = { url: string; anonKey: string; serviceKey: string };

let cached: LocalEnv | undefined;

/**
 * Lê URL e chaves do Supabase LOCAL via `supabase status`, uma vez por processo.
 *
 * As chaves nunca ficam no código: vêm do CLI na hora. E o helper recusa
 * qualquer URL que não seja local — teste de contrato escreve e apaga dado,
 * e apontar isso para produção por engano seria o pior acidente possível.
 */
export function localEnv(): LocalEnv {
  if (cached) return cached;

  const raw = execSync('npx --yes supabase@latest status -o env', {
    cwd: new URL('../..', import.meta.url).pathname,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
  const vars = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );

  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error('`supabase status` não devolveu API_URL/ANON_KEY/SERVICE_ROLE_KEY. O banco local está de pé?');
  }
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Recusando rodar teste contra ${url} — só banco local.`);
  }

  cached = { url, anonKey, serviceKey };
  return cached;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente com service_role: bypassa RLS. Usado para montar fixture e como "a API". */
export function serviceClient(): SupabaseClient {
  const { url, serviceKey } = localEnv();
  return createClient(url, serviceKey, noSession);
}

/** Cliente logado como um usuário de verdade: RLS e auth.uid() valem. */
export async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const { url, anonKey } = localEnv();
  const client = createClient(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login de ${email} falhou: ${error.message}`);
  return client;
}
