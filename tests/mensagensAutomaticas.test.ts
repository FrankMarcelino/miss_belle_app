import { describe, expect, it } from 'vitest';
import {
  ajustarTextos,
  linhaDoTempo,
  previa,
  validar,
  type ConfigConfirmacao,
  type ConfigRetoque,
} from '../src/lib/mensagensAutomaticas';

// Tela Mensagens automáticas (#12): a lógica que não depende de React.

const confirmacao: ConfigConfirmacao = {
  kind: 'confirmacao', enabled: true, send_time: '09:00', attempts: 2, interval_hours: 4,
  on_no_reply: 'cancelar', texts: ['a', 'b'], cancel_text: 'c',
};

const retoque: ConfigRetoque = {
  kind: 'retoque', enabled: true, send_time: '10:00', attempts: 2, days_after: 40, interval_days: 15,
  texts: ['a', 'b'], procedure_pairs: [{ gatilho: 'p1', retoque: 'p2' }],
};

describe('linhaDoTempo', () => {
  it('confirmação com os padrões: 09:00 → 13:00 → libera às 17:00', () => {
    expect(linhaDoTempo(confirmacao)).toEqual([
      { quando: 'Véspera, 09:00', oQue: '1º pedido de confirmação' },
      { quando: 'Véspera, 13:00', oQue: '2º pedido de confirmação' },
      { quando: 'Véspera, 17:00', oQue: 'Sem resposta, o horário é liberado e a cliente é avisada' },
    ]);
  });

  it('sem resposta = nada: o último passo diz que para', () => {
    const passos = linhaDoTempo({ ...confirmacao, on_no_reply: 'nada', attempts: 1, texts: ['a'] });
    expect(passos).toEqual([
      { quando: 'Véspera, 09:00', oQue: '1º pedido de confirmação' },
      { quando: 'Véspera, 13:00', oQue: 'Sem resposta, as mensagens param; o horário continua marcado' },
    ]);
  });

  it('retoque: dia 40 e dia 55', () => {
    expect(linhaDoTempo(retoque)).toEqual([
      { quando: '40 dias depois, 10:00', oQue: '1º lembrete de retoque' },
      { quando: '55 dias depois, 10:00', oQue: '2º lembrete de retoque' },
    ]);
  });
});

describe('previa', () => {
  it('preenche as variáveis com o exemplo', () => {
    expect(previa('Oi, {nome}! {procedimento} amanhã, {dia}, às {hora}, com a {profissional}.'))
      .toBe('Oi, Mariana! Design de Sobrancelha amanhã, terça-feira, 30/09, às 15:00, com a Ana Paula.');
  });

  it('variável desconhecida fica como está (a usuária vê o erro de digitação)', () => {
    expect(previa('Oi, {nme}!')).toBe('Oi, {nme}!');
  });
});

describe('ajustarTextos', () => {
  it('mais tentativas: acrescenta a partir do padrão, sem perder o que foi escrito', () => {
    expect(ajustarTextos(['meu 1', 'meu 2'], 3, ['p1', 'p2', 'p3'])).toEqual(['meu 1', 'meu 2', 'p3']);
  });
  it('menos tentativas: corta do fim', () => {
    expect(ajustarTextos(['a', 'b', 'c'], 1, ['p1'])).toEqual(['a']);
  });
  it('padrão mais curto que o pedido: repete o último do padrão', () => {
    expect(ajustarTextos(['a'], 3, ['p1', 'p2'])).toEqual(['a', 'p2', 'p2']);
  });
});

describe('validar', () => {
  it('padrões válidos → sem erros', () => {
    expect(validar(confirmacao)).toEqual([]);
    expect(validar(retoque)).toEqual([]);
  });
  it('horário fora de 06:00–20:00', () => {
    expect(validar({ ...confirmacao, send_time: '05:30' })).toContain('O horário precisa estar entre 06:00 e 20:00.');
    expect(validar({ ...confirmacao, send_time: '20:30' })).toContain('O horário precisa estar entre 06:00 e 20:00.');
  });
  it('texto vazio', () => {
    expect(validar({ ...confirmacao, texts: ['a', '  '] })).toContain('Escreva o texto da 2ª mensagem.');
  });
  it('cancelar sem texto de aviso', () => {
    expect(validar({ ...confirmacao, cancel_text: '' })).toContain('Escreva o aviso de horário liberado.');
  });
  it('retoque sem par, ou com par incompleto', () => {
    expect(validar({ ...retoque, procedure_pairs: [] })).toContain('Escolha ao menos um procedimento e o retoque dele.');
    expect(validar({ ...retoque, procedure_pairs: [{ gatilho: 'p1', retoque: '' }] }))
      .toContain('Escolha ao menos um procedimento e o retoque dele.');
  });
  it('intervalo fora da faixa', () => {
    expect(validar({ ...confirmacao, interval_hours: 13 })).toContain('O intervalo precisa ser de 1 a 12 horas.');
    expect(validar({ ...retoque, interval_days: 0 })).toContain('O intervalo precisa ser de 1 a 90 dias.');
    expect(validar({ ...retoque, days_after: 400 })).toContain('Os dias até o lembrete precisam ser de 1 a 365.');
  });
});
