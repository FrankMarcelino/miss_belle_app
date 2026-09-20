import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from './helpers/db';
import { createProfessional, createTenant, type Professional } from './helpers/fixtures';

/**
 * normalize_br_phone: forma canônica E.164 com o 9º dígito.
 *
 * Os formatos testados são os MEDIDOS em produção (19/09, 3.785 clientes):
 * 78,6% DDD+9 dígitos, 20,2% celular sem o 9, e um punhado de lixo.
 */
async function normalize(db: SupabaseClient, phone: string | null): Promise<string | null> {
  const { data, error } = await db.rpc('normalize_br_phone', { p_phone: phone });
  if (error) throw new Error(`normalize_br_phone: ${error.message}`);
  return data as string | null;
}

let db: SupabaseClient;
let tenantId: string;
let ana: Professional;

beforeEach(async () => {
  db = serviceClient();
  tenantId = await createTenant(db);
  ana = await createProfessional(db, tenantId, { name: 'Ana' });
});

describe('normalize_br_phone', () => {
  it.each([
    // [entrada, esperado, por quê]
    ['+5588999990000', '+5588999990000', 'já canônico'],
    ['5588999990000', '+5588999990000', 'sem o +'],
    ['88999990000', '+5588999990000', 'DDD + 9 dígitos (78,6% do cadastro)'],
    ['(88) 99999-0000', '+5588999990000', 'máscara do app'],
    ['88 99999 0000', '+5588999990000', 'espaços'],
    ['8899990000', '+5588999990000', 'celular sem o 9 (20,2% do cadastro)'],
    ['558899990000', '+5588999990000', 'celular sem o 9, com 55'],
    ['(88) 9999-0000', '+5588999990000', 'celular sem o 9, com máscara'],
    ['8832220000', '+558832220000', 'fixo: NÃO ganha o 9'],
    ['558832220000', '+558832220000', 'fixo com 55'],
  ])('%s → %s (%s)', async (input, expected) => {
    expect(await normalize(db, input)).toBe(expected);
  });

  it.each([
    ['999990000', 'sem DDD'],
    ['99990000', 'sem DDD, 8 dígitos'],
    ['88899990000', 'lixo: 11 dígitos que não formam celular nem fixo'],
    ['', 'vazio'],
    ['   ', 'só espaço'],
    ['abc', 'sem dígito'],
    [null, 'nulo'],
  ])('%s → null (%s)', async (input) => {
    expect(await normalize(db, input)).toBeNull();
  });

  it('celular antigo e novo do MESMO número chegam na mesma forma', async () => {
    expect(await normalize(db, '8899990000')).toBe(await normalize(db, '88999990000'));
  });

  it('fixo e celular com os mesmos 8 dígitos finais não se confundem', async () => {
    expect(await normalize(db, '8832220000')).not.toBe(await normalize(db, '8892220000'));
  });
});

describe('patients.phone_e164', () => {
  async function insertPatient(phone: string): Promise<{ phone_e164: string | null }> {
    const { data, error } = await db
      .from('patients')
      .insert({ full_name: 'Cliente', phone, professional_id: ana.id, tenant_id: tenantId })
      .select('phone_e164')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  it('é calculada pelo banco na gravação — nenhum caminho de escrita precisa normalizar', async () => {
    expect((await insertPatient('(88) 99999-0000')).phone_e164).toBe('+5588999990000');
  });

  it('acompanha a atualização do telefone', async () => {
    const { data: created } = await db
      .from('patients')
      .insert({ full_name: 'Cliente', phone: '88999990000', professional_id: ana.id, tenant_id: tenantId })
      .select('id')
      .single();

    const { data: updated } = await db
      .from('patients')
      .update({ phone: '8832220000' })
      .eq('id', created!.id)
      .select('phone_e164')
      .single();

    expect(updated?.phone_e164).toBe('+558832220000');
  });

  it('telefone inválido fica NULL e não derruba a gravação', async () => {
    expect((await insertPatient('88899990000')).phone_e164).toBeNull();
  });

  it('dois cadastros do mesmo número em formatos diferentes casam pelo phone_e164', async () => {
    await insertPatient('88999990000');
    await insertPatient('(88) 9999-0000');

    const { data } = await db
      .from('patients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_e164', '+5588999990000');

    expect(data).toHaveLength(2);
  });
});
