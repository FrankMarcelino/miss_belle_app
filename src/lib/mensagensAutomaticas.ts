/**
 * Mensagens automáticas (#12): a lógica da tela que não depende de React.
 *
 * As regras de validação espelham os checks do banco
 * (20260929130000 e 20260929140000): a usuária vê o erro antes de salvar, e o
 * banco continua sendo quem garante.
 */

export type ConfigConfirmacao = {
  id?: string;
  kind: 'confirmacao';
  enabled: boolean;
  send_time: string; // HH:MM
  attempts: number;
  interval_hours: number;
  on_no_reply: 'cancelar' | 'nada';
  texts: string[];
  cancel_text: string;
};

export type ParRetoque = { gatilho: string; retoque: string };

export type ConfigRetoque = {
  id?: string;
  kind: 'retoque';
  enabled: boolean;
  send_time: string;
  attempts: number;
  days_after: number;
  interval_days: number;
  texts: string[];
  procedure_pairs: ParRetoque[];
};

export type Passo = { quando: string; oQue: string };

export const TEXTOS_CONFIRMACAO = [
  'Oi, {nome}! 😊 Aqui é da Miss Belle. Passando para confirmar seu {procedimento} amanhã, {dia}, às {hora}, com a {profissional}. Você confirma? Se precisar, posso remarcar.',
  'Oi, {nome}! Ainda não recebemos sua confirmação para amanhã às {hora}. Pode confirmar pra gente? Sem confirmação, o horário é liberado hoje às {hora_cancelamento}.',
];

export const TEXTO_CANCELAMENTO =
  'Oi, {nome}. Como não recebemos a confirmação, o seu horário de amanhã às {hora} foi liberado. Se quiser marcar de novo, é só me chamar aqui 😊';

export const TEXTOS_RETOQUE = [
  'Oi, {nome}! 💖 Já faz {dias} dias da sua {procedimento}. Que tal marcarmos a segunda sessão (retoque) para deixar o resultado ainda mais bonito? Me diga o melhor dia que eu vejo os horários.',
  'Oi, {nome}! Passando para lembrar do seu retoque 💖 Se quiser, é só me dizer o melhor dia que eu vejo os horários.',
];

/** Variáveis de cada tipo, com o exemplo usado na prévia. */
export const VARIAVEIS = {
  confirmacao: ['{nome}', '{procedimento}', '{dia}', '{hora}', '{profissional}', '{hora_cancelamento}'],
  retoque: ['{nome}', '{procedimento}', '{profissional}', '{dias}'],
} as const;

const EXEMPLO: Record<string, string> = {
  '{nome}': 'Mariana',
  '{procedimento}': 'Design de Sobrancelha',
  '{dia}': 'terça-feira, 30/09',
  '{hora}': '15:00',
  '{profissional}': 'Ana Paula',
  '{hora_cancelamento}': '17:00',
  '{dias}': '40',
};

const ordinal = (n: number) => `${n}º`; // pedido, lembrete
const ordinalF = (n: number) => `${n}ª`; // mensagem

function somaHoras(hhmm: string, horas: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + horas * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const hhmm = (t: string) => t.slice(0, 5);

/** O que acontece com a cliente, na ordem, com o horário de cada passo. */
export function linhaDoTempo(c: ConfigConfirmacao | ConfigRetoque): Passo[] {
  if (c.kind === 'retoque') {
    return Array.from({ length: c.attempts }, (_, i) => ({
      quando: `${c.days_after + c.interval_days * i} dias depois, ${hhmm(c.send_time)}`,
      oQue: `${ordinal(i + 1)} lembrete de retoque`,
    }));
  }
  const passos: Passo[] = Array.from({ length: c.attempts }, (_, i) => ({
    quando: `Véspera, ${somaHoras(hhmm(c.send_time), c.interval_hours * i)}`,
    oQue: `${ordinal(i + 1)} pedido de confirmação`,
  }));
  passos.push({
    quando: `Véspera, ${somaHoras(hhmm(c.send_time), c.interval_hours * c.attempts)}`,
    oQue:
      c.on_no_reply === 'cancelar'
        ? 'Sem resposta, o horário é liberado e a cliente é avisada'
        : 'Sem resposta, as mensagens param; o horário continua marcado',
  });
  return passos;
}

/**
 * O texto como a cliente vai ler, com as variáveis de um exemplo. Com a
 * configuração, o que depende dela sai calculado: a hora de liberação e os
 * dias do retoque — uma prévia com exemplo fixo ensinaria errado o que a tela
 * existe para explicar.
 */
export function previa(texto: string, config?: ConfigConfirmacao | ConfigRetoque): string {
  const valores: Record<string, string> = { ...EXEMPLO };
  if (config?.kind === 'confirmacao') {
    valores['{hora_cancelamento}'] = somaHoras(hhmm(config.send_time), config.interval_hours * config.attempts);
  }
  if (config?.kind === 'retoque') {
    valores['{procedimento}'] = 'Micropigmentação';
    valores['{dias}'] = String(config.days_after);
  }
  return texto.replace(/\{[a-z_]+\}/g, (v) => valores[v] ?? v);
}

/** Ajusta a lista de textos ao número de tentativas sem perder o que foi escrito. */
export function ajustarTextos(atuais: string[], tentativas: number, padrao: string[]): string[] {
  return Array.from({ length: tentativas }, (_, i) => atuais[i] ?? padrao[Math.min(i, padrao.length - 1)]);
}

export function validar(c: ConfigConfirmacao | ConfigRetoque): string[] {
  const erros: string[] = [];
  const t = hhmm(c.send_time);
  if (!/^\d{2}:\d{2}$/.test(t) || t < '06:00' || t > '20:00') erros.push('O horário precisa estar entre 06:00 e 20:00.');
  if (!(c.attempts >= 1 && c.attempts <= 5)) erros.push('As tentativas precisam ser de 1 a 5.');
  c.texts.forEach((txt, i) => {
    if (!txt.trim()) erros.push(`Escreva o texto da ${ordinalF(i + 1)} mensagem.`);
  });

  if (c.kind === 'confirmacao') {
    if (!(c.interval_hours >= 1 && c.interval_hours <= 12)) erros.push('O intervalo precisa ser de 1 a 12 horas.');
    if (c.on_no_reply === 'cancelar' && !c.cancel_text.trim()) erros.push('Escreva o aviso de horário liberado.');
  } else {
    if (!(c.days_after >= 1 && c.days_after <= 365)) erros.push('Os dias até o lembrete precisam ser de 1 a 365.');
    if (!(c.interval_days >= 1 && c.interval_days <= 90)) erros.push('O intervalo precisa ser de 1 a 90 dias.');
    if (c.procedure_pairs.length === 0 || c.procedure_pairs.some((p) => !p.gatilho || !p.retoque)) {
      erros.push('Escolha ao menos um procedimento e o retoque dele.');
    }
  }
  return erros;
}
