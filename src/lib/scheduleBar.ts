/**
 * Lógica da barra de 24h da tela de expediente (tests/scheduleBar.test.ts).
 *
 * Mesma regra do banco (public.time_window): fim ≤ início termina no dia
 * seguinte, e 00:00–00:00 é 24 horas. Aqui é só para DESENHAR; quem decide
 * horário livre continua sendo o motor no Postgres.
 */

export interface ShiftRow {
  day_of_week: number; // 0 = domingo
  starts_at: string; // HH:MM ou HH:MM:SS
  ends_at: string;
}

export interface Segment {
  start: number; // minutos desde 00:00, 0..1440
  end: number;
  carried: boolean; // cauda do turno da véspera que virou a meia-noite
}

const DAY = 1440;

export function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function crossesMidnight(startsAt: string, endsAt: string): boolean {
  return toMinutes(endsAt) <= toMinutes(startsAt);
}

export function formatRange(startsAt: string, endsAt: string): string {
  return `${startsAt.slice(0, 5)}–${endsAt.slice(0, 5)}`;
}

export function daySegments(rows: ShiftRow[], dow: number): Segment[] {
  const previousDow = (dow + 6) % 7;
  const segments: Segment[] = [];

  for (const r of rows) {
    const start = toMinutes(r.starts_at);
    const end = toMinutes(r.ends_at);
    const wraps = crossesMidnight(r.starts_at, r.ends_at);

    if (r.day_of_week === dow) {
      segments.push({ start, end: wraps ? DAY : end, carried: false });
    }
    if (r.day_of_week === previousDow && wraps && end > 0) {
      segments.push({ start: 0, end, carried: true });
    }
  }

  return segments.sort((a, b) => a.start - b.start);
}

/** Ordem de exibição: semana de salão começa na segunda. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const DAY_SHORT: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
export const DAY_LONG: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};
