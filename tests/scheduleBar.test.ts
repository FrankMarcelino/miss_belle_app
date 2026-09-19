import { describe, expect, it } from 'vitest';
import { crossesMidnight, daySegments, formatRange, toMinutes } from '../src/lib/scheduleBar';

/**
 * Lógica pura da barra de 24h da tela de expediente. A barra mostra, na
 * posição real do relógio, os turnos do dia E a cauda do turno da véspera
 * que virou a meia-noite — é o que torna "sexta 20:00–02:00" visível.
 */
const row = (day_of_week: number, starts_at: string, ends_at: string) => ({ day_of_week, starts_at, ends_at });

describe('toMinutes / crossesMidnight / formatRange', () => {
  it('converte HH:MM e HH:MM:SS', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('09:30:00')).toBe(570);
  });

  it('fim ≤ início vira a meia-noite; 00:00–00:00 também (24h)', () => {
    expect(crossesMidnight('09:00', '18:00')).toBe(false);
    expect(crossesMidnight('20:00', '02:00')).toBe(true);
    expect(crossesMidnight('00:00', '00:00')).toBe(true);
  });

  it('formata sem segundos', () => {
    expect(formatRange('20:00:00', '02:00:00')).toBe('20:00–02:00');
  });
});

describe('daySegments', () => {
  it('turnos do próprio dia, em ordem', () => {
    expect(daySegments([row(2, '13:00', '18:00'), row(2, '09:00', '12:00')], 2)).toEqual([
      { start: 540, end: 720, carried: false },
      { start: 780, end: 1080, carried: false },
    ]);
  });

  it('turno que vira a noite pinta até o fim da barra do próprio dia…', () => {
    expect(daySegments([row(5, '20:00', '02:00')], 5)).toEqual([{ start: 1200, end: 1440, carried: false }]);
  });

  it('…e a cauda aparece no começo da barra do dia seguinte, marcada como herdada', () => {
    expect(daySegments([row(5, '20:00', '02:00')], 6)).toEqual([{ start: 0, end: 120, carried: true }]);
  });

  it('sábado que vira a noite deixa cauda no domingo (virada da semana)', () => {
    expect(daySegments([row(6, '22:00', '03:00')], 0)).toEqual([{ start: 0, end: 180, carried: true }]);
  });

  it('24h (00:00–00:00) ocupa a barra inteira e não deixa cauda', () => {
    const rows = [row(2, '00:00', '00:00')];
    expect(daySegments(rows, 2)).toEqual([{ start: 0, end: 1440, carried: false }]);
    expect(daySegments(rows, 3)).toEqual([]);
  });

  it('dia sem turno e sem cauda → barra vazia', () => {
    expect(daySegments([row(2, '09:00', '12:00')], 4)).toEqual([]);
  });
});
