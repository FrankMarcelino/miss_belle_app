import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createTenant } from './helpers/fixtures';

/**
 * Identidade da clínica: o antídoto para os dois ponteiros divergirem.
 *
 * O vínculo com a LIVIA vai existir dos dois lados (é inevitável: a LIVIA não
 * tem a chave para perguntar, e o diagnóstico nasce aqui). Este endpoint é o
 * que torna a divergência DETECTÁVEL — o AB confere na configuração, e o
 * suporte compara sem abrir o banco.
 */
const LIVIA_TENANT = '11111111-2222-3333-4444-555555555555';

let db: SupabaseClient;
let tenantId: string;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db, 'Clínica da Ana');
});

async function issue(livia: string | null = LIVIA_TENANT): Promise<string> {
  const { data, error } = await db.rpc('api_issue_key', {
    p_tenant_id: tenantId,
    p_name: 'Agent Builder',
    p_livia_tenant_id: livia,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

describe('emissão com vínculo', () => {
  it('guarda o tenant da LIVIA na chave', async () => {
    await issue();

    const { data } = await db.from('api_keys').select('livia_tenant_id').eq('tenant_id', tenantId).single();
    expect(data?.livia_tenant_id).toBe(LIVIA_TENANT);
  });

  it('o vínculo é opcional: chave sem LIVIA continua válida', async () => {
    await issue(null);

    const { data } = await db.from('api_keys').select('livia_tenant_id').eq('tenant_id', tenantId).single();
    expect(data?.livia_tenant_id).toBeNull();
  });
});

describe('api_clinic_identity', () => {
  it('responde quem é a clínica e a quem ela está vinculada', async () => {
    await issue();
    const { data: key } = await db.from('api_keys').select('id').eq('tenant_id', tenantId).single();

    const { data, error } = await db.rpc('api_clinic_identity', { p_tenant_id: tenantId, p_api_key_id: key!.id });
    expect(error).toBeNull();
    expect(data).toEqual({
      id: tenantId,
      name: 'Clínica da Ana',
      liviaTenantId: LIVIA_TENANT,
      timezone: 'America/Sao_Paulo',
    });
  });

  it('sem vínculo, liviaTenantId vem null — e não some do payload', async () => {
    await issue(null);
    const { data: key } = await db.from('api_keys').select('id').eq('tenant_id', tenantId).single();

    const { data } = await db.rpc('api_clinic_identity', { p_tenant_id: tenantId, p_api_key_id: key!.id });
    expect(data).toMatchObject({ liviaTenantId: null });
  });

  it('nunca devolve a chave, nem o hash dela', async () => {
    const chave = await issue();
    const { data: key } = await db.from('api_keys').select('id').eq('tenant_id', tenantId).single();

    const { data } = await db.rpc('api_clinic_identity', { p_tenant_id: tenantId, p_api_key_id: key!.id });
    const corpo = JSON.stringify(data);
    expect(corpo).not.toContain(chave);
    expect(corpo.toLowerCase()).not.toContain('hash');
  });
});
