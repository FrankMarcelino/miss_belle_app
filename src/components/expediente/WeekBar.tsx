import { ChevronRight } from 'lucide-react';
import { DAY_LONG, DAY_SHORT, crossesMidnight, daySegments, formatRange, type ShiftRow } from '../../lib/scheduleBar';

interface WeekBarProps {
  dow: number;
  rows: ShiftRow[];
  onEdit: () => void;
}

/**
 * Um dia da semana: rótulo, barra de 24h e o resumo das faixas.
 * A barra desenha os turnos na posição real do relógio; a cauda do turno da
 * véspera que virou a meia-noite aparece no começo, num tom mais claro.
 */
export default function WeekBar({ dow, rows, onEdit }: WeekBarProps) {
  const own = rows
    .filter((r) => r.day_of_week === dow)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const segments = daySegments(rows, dow);
  const nextDay = DAY_SHORT[(dow + 1) % 7].toLowerCase();

  const summary = own.length === 0 ? 'Folga' : own.map((r) => formatRange(r.starts_at, r.ends_at)).join(', ');

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Editar expediente de ${DAY_LONG[dow]}: ${summary}`}
      className="group w-full grid grid-cols-[2.75rem_1fr_auto] md:grid-cols-[3rem_1fr_14rem_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 rounded-xl text-left hover:bg-champagne-nuvem focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
    >
      <span className="text-sm font-semibold text-text">{DAY_SHORT[dow]}</span>

      <div className="relative h-3 rounded-full bg-champagne-nuvem group-hover:bg-white overflow-hidden col-start-2 row-start-1">
        {[25, 50, 75].map((pct) => (
          <span key={pct} className="absolute inset-y-0 w-px bg-accent/30" style={{ left: `${pct}%` }} aria-hidden />
        ))}
        {segments.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute inset-y-0 ${s.carried ? 'bg-rosa-aurora/40' : 'bg-rosa-aurora'} ${
              s.start === 0 ? 'rounded-l-full' : ''
            } ${s.end === 1440 ? 'rounded-r-full' : ''}`}
            style={{ left: `${(s.start / 1440) * 100}%`, width: `${((s.end - s.start) / 1440) * 100}%` }}
          />
        ))}
      </div>

      <ChevronRight className="w-4 h-4 text-text-muted row-start-1 col-start-3 md:col-start-4" aria-hidden />

      <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-3 md:row-start-1 text-xs md:text-sm">
        {own.length === 0 ? (
          <span className="text-text-muted">Folga</span>
        ) : (
          <span className="text-text-light">
            {own.map((r, i) => (
              <span key={r.starts_at} className="whitespace-nowrap">
                {i > 0 && ', '}
                {formatRange(r.starts_at, r.ends_at)}
                {crossesMidnight(r.starts_at, r.ends_at) && r.starts_at.slice(0, 5) !== r.ends_at.slice(0, 5) && (
                  <span className="text-text-muted"> (termina {nextDay})</span>
                )}
                {r.starts_at.slice(0, 5) === r.ends_at.slice(0, 5) && <span className="text-text-muted"> (24 horas)</span>}
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  );
}

/** Régua de horas alinhada com a coluna das barras. */
export function HourScale() {
  return (
    <div className="grid grid-cols-[2.75rem_1fr_auto] md:grid-cols-[3rem_1fr_14rem_auto] gap-x-3 px-3" aria-hidden>
      <span />
      <div className="relative h-4 text-[10px] text-text-muted">
        {['0h', '6h', '12h', '18h', '24h'].map((label, i) => (
          <span
            key={label}
            className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${i * 25}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
