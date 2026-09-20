import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * A chave nunca vai ao banco em texto: o que trafega é o SHA-256 dela, o mesmo
 * que api_issue_key gravou. Assim a chave não entra em log de query.
 */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Devolve o tenant da chave, ou null. Não conta por que falhou. */
export async function authenticate(req: Request, admin: SupabaseClient): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data, error } = await admin.rpc('api_authenticate', { p_key_hash: await sha256(match[1].trim()) });
  if (error) return null;
  return (data as string | null) ?? null;
}
