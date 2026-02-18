import { useState, useEffect } from 'react';
import { supabase, PaymentSplit, PaymentMethod } from '../lib/supabase';
import {
  validatePaymentSplits,
  formatCurrency,
  getPaymentMethodLabel,
  calculateRemainingAmount,
} from '../lib/paymentValidation';
import { useToast } from './Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import { X, Plus, Trash2, DollarSign, Check, AlertCircle } from 'lucide-react';
import BottomSheet from './mobile/BottomSheet';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientName: string;
  procedureName: string;
  totalAmount: number;
  downpaymentAmount?: number;
  downpaymentMethod?: PaymentMethod | null;
  onSuccess: () => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  appointmentId,
  patientName,
  procedureName,
  totalAmount,
  downpaymentAmount = 0,
  downpaymentMethod,
  onSuccess,
}: PaymentModalProps) {
  const { showToast } = useToast();
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { method: 'dinheiro', amount: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  const remainingAmount = calculateRemainingAmount(totalAmount, downpaymentAmount);

  // Carregar ou criar fechamento de caixa do dia
  useEffect(() => {
    if (isOpen) {
      loadOrCreateClosing();
      // Inicializar com valor restante no primeiro campo
      setPaymentSplits([{ method: 'dinheiro', amount: remainingAmount }]);
    }
  }, [isOpen, remainingAmount]);

  async function loadOrCreateClosing() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      // Buscar fechamento do dia
      let { data: closing } = await supabase
        .from('cash_register_closings')
        .select('id')
        .eq('professional_id', user.id)
        .eq('closing_date', today)
        .eq('is_finalized', false)
        .single();

      // Se não existir, criar
      if (!closing) {
        const { data: newClosing, error } = await supabase
          .from('cash_register_closings')
          .insert({
            professional_id: user.id,
            closing_date: today,
            total_amount: 0,
            is_finalized: false,
          })
          .select('id')
          .single();

        if (error) throw error;
        closing = newClosing;
      }

      setClosingId(closing?.id || null);
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao carregar caixa',
        description: 'Não foi possível acessar o fechamento de caixa.',
      });
    }
  }

  function addPaymentSplit() {
    const currentSum = paymentSplits.reduce((sum, s) => sum + s.amount, 0);
    const rest = Math.max(0, Math.round((remainingAmount - currentSum) * 100) / 100);
    setPaymentSplits([...paymentSplits, { method: 'dinheiro', amount: rest }]);
  }

  function removePaymentSplit(index: number) {
    if (paymentSplits.length === 1) {
      showToast({
        type: 'error',
        message: 'Atenção',
        description: 'Deve haver pelo menos uma forma de pagamento.',
      });
      return;
    }
    const updated = paymentSplits.filter((_, i) => i !== index);
    if (updated.length > 0) {
      const lastIdx = updated.length - 1;
      const sumOthers = updated.reduce((sum, s, i) => i < lastIdx ? sum + s.amount : sum, 0);
      updated[lastIdx].amount = Math.max(0, Math.round((remainingAmount - sumOthers) * 100) / 100);
    }
    setPaymentSplits(updated);
  }

  function updatePaymentSplit(
    index: number,
    field: 'method' | 'amount',
    value: PaymentMethod | number
  ) {
    const updated = [...paymentSplits];
    if (field === 'method') {
      updated[index].method = value as PaymentMethod;
    } else {
      updated[index].amount = Number(value) || 0;
      if (updated.length > 1) {
        const lastIdx = updated.length - 1;
        // Determine which split to recalculate:
        // - editing last → recalculate first
        // - editing any other → recalculate last
        const targetIdx = index === lastIdx ? 0 : lastIdx;
        const sumOthers = updated.reduce((sum, s, i) => i !== targetIdx ? sum + s.amount : sum, 0);
        updated[targetIdx].amount = Math.max(0, Math.round((remainingAmount - sumOthers) * 100) / 100);
      }
    }
    setPaymentSplits(updated);
  }

  function getTotalInformed(): number {
    return paymentSplits.reduce((sum, split) => sum + split.amount, 0);
  }

  function isValidTotal(): boolean {
    const total = getTotalInformed();
    const difference = Math.abs(total - remainingAmount);
    return difference <= 0.01;
  }

  async function handleSubmit() {
    if (!closingId) {
      showToast({
        type: 'error',
        message: 'Erro',
        description: 'Fechamento de caixa não encontrado.',
      });
      return;
    }

    // Validar pagamentos
    const validation = validatePaymentSplits(paymentSplits, remainingAmount);
    if (!validation.isValid) {
      showToast({
        type: 'error',
        message: 'Pagamento inválido',
        description: validation.message,
      });
      return;
    }

    setLoading(true);

    try {
      // 1. Criar transações para cada forma de pagamento
      const transactions = paymentSplits.map((split) => ({
        closing_id: closingId,
        appointment_id: appointmentId,
        amount: split.amount,
        payment_method: getPaymentMethodLabel(split.method),
        transaction_type: downpaymentAmount > 0 ? 'remaining_payment' : 'full_payment',
        notes: `Pagamento - ${procedureName} (${patientName})`,
      }));

      const { error: transactionError } = await supabase
        .from('cash_register_transactions')
        .insert(transactions);

      if (transactionError) throw transactionError;

      // 2. Atualizar status do agendamento para completed
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ status: 'completed', has_payment: true })
        .eq('id', appointmentId);

      if (appointmentError) throw appointmentError;

      showToast({
        type: 'success',
        message: 'Pagamento registrado!',
        description: 'O atendimento foi finalizado e o pagamento foi registrado no caixa.',
      });

      onSuccess();
      onClose();
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao processar pagamento',
        description: parseSupabaseError(error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  const modalContent = (
    <div className="space-y-6">
      {/* Informações do Atendimento */}
      <div className="bg-champagne-nuvem rounded-lg p-4 space-y-2">
        <div>
          <span className="text-sm text-text-muted">Paciente:</span>
          <p className="text-text font-medium">{patientName}</p>
        </div>
        <div>
          <span className="text-sm text-text-muted">Procedimento:</span>
          <p className="text-text font-medium">{procedureName}</p>
        </div>
      </div>

      {/* Valores */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-text-muted">Total do serviço:</span>
          <span className="text-text font-bold text-lg">{formatCurrency(totalAmount)}</span>
        </div>

        {downpaymentAmount > 0 && (
          <>
            <div className="flex justify-between items-center text-green-600">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Calção pago ({downpaymentMethod && getPaymentMethodLabel(downpaymentMethod)}):
              </span>
              <span className="font-medium">{formatCurrency(downpaymentAmount)}</span>
            </div>
            <div className="border-t border-accent/20 pt-3" />
          </>
        )}

        <div className="flex justify-between items-center">
          <span className="text-text font-medium">Valor a receber:</span>
          <span className="text-primary font-bold text-xl">
            {formatCurrency(remainingAmount)}
          </span>
        </div>
      </div>

      {/* Formas de Pagamento */}
      <div>
        <label className="block text-sm font-medium text-text mb-3">
          Formas de Pagamento:
        </label>
        <div className="space-y-3">
          {paymentSplits.map((split, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-champagne-nuvem rounded-lg"
            >
              <select
                value={split.method}
                onChange={(e) =>
                  updatePaymentSplit(index, 'method', e.target.value as PaymentMethod)
                }
                className="flex-1 px-3 py-2 bg-background border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-sm"
                disabled={loading}
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="credito">Cartão de Crédito</option>
                <option value="debito">Cartão de Débito</option>
                <option value="pix">PIX</option>
              </select>

              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
                  R$
                </span>
                <input
                  type="number"
                  value={split.amount || ''}
                  onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-sm"
                  placeholder="0,00"
                  step="0.01"
                  min="0"
                  disabled={loading}
                />
              </div>

              <button
                onClick={() => removePaymentSplit(index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                disabled={loading || paymentSplits.length === 1}
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addPaymentSplit}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-accent/30 text-text-muted hover:border-primary hover:text-primary rounded-lg transition-colors"
          disabled={loading}
        >
          <Plus className="w-4 h-4" />
          Adicionar Forma de Pagamento
        </button>
      </div>

      {/* Total Informado */}
      <div
        className={`flex justify-between items-center p-4 rounded-lg ${
          isValidTotal()
            ? 'bg-green-50 border border-green-200'
            : 'bg-orange-50 border border-orange-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {isValidTotal() ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-orange-600" />
          )}
          <span
            className={`font-medium ${
              isValidTotal() ? 'text-green-800' : 'text-orange-800'
            }`}
          >
            Total informado:
          </span>
        </div>
        <span
          className={`font-bold text-lg ${
            isValidTotal() ? 'text-green-600' : 'text-orange-600'
          }`}
        >
          {formatCurrency(getTotalInformed())}
        </span>
      </div>

      {/* Ações */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors font-medium"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          disabled={loading || !isValidTotal()}
        >
          {loading ? (
            'Processando...'
          ) : (
            <>
              <DollarSign className="w-5 h-5" />
              Finalizar Pagamento
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Mobile: usar BottomSheet
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title="Fechar Caixa - Agendamento">
        {modalContent}
      </BottomSheet>
    );
  }

  // Desktop: modal tradicional
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-lg w-full p-6 border border-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-text">Fechar Caixa - Agendamento</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>
        {modalContent}
      </div>
    </div>
  );
}
