import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * A chave nunca vai ao banco em texto: o que trafega é o SHA-256 dela, o mesmo
 * que api_issue_key gravou. Assim a chave não entra em log de query.
 */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cabeçalho com o tenant da LIVIA. Obrigatório com a chave de plataforma. */
export const LIVIA_TENANT_HEADER = 'X-Livia-Tenant-Id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Caller {
  tenantId: string;
  apiKeyId: string;
}

/**
 * Por que a chamada foi recusada, quando a chave existe mas não leva a uma
 * clínica. Chave ausente, inválida ou revogada NÃO entra aqui: essas respondem
 * todas igual (401), para não dizer se a chave existe.
 */
export type AuthRefusal =
  | 'INVALID_TENANT_HEADER' // cabeçalho presente, mas não é uuid
  | 'TENANT_REQUIRED' //       chave de plataforma sem cabeçalho
  | 'TENANT_NOT_LINKED' //     tenant da LIVIA sem clínica vinculada (ou inativa)
  | 'TENANT_MISMATCH'; //      chave de clínica com o cabeçalho de outra clínica

export type AuthResult = { caller: Caller } | { refusal: AuthRefusal } | null;

/**
 * Devolve a clínica e a chave que entrou, o motivo da recusa, ou null.
 *
 * Duas formas de chegar a uma clínica:
 * - chave de clínica: a chave decide (o cabeçalho, se vier, só é conferido);
 * - chave de plataforma: o cabeçalho decide, pelo vínculo `tenants.livia_tenant_id`.
 *   Sem vínculo, recusa — não existe clínica padrão.
 */
export async function authenticate(req: Request, admin: SupabaseClient): Promise<AuthResult> {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const livia = req.headers.get(LIVIA_TENANT_HEADER)?.trim() || null;
  if (livia !== null && !UUID.test(livia)) return { refusal: 'INVALID_TENANT_HEADER' };

  const { data, error } = await admin.rpc('api_authenticate', {
    p_key_hash: await sha256(match[1].trim()),
    p_livia_tenant_id: livia,
  });
  if (error || !data) return null;
  if (typeof data.error === 'string') return { refusal: data.error as AuthRefusal };
  return { caller: data as Caller };
}
