import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createTenant } from './helpers/fixtures';

/**
 * Chave de PLATAFORMA: uma credencial para o integrador (o Agent Builder) e o
 * tenant da LIVIA em cada chamada, no mesmo padrão do contrato LIVIA ↔ AB.
 *
 * O que decide a clínica deixa de ser a chave e passa a ser o vínculo
 * `tenants.livia_tenant_id`. O fusível é o que acontece quando o vínculo falta:
 * RECUSA. Nunca cair numa clínica "padrão" — foi assim que a agenda global do
 * AB marcaria a reunião de outro cliente na agenda da Miss Belle (LIVIA-AVOCADO/app#1237).
 */
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let db: SupabaseClient;

beforeEach(() => {
  db = serviceClient();
});

async function linkedClinic(name = 'Clínica Vinculada'): Promise<{ tenantId: string; livia: string }> {
  const tenantId = await createTenant(db, name);
  const livia = randomUUID();
  const { error } = await db.from('tenants').update({ livia_tenant_id: livia }).eq('id', tenantId);
  if (error) throw new Error(error.message);
  return { tenantId, livia };
}

async function issuePlatformKey(name = 'Agent Builder - Plataforma'): Promise<string> {
  const { data, error } = await db.rpc('api_issue_platform_key', { p_name: name });
  if (error) throw new Error(`api_issue_platform_key: ${error.message}`);
  return data as string;
}

async function issueClinicKey(tenantId: string): Promise<string> {
  const { data, error } = await db.rpc('api_issue_key', { p_tenant_id: tenantId, p_name: 'Agent Builder' });
  if (error) throw new Error(`api_issue_key: ${error.message}`);
  return data as string;
}

async function authenticate(key: string, livia: string | null = null): Promise<any> {
  const { data, error } = await db.rpc('api_authenticate', { p_key_hash: sha256(key), p_livia_tenant_id: livia });
  if (error) throw new Error(`api_authenticate: ${error.message}`);
  return data;
}

describe('emissão da chave de plataforma', () => {
  it('devolve a chave UMA vez, guarda só o hash e não pertence a clínica nenhuma', async () => {
    const key = await issuePlatformKey();
    expect(key).toMatch(/^mbp_[A-Za-z0-9_-]{40,}$/);

    const { data } = await db.from('api_keys').select('tenant_id, scope, key_hash').eq('key_hash', sha256(key)).single();
    expect(data).toEqual({ tenant_id: null, scope: 'platform', key_hash: sha256(key) });
  });

  it('chave de clínica não pode nascer sem clínica, nem a de plataforma com uma', async () => {
    const semClinica = await db.from('api_keys').insert({ name: 'x', key_hash: randomUUID(), scope: 'clinic' });
    expect(semClinica.error?.code).toBe('23514');

    const { tenantId } = await linkedClinic();
    const comClinica = await db.from('api_keys').insert({ name: 'x', key_hash: randomUUID(), scope: 'platform', tenant_id: tenantId });
    expect(comClinica.error?.code).toBe('23514');
  });
});

describe('autenticação com chave de plataforma', () => {
  it('resolve a clínica pelo tenant da LIVIA e marca o último uso', async () => {
    const { tenantId, livia } = await linkedClinic();
    const key = await issuePlatformKey();

    const caller = await authenticate(key, livia);
    expect(caller).toMatchObject({ tenantId });
    expect(caller.apiKeyId).toBeTruthy();

    const { data } = await db.from('api_keys').select('last_used_at').eq('key_hash', sha256(key)).single();
    expect(data?.last_used_at).not.toBeNull();
  });

  it('cada tenant da LIVIA cai na SUA clínica — a mesma chave não mistura agendas', async () => {
    const a = await linkedClinic('Clínica A');
    const b = await linkedClinic('Clínica B');
    const key = await issuePlatformKey();

    expect((await authenticate(key, a.livia)).tenantId).toBe(a.tenantId);
    expect((await authenticate(key, b.livia)).tenantId).toBe(b.tenantId);
  });

  it('sem tenant da LIVIA → TENANT_REQUIRED (não existe clínica padrão)', async () => {
    await linkedClinic();
    const key = await issuePlatformKey();
    expect(await authenticate(key, null)).toEqual({ error: 'TENANT_REQUIRED' });
  });

  it('tenant da LIVIA sem clínica vinculada → TENANT_NOT_LINKED', async () => {
    const key = await issuePlatformKey();
    expect(await authenticate(key, randomUUID())).toEqual({ error: 'TENANT_NOT_LINKED' });
  });

  it('clínica vinculada mas inativa → TENANT_NOT_LINKED', async () => {
    const { tenantId, livia } = await linkedClinic();
    await db.from('tenants').update({ is_active: false }).eq('id', tenantId);
    const key = await issuePlatformKey();
    expect(await authenticate(key, livia)).toEqual({ error: 'TENANT_NOT_LINKED' });
  });

  it('chave de plataforma revogada → nulo, como qualquer chave inválida', async () => {
    const { livia } = await linkedClinic();
    const key = await issuePlatformKey();
    await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('key_hash', sha256(key));
    expect(await authenticate(key, livia)).toBeNull();
  });
});

describe('chave de clínica continua valendo (compatibilidade)', () => {
  it('sem tenant da LIVIA: a chave decide a clínica, como antes', async () => {
    const { tenantId } = await linkedClinic();
    const key = await issueClinicKey(tenantId);
    expect((await authenticate(key, null)).tenantId).toBe(tenantId);
  });

  it('com o tenant da LIVIA que bate com a clínica da chave: passa', async () => {
    const { tenantId, livia } = await linkedClinic();
    const key = await issueClinicKey(tenantId);
    expect((await authenticate(key, livia)).tenantId).toBe(tenantId);
  });

  it('com tenant da LIVIA de OUTRA clínica → TENANT_MISMATCH', async () => {
    const a = await linkedClinic('Clínica A');
    const b = await linkedClinic('Clínica B');
    const key = await issueClinicKey(a.tenantId);
    expect(await authenticate(key, b.livia)).toEqual({ error: 'TENANT_MISMATCH' });
  });
});

describe('vínculo da clínica com a LIVIA', () => {
  it('um tenant da LIVIA atende uma clínica só', async () => {
    const { livia } = await linkedClinic('Clínica A');
    const outra = await createTenant(db, 'Clínica B');
    const { error } = await db.from('tenants').update({ livia_tenant_id: livia }).eq('id', outra);
    expect(error?.code).toBe('23505');
  });

  it('api_issue_key com p_livia_tenant_id grava o vínculo NA CLÍNICA', async () => {
    const tenantId = await createTenant(db);
    const livia = randomUUID();
    const { error } = await db.rpc('api_issue_key', { p_tenant_id: tenantId, p_name: 'AB', p_livia_tenant_id: livia });
    expect(error).toBeNull();

    const { data } = await db.from('tenants').select('livia_tenant_id').eq('id', tenantId).single();
    expect(data?.livia_tenant_id).toBe(livia);
  });

  it('api_issue_key não troca em silêncio um vínculo diferente', async () => {
    const { tenantId } = await linkedClinic();
    const { error } = await db.rpc('api_issue_key', { p_tenant_id: tenantId, p_name: 'AB', p_livia_tenant_id: randomUUID() });
    expect(error?.message).toMatch(/livia_tenant_id/);
  });
});
