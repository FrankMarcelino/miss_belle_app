import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import { DAY_LONG, crossesMidnight } from '../../lib/scheduleBar';

export interface RangeInput {
  starts_at: string;
  ends_at: string;
}

interface DayEditorSheetProps {
  dow: number | null;
  initial: RangeInput[];
  onClose: () => void;
  /** Devolve a mensagem de erro, ou null se salvou. */
  onSave: (ranges: RangeInput[]) => Promise<string | null>;
}

const inputClass =
  'w-full px-3 py-2.5 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base';

export default function DayEditorSheet({ dow, initial, onClose, onSave }: DayEditorSheetProps) {
  const [ranges, setRanges] = useState<RangeInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dow !== null) {
      setRanges(initial.map((r) => ({ starts_at: r.starts_at.slice(0, 5), ends_at: r.ends_at.slice(0, 5) })));
      setError(null);
    }
  }, [dow, initial]);

  if (dow === null) return null;
  const nextDay = DAY_LONG[(dow + 1) % 7].toLowerCase();

  function update(i: number, field: keyof RangeInput, value: string) {
    setRanges((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  }

  async function save(next: RangeInput[]) {
    if (next.some((r) => !r.starts_at || !r.ends_at)) {
      setError('Preencha início e fim de todas as faixas.');
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSave(next);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <BottomSheet isOpen onClose={onClose} title={`Expediente de ${DAY_LONG[dow].toLowerCase()}`}>
      <div className="space-y-4">
        {ranges.length === 0 && (
          <p className="text-sm text-text-muted">Sem faixas: este dia fica como folga e a agenda não oferece horário.</p>
        )}

        {ranges.map((r, i) => {
          const full = r.starts_at && r.starts_at === r.ends_at;
          const wraps = r.starts_at && r.ends_at && !full && crossesMidnight(r.starts_at, r.ends_at);
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-end gap-2">
                <label className="flex-1">
                  <span className="block text-xs font-medium text-text-light mb-1">Início</span>
                  <input type="time" value={r.starts_at} onChange={(e) => update(i, 'starts_at', e.target.value)} className={inputClass} />
                </label>
                <label className="flex-1">
                  <span className="block text-xs font-medium text-text-light mb-1">Fim</span>
                  <input type="time" value={r.ends_at} onChange={(e) => update(i, 'ends_at', e.target.value)} className={inputClass} />
                </label>
                <button
                  type="button"
                  onClick={() => setRanges((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remover faixa"
                  className="p-2.5 mb-0.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              {wraps && <p className="text-xs text-text-muted">Termina na {nextDay}, depois da meia-noite.</p>}
              {full && <p className="text-xs text-text-muted">Início igual ao fim: 24 horas seguidas.</p>}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setRanges((prev) => [...prev, { starts_at: '', ends_at: '' }])}
          className="flex items-center gap-2 text-sm font-medium text-primary-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg px-1 py-1"
        >
          <Plus className="w-4 h-4" />
          Adicionar faixa
        </button>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => save([])}
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-xl border border-accent/30 text-text font-medium hover:bg-champagne-nuvem disabled:opacity-50"
          >
            Folga neste dia
          </button>
          <button
            type="button"
            onClick={() => save(ranges)}
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary-hover text-grafite-rosado font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
