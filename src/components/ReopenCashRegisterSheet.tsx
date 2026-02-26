import { useState } from 'react';
import BottomSheet from './mobile/BottomSheet';
import { Loader2, RotateCcw } from 'lucide-react';

interface ReopenCashRegisterSheetProps {
  isOpen: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  title?: string;
}

export default function ReopenCashRegisterSheet({
  isOpen,
  onConfirm,
  onCancel,
  isLoading,
  title = 'Reabrir Fechamento',
}: ReopenCashRegisterSheetProps) {
  const [reason, setReason] = useState('');
  const isMobile = window.innerWidth < 768;
  const canConfirm = reason.trim().length >= 10;

  const content = (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <RotateCcw className="w-12 h-12 text-orange-500" />
        <h3 className="text-lg font-semibold text-text">{title}</h3>
      </div>

      <p className="text-sm text-text-muted text-center">
        O caixa voltará para edição. O motivo ficará registrado nas observações.
      </p>

      <div>
        <label className="block text-sm font-medium text-text mb-2">
          Motivo da reabertura <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
          rows={3}
          placeholder="Descreva o motivo da reabertura..."
          disabled={isLoading}
          autoFocus
        />
        {reason.trim().length > 0 && reason.trim().length < 10 && (
          <p className="text-xs text-red-500 mt-1">
            Mínimo de 10 caracteres ({reason.trim().length}/10)
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 px-4 py-3 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim())}
          disabled={!canConfirm || isLoading}
          className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Reabrir
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} title={title} onClose={onCancel}>
        {content}
      </BottomSheet>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-[70]">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        {content}
      </div>
    </div>
  );
}
