import { useState } from 'react';
import BottomSheet from '../mobile/BottomSheet';
import { AlertTriangle, DollarSign, Star, Lock } from 'lucide-react';

interface CancelWithDownpaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  downpaymentAmount: number;
  patientName: string;
  onConfirm: (option: 'refund' | 'credit' | 'keep', reason: string) => void;
  isLoading?: boolean;
}

export default function CancelWithDownpaymentSheet({
  isOpen,
  onClose,
  downpaymentAmount,
  patientName,
  onConfirm,
  isLoading = false,
}: CancelWithDownpaymentSheetProps) {
  const [selected, setSelected] = useState<'refund' | 'credit' | 'keep' | null>(null);
  const [reason, setReason] = useState('');

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected, reason);
  }

  const options: { value: 'refund' | 'credit' | 'keep'; icon: React.ElementType; label: string; description: string }[] = [
    {
      value: 'refund',
      icon: DollarSign,
      label: 'Devolver (estorno em dinheiro)',
      description: 'O valor será devolvido ao cliente',
    },
    {
      value: 'credit',
      icon: Star,
      label: 'Virar crédito para o cliente',
      description: 'O valor fica como crédito para uso futuro',
    },
    {
      value: 'keep',
      icon: Lock,
      label: 'Manter (não reembolsável)',
      description: 'O sinal é retido conforme política',
    },
  ];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Cancelar Agendamento">
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">{patientName} pagou um sinal</p>
            <p className="text-amber-700 font-bold text-lg mt-1">R$ {downpaymentAmount.toFixed(2)}</p>
            <p className="text-sm text-amber-600 mt-1">O que fazer com este valor?</p>
          </div>
        </div>

        <div className="space-y-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-accent/10 bg-champagne-nuvem hover:border-accent/30'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-primary text-white' : 'bg-white text-text-muted'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-text'}`}>{opt.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-2">Motivo do cancelamento (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
            rows={3}
            placeholder="Por que este agendamento foi cancelado?"
            disabled={isLoading}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors font-medium"
            disabled={isLoading}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
