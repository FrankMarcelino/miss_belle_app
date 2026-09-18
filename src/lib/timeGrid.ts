/**
 * Monta a grade do TimeSlotPicker a partir de duas fontes:
 *   - livres: vêm do motor (get_available_slots), já respeitando expediente,
 *     exceções, duração do procedimento e agendamentos;
 *   - ocupados: agendamentos do dia, só para mostrar QUEM está no horário.
 *
 * Função pura para ser testável sem navegador (tests/timeGrid.test.ts).
 */

export type PeriodName = 'Madrugada' | 'Manhã' | 'Tarde' | 'Noite';

export type GridCell =
  | { time: string; kind: 'free' }
  | { time: string; kind: 'occupied'; patientName: string };

export interface GridPeriod {
  name: PeriodName;
  hasFree: boolean;
  occupiedCount: number;
  cells: GridCell[];
}

export interface OccupiedInput {
  time: string; // HH:MM
  patientName: string;
}

const ORDER: PeriodName[] = ['Madrugada', 'Manhã', 'Tarde', 'Noite'];

export function periodOf(time: string): PeriodName {
  const h = Number(time.slice(0, 2));
  if (h < 6) return 'Madrugada';
  if (h < 12) return 'Manhã';
  if (h < 18) return 'Tarde';
  return 'Noite';
}

export function buildTimeGrid(free: string[], occupied: OccupiedInput[]): GridPeriod[] {
  const byTime = new Map<string, GridCell>();

  for (const time of free) byTime.set(time, { time, kind: 'free' });
  // Ocupado sobrescreve livre: se as duas fontes discordarem, não oferecer.
  // O primeiro nome vence quando há dois agendamentos no mesmo horário.
  for (const o of occupied) {
    const current = byTime.get(o.time);
    if (!current || current.kind === 'free') {
      byTime.set(o.time, { time: o.time, kind: 'occupied', patientName: o.patientName });
    }
  }

  const cells = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));

  return ORDER.map((name) => {
    const inPeriod = cells.filter((c) => periodOf(c.time) === name);
    return {
      name,
      hasFree: inPeriod.some((c) => c.kind === 'free'),
      occupiedCount: inPeriod.filter((c) => c.kind === 'occupied').length,
      cells: inPeriod,
    };
  }).filter((p) => p.cells.length > 0);
}
