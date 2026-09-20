import { describe, expect, it } from 'vitest';
import { parseSynonyms, formatSynonyms } from '../src/lib/synonyms';

/**
 * A profissional digita sinônimos separados por vírgula; o banco guarda text[].
 * É por eles que o bot entende "quero fazer uma escova".
 */
describe('parseSynonyms', () => {
  it('separa por vírgula e tira espaço sobrando', () => {
    expect(parseSynonyms('escova, corte + finalização ,  chapinha')).toEqual([
      'escova',
      'corte + finalização',
      'chapinha',
    ]);
  });

  it('ignora vazios e duplicados, sem diferenciar maiúscula', () => {
    expect(parseSynonyms('escova, , Escova,  ESCOVA ,')).toEqual(['escova']);
  });

  it('texto vazio → lista vazia', () => {
    expect(parseSynonyms('   ')).toEqual([]);
  });

  it('aceita quebra de linha como separador (colar de uma lista)', () => {
    expect(parseSynonyms('escova\nchapinha')).toEqual(['escova', 'chapinha']);
  });
});

describe('formatSynonyms', () => {
  it('volta para o campo separado por vírgula', () => {
    expect(formatSynonyms(['escova', 'chapinha'])).toBe('escova, chapinha');
  });

  it('nulo vira string vazia', () => {
    expect(formatSynonyms(null)).toBe('');
  });

  it('ida e volta preserva a lista', () => {
    const lista = ['escova', 'corte + finalização'];
    expect(parseSynonyms(formatSynonyms(lista))).toEqual(lista);
  });
});
