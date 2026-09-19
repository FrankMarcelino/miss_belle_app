import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';

export type ExceptionChoice = 'day_off' | 'block' | 'extra';

export interface ExceptionInput {
  exception_date: string;
  kind: 'block' | 'extra';
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
}

interface ExceptionSheetProps {
  isOpen: boolean;
  minDate: string;
  onClose: () => void;
  onSave: (input: ExceptionInput) => Promise<string | null>;
}

const CHOICES: { value: ExceptionChoice; label: string; hint: string }[] = [
  { value: 'day_off', label: 'Folga o dia inteiro', hint: 'Feriado, férias, compromisso. Leva junto a madrugada do turno que vira a noite.' },
  { value: 'block', label: 'Bloquear um horário', hint: 'Tira só essa faixa da agenda naquele dia.' },
  { value: 'extra', label: 'Atender fora do expediente', hint: 'Abre horário num dia ou faixa em que você normalmente não atende.' },
];

const inputClass =
  'w-full px-3 py-2.5 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base';

export default function ExceptionSheet({ isOpen, minDate, onClose, onSave }: ExceptionSheetProps) {
  const [date, setDate] = useState(minDate);
  const [choice, setChoice] = useState<ExceptionChoice>('day_off');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDate(minDate);
      setChoice('day_off');
      setStartsAt('');
      setEndsAt('');
      setReason('');
      setError(null);
    }
  }, [isOpen, minDate]);

  async function save() {
    if (!date) return setError('Escolha a data.');
    if (choice !== 'day_off' && (!startsAt || !endsAt)) return setError('Preencha início e fim.');

    setSaving(true);
    setError(null);
    const err = await onSave({
      exception_date: date,
      kind: choice === 'extra' ? 'extra' : 'block',
      starts_at: choice === 'day_off' ? null : startsAt,
      ends_at: choice === 'day_off' ? null : endsAt,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Nova exceção">
      <div className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-text mb-1.5">Data</span>
          <input type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text mb-1.5">O que muda nesse dia</legend>
          {CHOICES.map((c) => (
            <label
              key={c.value}
              className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                choice === c.value ? 'border-primary bg-primary/10' : 'border-accent/15 hover:border-accent/40'
              }`}
            >
              <input
                type="radio"
                name="exception-kind"
                value={c.value}
                checked={choice === c.value}
                onChange={() => setChoice(c.value)}
                className="mt-1 accent-rosa-aurora"
              />
              <span>
                <span className="block text-sm font-medium text-text">{c.label}</span>
                <span className="block text-xs text-text-muted">{c.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {choice !== 'day_off' && (
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="block text-xs font-medium text-text-light mb-1">Início</span>
              <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
            </label>
            <label className="flex-1">
              <span className="block text-xs font-medium text-text-light mb-1">Fim</span>
              <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
            </label>
          </div>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-text mb-1.5">Motivo (opcional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: feriado, consulta médica"
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary-hover text-grafite-rosado font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Adicionar exceção
        </button>
      </div>
    </BottomSheet>
  );
}
