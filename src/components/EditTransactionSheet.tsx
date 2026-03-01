import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseSupabaseError } from '../lib/errorHandling';
import { useToast } from './Toast';
import BottomSheet from './mobile/BottomSheet';
import { Loader2, Banknote, Smartphone, CreditCard } from 'lucide-react';

interface TransactionToEdit {
  id: string;
  closing_id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
}

interface EditTransactionSheetProps {
  isOpen: boolean;
  transaction: TransactionToEdit;
  onClose: () => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro', Icon: Banknote },
  { value: 'pix', label: 'PIX', Icon: Smartphone },
  { value: 'credito', label: 'Crédito', Icon: CreditCard },
  { value: 'debito', label: 'Débito', Icon: CreditCard },
];

export default function EditTransactionSheet({ isOpen, transaction, onClose, onSuccess }: EditTransactionSheetProps) {
  const [paymentMethod, setPaymentMethod] = useState(transaction.payment_method);
  const [amount, setAmount] = useState(transaction.amount.toFixed(2));
  const [notes, setNotes] = useState(transaction.notes || '');
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  async function handleSave() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('error', 'Valor inválido', 'Informe um valor maior que zero.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('cash_register_transactions')
        .update({ amount: amountNum, payment_method: paymentMethod, notes: notes || null })
        .eq('id', transaction.id);

      if (updateError) throw updateError;

      // Recalculate closing total
      const { data: txs } = await supabase
        .from('cash_register_transactions')
        .select('amount, type')
        .eq('closing_id', transaction.closing_id);

      const newTotal = (txs || []).reduce(
        (s: number, t: { amount: number; type: string }) =>
          t.type === 'reversal' ? s - t.amount : s + t.amount,
        0
      );

      await supabase
        .from('cash_register_closings')
        .update({ total_amount: Math.max(0, newTotal) })
        .eq('id', transaction.closing_id);

      showToast('success', 'Transação atualizada', 'O total do caixa foi recalculado.');
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Editar Transação">
      {ToastComponent}
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-text mb-3">Forma de Pagamento</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentMethod(value)}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                  paymentMethod === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-accent/15 bg-champagne-nuvem text-text hover:border-accent/40'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-2">Valor</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text font-medium text-lg"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-2">Observações (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
            rows={2}
            disabled={loading}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
