import { describe, expect, it } from 'vitest';
import { buildTimeGrid, periodOf } from '../src/lib/timeGrid';

/**
 * Lógica pura da grade do TimeSlotPicker: junta os horários LIVRES (do motor,
 * get_available_slots) com os OCUPADOS (agendamentos do dia, com o nome da
 * cliente) e agrupa por período. Sem banco, sem navegador.
 */
describe('periodOf', () => {
  it.each([
    ['00:00', 'Madrugada'],
    ['05:59', 'Madrugada'],
    ['06:00', 'Manhã'],
    ['11:59', 'Manhã'],
    ['12:00', 'Tarde'],
    ['17:59', 'Tarde'],
    ['18:00', 'Noite'],
    ['23:59', 'Noite'],
  ])('%s → %s', (time, period) => {
    expect(periodOf(time)).toBe(period);
  });
});

describe('buildTimeGrid', () => {
  it('sem livre nem ocupado → nenhum período (sem expediente, nada a mostrar)', () => {
    expect(buildTimeGrid([], [])).toEqual([]);
  });

  it('mescla livre e ocupado em ordem de horário, agrupando por período', () => {
    const grid = buildTimeGrid(['09:00', '15:00', '09:30'], [{ time: '14:00', patientName: 'Joana' }]);

    expect(grid).toEqual([
      {
        name: 'Manhã',
        hasFree: true,
        occupiedCount: 0,
        cells: [
          { time: '09:00', kind: 'free' },
          { time: '09:30', kind: 'free' },
        ],
      },
      {
        name: 'Tarde',
        hasFree: true,
        occupiedCount: 1,
        cells: [
          { time: '14:00', kind: 'occupied', patientName: 'Joana' },
          { time: '15:00', kind: 'free' },
        ],
      },
    ]);
  });

  it('período só com ocupado aparece, mas hasFree = false', () => {
    const grid = buildTimeGrid([], [{ time: '19:00', patientName: 'Rita' }]);
    expect(grid).toEqual([
      { name: 'Noite', hasFree: false, occupiedCount: 1, cells: [{ time: '19:00', kind: 'occupied', patientName: 'Rita' }] },
    ]);
  });

  it('mesmo horário livre e ocupado → ocupado vence (na dúvida, não oferecer)', () => {
    const grid = buildTimeGrid(['14:00'], [{ time: '14:00', patientName: 'Joana' }]);
    expect(grid[0].cells).toEqual([{ time: '14:00', kind: 'occupied', patientName: 'Joana' }]);
  });

  it('madrugada entra na ordem certa, antes da manhã', () => {
    const grid = buildTimeGrid(['08:00', '02:00'], []);
    expect(grid.map((p) => p.name)).toEqual(['Madrugada', 'Manhã']);
  });

  it('dois agendamentos no mesmo horário (dado legado) → uma célula só, sem chave duplicada no React', () => {
    const grid = buildTimeGrid([], [
      { time: '10:00', patientName: 'A' },
      { time: '10:00', patientName: 'B' },
    ]);
    expect(grid[0].cells).toHaveLength(1);
  });
});
