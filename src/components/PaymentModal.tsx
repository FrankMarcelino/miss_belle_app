import { useState, useEffect } from 'react';
import { supabase, PaymentMethod } from '../lib/supabase';
import {
  validatePaymentSplits,
  formatCurrency,
  calculateRemainingAmount,
} from '../lib/paymentValidation';
import { useToast } from './Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import { X, Check, AlertCircle, Star, DollarSign, CreditCard, Banknote, Smartphone } from 'lucide-react';
import BottomSheet from './mobile/BottomSheet';

interface AvailableCredit {
  id: string;
  amount_remaining: number;
  expires_at: string | null;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId?: string;
  patientName: string;
  procedureName: string;
  totalAmount: number;
  downpaymentAmount?: number;
  downpaymentMethod?: PaymentMethod | null;
  isVariablePrice?: boolean;
  minPrice?: number | null;
  onSuccess: () => void;
  /** Quando true, o modal também grava status='completed' no agendamento ao confirmar pagamento */
  concludeService?: boolean;
}

interface MethodSplit {
  method: PaymentMethod;
  amount: number;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; Icon: React.ElementType }[] = [
  { value: 'dinheiro', label: 'Dinheiro', Icon: Banknote },
  { value: 'pix', label: 'PIX', Icon: Smartphone },
  { value: 'credito', label: 'Crédito', Icon: CreditCard },
  { value: 'debito', label: 'Débito', Icon: CreditCard },
];

export default function PaymentModal({
  isOpen,
  onClose,
  appointmentId,
  patientId,
  patientName,
  procedureName,
  totalAmount: initialTotalAmount,
  downpaymentAmount = 0,
  downpaymentMethod,
  isVariablePrice = false,
  minPrice,
  onSuccess,
  concludeService = false,
}: PaymentModalProps) {
  const { showToast } = useToast();
  const needsPriceInput = isVariablePrice && (!initialTotalAmount || initialTotalAmount <= 0);
  const [variablePrice, setVariablePrice] = useState<string>('');
  const [priceConfirmed, setPriceConfirmed] = useState(!needsPriceInput);

  const totalAmount = needsPriceInput
    ? (priceConfirmed ? parseFloat(variablePrice) || 0 : 0)
    : initialTotalAmount;

  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>(['dinheiro']);
  const [methodAmounts, setMethodAmounts] = useState<Record<PaymentMethod, number>>({
    dinheiro: 0, pix: 0, credito: 0, debito: 0,
  });
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [availableCredits, setAvailableCredits] = useState<AvailableCredit[]>([]);
  const [totalCreditBalance, setTotalCreditBalance] = useState(0);
  const [creditApplied, setCreditApplied] = useState(false);
  const [showSkipOption, setShowSkipOption] = useState(false);

  const remainingAmount = calculateRemainingAmount(totalAmount, downpaymentAmount);
  const creditToUse = creditApplied ? Math.min(totalCreditBalance, remainingAmount) : 0;
  const effectiveRemaining = Math.max(0, remainingAmount - creditToUse);

  useEffect(() => {
    if (isOpen) {
      setCreditApplied(false);
      setAvailableCredits([]);
      setTotalCreditBalance(0);
      setSelectedMethods(['dinheiro']);
      setVariablePrice('');
      setPriceConfirmed(!needsPriceInput);
      setMethodAmounts({ dinheiro: remainingAmount, pix: 0, credito: 0, debito: 0 });
      setShowSkipOption(false);
      loadOrCreateClosing();
    }
  }, [isOpen]);

  // When credit toggle changes, update first method amount
  useEffect(() => {
    setMethodAmounts((prev) => {
      const updated = { ...prev };
      if (selectedMethods.length === 1) {
        updated[selectedMethods[0]] = effectiveRemaining;
      }
      return updated;
    });
  }, [creditApplied, effectiveRemaining]);

  async function loadCredits(userId: string) {
    if (!patientId) return;
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('patient_credits')
      .select('id, amount_remaining, expires_at')
      .eq('patient_id', patientId)
      .eq('professional_id', userId)
      .gt('amount_remaining', 0)
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order('expires_at', { ascending: true, nullsFirst: false });
    if (error) {
      console.error('[loadCredits] erro:', error);
      return;
    }
    const credits = data || [];
    console.log('[loadCredits] patientId:', patientId, 'professionalId:', userId, 'credits:', credits);
    setAvailableCredits(credits);
    setTotalCreditBalance(credits.reduce((s, c) => s + c.amount_remaining, 0));
  }

  async function loadOrCreateClosing() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setProfessionalId(user.id);
      loadCredits(user.id);

      const today = new Date().toISOString().split('T')[0];
      let { data: closing } = await supabase
        .from('cash_register_closings')
        .select('id')
        .eq('professional_id', user.id)
        .eq('closing_date', today)
        .eq('is_finalized', false)
        .single();

      if (!closing) {
        const { data: newClosing, error } = await supabase
          .from('cash_register_closings')
          .insert({ professional_id: user.id, closing_date: today, total_amount: 0, is_finalized: false })
          .select('id')
          .single();
        if (error) throw error;
        closing = newClosing;
      }
      setClosingId(closing?.id || null);
    } catch {
      showToast('error', 'Erro ao carregar caixa', 'Não foi possível acessar o fechamento de caixa.');
    }
  }

  function toggleMethod(method: PaymentMethod) {
    setSelectedMethods((prev) => {
      const isSelected = prev.includes(method);
      if (isSelected && prev.length === 1) return prev; // must keep at least one
      if (isSelected) {
        const updated = prev.filter((m) => m !== method);
        // Redistribute remaining to others
        const perMethod = effectiveRemaining / updated.length;
        const newAmounts = { ...methodAmounts, [method]: 0 };
        updated.forEach((m) => { newAmounts[m] = perMethod; });
        setMethodAmounts(newAmounts);
        return updated;
      } else {
        const updated = [...prev, method];
        // Split evenly
        const perMethod = effectiveRemaining / updated.length;
        const newAmounts = { ...methodAmounts };
        updated.forEach((m) => { newAmounts[m] = Math.round(perMethod * 100) / 100; });
        setMethodAmounts(newAmounts);
        return updated;
      }
    });
  }

  function updateAmount(method: PaymentMethod, value: number) {
    const updated = { ...methodAmounts, [method]: value };
    // Auto-balance last method
    if (selectedMethods.length === 2) {
      const other = selectedMethods.find((m) => m !== method)!;
      updated[other] = Math.max(0, Math.round((effectiveRemaining - value) * 100) / 100);
    }
    setMethodAmounts(updated);
  }

  function getPaymentSplits(): MethodSplit[] {
    return selectedMethods.map((m) => ({ method: m, amount: methodAmounts[m] }));
  }

  function getTotalInformed(): number {
    return selectedMethods.reduce((sum, m) => sum + methodAmounts[m], 0);
  }

  function isValidTotal(): boolean {
    if (effectiveRemaining <= 0.001) return true;
    return Math.abs(getTotalInformed() - effectiveRemaining) <= 0.01;
  }

  async function handleSubmit(skipPayment = false) {
    if (!skipPayment && effectiveRemaining > 0.001 && !closingId) {
      showToast('error', 'Erro', 'Fechamento de caixa não encontrado.');
      return;
    }

    if (!skipPayment && effectiveRemaining > 0.001) {
      const splits = getPaymentSplits();
      const validation = validatePaymentSplits(splits, effectiveRemaining);
      if (!validation.isValid) {
        showToast('error', 'Pagamento inválido', validation.message);
        return;
      }
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();

      // 1. Apply credit if toggled
      if (creditToUse > 0 && !skipPayment) {
        let remaining = creditToUse;
        for (const credit of availableCredits) {
          if (remaining <= 0.001) break;
          const use = Math.min(remaining, credit.amount_remaining);
          await supabase.from('patient_credit_uses').insert({
            credit_id: credit.id,
            appointment_id: appointmentId,
            amount_used: use,
            used_by: professionalId,
          });
          await supabase
            .from('patient_credits')
            .update({ amount_remaining: Math.max(0, credit.amount_remaining - use) })
            .eq('id', credit.id);
          remaining -= use;
        }
      }

      // 2. Create cash transactions (only if there's cash to register)
      if (!skipPayment && effectiveRemaining > 0.001) {
        const transactions = getPaymentSplits()
          .filter((s) => s.amount > 0)
          .map((split) => ({
            closing_id: closingId,
            appointment_id: appointmentId,
            professional_id: professionalId,
            amount: split.amount,
            payment_method: split.method,
            type: 'payment',
            transaction_type: downpaymentAmount > 0 ? 'remaining_payment' : 'full_payment',
            notes: `Pagamento - ${procedureName} (${patientName})`,
          }));
        const { error: txError } = await supabase.from('cash_register_transactions').insert(transactions);
        if (txError) throw txError;
      }

      // 3. Update appointment payment status + final_price for variable services
      const aptUpdate: Record<string, unknown> = {
        has_payment: !skipPayment,
        payment_status: skipPayment ? 'none' : 'paid',
        payment_paid_at: skipPayment ? null : now,
      };
      if (concludeService) {
        aptUpdate.status = 'completed';
      }
      if (needsPriceInput && totalAmount > 0) {
        aptUpdate.final_price = totalAmount;
      }
      const { error: aptError } = await supabase
        .from('appointments')
        .update(aptUpdate)
        .eq('id', appointmentId);
      if (aptError) throw aptError;

      if (skipPayment) {
        showToast(
          'warning',
          concludeService ? 'Atendimento concluído sem pagamento' : 'Atendimento sem pagamento',
          'Registrado como inadimplência. Aparecerá em Financeiro > Em Aberto.'
        );
      } else {
        showToast(
          'success',
          'Pagamento registrado!',
          creditToUse > 0
            ? `R$ ${creditToUse.toFixed(2)} em crédito + R$ ${effectiveRemaining.toFixed(2)} em dinheiro.`
            : 'O pagamento foi registrado no caixa.'
        );
      }

      onSuccess();
      onClose();
    } catch (error) {
      showToast('error', 'Erro ao processar pagamento', parseSupabaseError(error).title);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmPrice() {
    const val = parseFloat(variablePrice);
    if (!val || val <= 0) {
      showToast('error', 'Valor obrigatório', 'Informe o valor do serviço.');
      return;
    }
    if (minPrice != null && val < minPrice) {
      showToast('error', 'Valor abaixo do mínimo', `O valor mínimo é R$ ${minPrice.toFixed(2)}.`);
      return;
    }
    setPriceConfirmed(true);
    const remaining = calculateRemainingAmount(val, downpaymentAmount);
    setMethodAmounts({ dinheiro: remaining, pix: 0, credito: 0, debito: 0 });
    setSelectedMethods(['dinheiro']);
  }

  const modalContent = (
    <div className="space-y-5">
      {/* Appointment info */}
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

      {/* Variable price input step */}
      {needsPriceInput && !priceConfirmed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-amber-800 font-semibold">Defina o valor do serviço</p>
          <p className="text-xs text-amber-600">
            Este serviço tem valor variável. Informe o valor cobrado.
            {minPrice != null && minPrice > 0 && (
              <> Mínimo: R$ {minPrice.toFixed(2)}</>
            )}
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
            <input
              type="number"
              step="0.01"
              value={variablePrice}
              onChange={(e) => setVariablePrice(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-background border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-lg font-medium"
              placeholder={minPrice ? minPrice.toFixed(2) : '0.00'}
              min={minPrice ?? 0}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmPrice}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors font-medium"
            >
              Confirmar Valor
            </button>
          </div>
        </div>
      )}

      {/* Amounts + payment — only show after price is confirmed */}
      {priceConfirmed && (<>
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
                Calção pago ({downpaymentMethod ?? ''}):
              </span>
              <span className="font-medium">{formatCurrency(downpaymentAmount)}</span>
            </div>
            <div className="border-t border-accent/20 pt-3" />
          </>
        )}
        <div className="flex justify-between items-center">
          <span className="text-text font-medium">Valor a receber:</span>
          <span className="text-primary font-bold text-xl">{formatCurrency(remainingAmount)}</span>
        </div>
      </div>

      {/* Credit toggle chip */}
      {totalCreditBalance > 0 && (
        <button
          type="button"
          onClick={() => setCreditApplied((v) => !v)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
            creditApplied
              ? 'border-blue-400 bg-blue-50 text-blue-800'
              : 'border-accent/20 bg-champagne-nuvem text-text'
          }`}
        >
          <Star className={`w-5 h-5 flex-shrink-0 ${creditApplied ? 'text-blue-500' : 'text-text-muted'}`} />
          <div className="flex-1 text-left">
            <p className="font-medium text-sm">
              {creditApplied
                ? `✓ Crédito aplicado: ${formatCurrency(creditToUse)}`
                : `Usar crédito disponível: ${formatCurrency(totalCreditBalance)}`}
            </p>
            {creditApplied && (
              <p className="text-xs text-blue-600 mt-0.5">
                Restante: {formatCurrency(effectiveRemaining)}
              </p>
            )}
          </div>
        </button>
      )}

      {/* Payment method chips */}
      {effectiveRemaining > 0.001 && (
        <div>
          <label className="block text-sm font-medium text-text mb-3">Forma de Pagamento:</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PAYMENT_METHODS.map(({ value, label, Icon }) => {
              const isSelected = selectedMethods.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleMethod(value)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-accent/15 bg-champagne-nuvem text-text hover:border-accent/40'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Amount fields for each selected method */}
          {selectedMethods.length > 1 && (
            <div className="space-y-2">
              {selectedMethods.map((method) => {
                const m = PAYMENT_METHODS.find((p) => p.value === method)!;
                return (
                  <div key={method} className="flex items-center gap-3 bg-champagne-nuvem rounded-lg p-3">
                    <span className="text-sm text-text min-w-[80px]">{m.label}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
                      <input
                        type="number"
                        value={methodAmounts[method] || ''}
                        onChange={(e) => updateAmount(method, parseFloat(e.target.value) || 0)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-sm"
                        placeholder="0,00"
                        step="0.01"
                        min="0"
                        disabled={loading}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Total validation */}
      {effectiveRemaining > 0.001 && (
        <div
          className={`flex justify-between items-center p-4 rounded-lg ${
            isValidTotal() ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {isValidTotal() ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-orange-600" />
            )}
            <span className={`font-medium ${isValidTotal() ? 'text-green-800' : 'text-orange-800'}`}>
              Total informado:
            </span>
          </div>
          <span className={`font-bold text-lg ${isValidTotal() ? 'text-green-600' : 'text-orange-600'}`}>
            {selectedMethods.length === 1 ? formatCurrency(effectiveRemaining) : formatCurrency(getTotalInformed())}
          </span>
        </div>
      )}

      {effectiveRemaining <= 0.001 && creditApplied && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
          <Check className="w-5 h-5 text-green-600" />
          <span className="text-green-800 font-medium">✓ Totalmente coberto por crédito</span>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors font-medium"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSubmit(false)}
            className="flex-1 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            disabled={loading || (effectiveRemaining > 0.001 && !isValidTotal())}
          >
            {loading ? (
              'Processando...'
            ) : (
              <>
                <DollarSign className="w-5 h-5" />
                {concludeService ? 'Confirmar e Concluir' : 'Finalizar Pagamento'}
              </>
            )}
          </button>
        </div>

        {/* Opção de inadimplência — escondida por padrão */}
        {!showSkipOption ? (
          <button
            type="button"
            onClick={() => setShowSkipOption(true)}
            className="w-full text-xs text-text-muted hover:text-text text-center py-1 transition-colors"
            disabled={loading}
          >
            O cliente não pagará agora
          </button>
        ) : (
          <div className="border border-dashed border-orange-200 rounded-lg p-3 space-y-2 bg-orange-50">
            <p className="text-xs text-orange-700 font-medium">
              O atendimento será {concludeService ? 'concluído e ' : ''}registrado como inadimplência. O pagamento ficará em aberto no Financeiro.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSkipOption(false)}
                className="flex-1 px-3 py-2 text-xs border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
                disabled={loading}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                className="flex-1 px-3 py-2 text-xs text-orange-700 border border-orange-300 bg-white hover:bg-orange-100 rounded-lg transition-colors font-medium"
                disabled={loading}
              >
                Confirmar inadimplência
              </button>
            </div>
          </div>
        )}
      </div>
      </>)}
    </div>
  );

  const modalTitle = concludeService ? 'Concluir e Registrar Pagamento' : 'Registrar Pagamento';

  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={modalTitle}>
        {modalContent}
      </BottomSheet>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-lg w-full p-6 border border-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-text">{modalTitle}</h2>
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
