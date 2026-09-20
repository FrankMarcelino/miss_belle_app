import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, userClient } from './helpers/db';
import { createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * Chave por integração: a chave é a prova de qual clínica é quem chama.
 * O banco guarda só o SHA-256; se a tabela vazar, as chaves não vazam.
 *
 * O hash é calculado aqui em JS de propósito: é o mesmo cálculo que a Edge
 * Function faz com o header Authorization.
 */
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana' });
});

async function issueKey(tenant = tenantId, name = 'Agent Builder'): Promise<string> {
  const { data, error } = await db.rpc('api_issue_key', { p_tenant_id: tenant, p_name: name });
  if (error) throw new Error(`api_issue_key: ${error.message}`);
  return data as string;
}

async function authenticate(key: string): Promise<string | null> {
  const { data, error } = await db.rpc('api_authenticate', { p_key_hash: sha256(key) });
  if (error) throw new Error(`api_authenticate: ${error.message}`);
  return data as string | null;
}

describe('emissão', () => {
  it('devolve a chave em texto UMA vez e guarda só o hash', async () => {
    const key = await issueKey();

    expect(key).toMatch(/^mb_[A-Za-z0-9_-]{40,}$/);

    // Sempre filtrar pela clínica do teste: outros arquivos também emitem chaves.
    const { data } = await db.from('api_keys').select('key_hash, tenant_id, name, revoked_at, last_used_at').eq('tenant_id', tenantId);
    expect(data).toHaveLength(1);
    expect(data![0].key_hash).toBe(sha256(key));
    expect(data![0].tenant_id).toBe(tenantId);
    expect(data![0].last_used_at).toBeNull();

    // A chave em texto não pode estar em lugar nenhum da linha.
    expect(JSON.stringify(data![0])).not.toContain(key);
  });

  it('duas emissões geram chaves diferentes', async () => {
    expect(await issueKey()).not.toBe(await issueKey(tenantId, 'Outra'));
  });
});

describe('autenticação', () => {
  it('chave válida devolve o tenant e marca o último uso', async () => {
    const key = await issueKey();

    expect(await authenticate(key)).toBe(tenantId);

    const { data } = await db.from('api_keys').select('last_used_at').eq('tenant_id', tenantId).single();
    expect(data?.last_used_at).not.toBeNull();
  });

  it('chave desconhecida devolve nulo', async () => {
    await issueKey();
    expect(await authenticate('mb_chave_que_nunca_existiu')).toBeNull();
  });

  it('chave revogada devolve nulo', async () => {
    const key = await issueKey();
    await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('key_hash', sha256(key));

    expect(await authenticate(key)).toBeNull();
  });

  it('clínica desativada devolve nulo — a chave sozinha não basta', async () => {
    const key = await issueKey();
    await db.from('tenants').update({ is_active: false }).eq('id', tenantId);

    expect(await authenticate(key)).toBeNull();
  });

  it('a chave de uma clínica nunca devolve outra', async () => {
    const outra = await createTenant(db, 'Outra Clínica');
    const keyOutra = await issueKey(outra, 'AB da outra');

    expect(await authenticate(keyOutra)).toBe(outra);
    expect(await authenticate(keyOutra)).not.toBe(tenantId);
  });
});

describe('quem enxerga a tabela', () => {
  it('profissional logada não lê api_keys (RLS sem nenhuma policy)', async () => {
    await issueKey();
    const asAna = await userClient(ana.email, ana.password);

    const { data } = await asAna.from('api_keys').select('id').eq('tenant_id', tenantId);
    expect(data).toEqual([]);
  });

  it('profissional logada não executa api_authenticate nem api_issue_key', async () => {
    const asAna = await userClient(ana.email, ana.password);

    const auth = await asAna.rpc('api_authenticate', { p_key_hash: sha256('x') });
    expect(auth.error?.message).toMatch(/permission denied/i);

    const issue = await asAna.rpc('api_issue_key', { p_tenant_id: tenantId, p_name: 'x' });
    expect(issue.error?.message).toMatch(/permission denied/i);
  });
});
