import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertTriangle, Star, DollarSign, X } from 'lucide-react';
import BottomSheet from './mobile/BottomSheet';
import { parseSupabaseError } from '../lib/errorHandling';

type Outcome = 'dinheiro_devolvido' | 'credito_cliente';

interface ReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId: string;
  patientName: string;
  procedureName: string;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

export default function ReversalModal({
  isOpen,
  onClose,
  appointmentId,
  patientId,
  patientName,
  procedureName,
  onSuccess,
  showToast,
}: ReversalModalProps) {
  const [loadingData, setLoadingData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [originalTxId, setOriginalTxId] = useState<string | null>(null);

  // Form
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('dinheiro_devolvido');
  const [method, setMethod] = useState('dinheiro');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setOutcome('dinheiro_devolvido');
      setMethod('dinheiro');
      setDate(new Date().toISOString().split('T')[0]);
      loadPaymentData();
    }
  }, [isOpen]);

  async function loadPaymentData() {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('cash_register_transactions')
        .select('id, amount')
        .eq('appointment_id', appointmentId)
        .eq('type', 'payment');
      if (error) throw error;
      const total = (data || []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
      setPaidAmount(total);
      setAmount(total);
      setOriginalTxId(data?.[0]?.id ?? null);
    } catch (err) {
      const { title, description } = parseSupabaseError(err);
      showToast('error', title, description);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSubmit() {
    if (reason.trim().length < 20) {
      showToast('error', 'Motivo muito curto', 'Descreva o motivo com pelo menos 20 caracteres.');
      return;
    }
    if (amount <= 0 || amount > paidAmount + 0.001) {
      showToast('error', 'Valor inválido', `O valor deve ser entre R$ 0,01 e R$ ${paidAmount.toFixed(2)}.`);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado.');

      if (outcome === 'dinheiro_devolvido') {
        // 1. Buscar ou criar o fechamento de hoje
        const today = new Date().toISOString().split('T')[0];
        let { data: closing } = await supabase
          .from('cash_register_closings')
          .select('id, total_amount')
          .eq('professional_id', user.id)
          .eq('closing_date', today)
          .eq('is_finalized', false)
          .maybeSingle();

        if (!closing) {
          const { data: newClosing, error: ceErr } = await supabase
            .from('cash_register_closings')
            .insert({ professional_id: user.id, closing_date: today, total_amount: 0, is_finalized: false })
            .select('id, total_amount')
            .single();
          if (ceErr) throw ceErr;
          closing = newClosing;
        }

        // 2. Gerar protocolo EST-YYYYMMDD-XXXX
        const todayStr = today.replace(/-/g, '');
        const { count } = await supabase
          .from('cash_register_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'reversal');
        const seq = String((count || 0) + 1).padStart(4, '0');
        const protocol = `EST-${todayStr}-${seq}`;

        // 3. Inserir transação de estorno
        const { error: txErr } = await supabase
          .from('cash_register_transactions')
          .insert({
            closing_id: closing!.id,
            appointment_id: appointmentId,
            professional_id: user.id,
            amount,
            payment_method: method,
            type: 'reversal',
            reversal_reason: reason.trim(),
            reversal_method: method,
            reversal_at: new Date(`${date}T12:00:00`).toISOString(),
            reversed_by: user.id,
            reversal_of: originalTxId,
            reversal_protocol: protocol,
            notes: `Estorno - ${procedureName} (${patientName}) — ${protocol}`,
          });
        if (txErr) throw txErr;

        // 4. Recalcular total do fechamento
        const { error: clErr } = await supabase
          .from('cash_register_closings')
          .update({ total_amount: Math.max(0, (closing!.total_amount || 0) - amount) })
          .eq('id', closing!.id);
        if (clErr) throw clErr;

        // 5. Atualizar payment_status
        const { error: aptErr } = await supabase
          .from('appointments')
          .update({ payment_status: 'reversed' })
          .eq('id', appointmentId);
        if (aptErr) throw aptErr;

        showToast('success', 'Estorno registrado', `Protocolo: ${protocol}`);
      } else {
        // Crédito — sem transação de caixa
        const { error: creditErr } = await supabase
          .from('patient_credits')
          .insert({
            patient_id: patientId,
            professional_id: user.id,
            amount_original: amount,
            amount_remaining: amount,
            origin: 'reversal',
            origin_appointment_id: appointmentId,
            notes: reason.trim(),
            created_by: user.id,
          });
        if (creditErr) throw creditErr;

        const { error: aptErr } = await supabase
          .from('appointments')
          .update({ payment_status: 'credited' })
          .eq('id', appointmentId);
        if (aptErr) throw aptErr;

        showToast('success', 'Crédito registrado', `R$ ${amount.toFixed(2)} adicionados como crédito do paciente.`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      const { title, description } = parseSupabaseError(err);
      showToast('error', title, description);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = reason.trim().length >= 20 && amount > 0 && amount <= paidAmount + 0.001;
  const title = outcome === 'credito_cliente' ? 'Converter em Crédito' : 'Estornar Pagamento';

  const content = (
    <div className="space-y-5">
      {loadingData ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="bg-champagne-nuvem rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Paciente</span>
              <span className="text-text font-medium">{patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Valor pago</span>
              <span className="text-text font-bold">R$ {paidAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Resultado */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Resultado do estorno</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome('dinheiro_devolvido')}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                  outcome === 'dinheiro_devolvido'
                    ? 'border-red-400 bg-red-50 text-red-600'
                    : 'border-accent/15 text-text-muted hover:bg-champagne-nuvem'
                }`}
              >
                <DollarSign className="w-5 h-5" />
                Dinheiro devolvido
              </button>
              <button
                type="button"
                onClick={() => setOutcome('credito_cliente')}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                  outcome === 'credito_cliente'
                    ? 'border-blue-400 bg-blue-50 text-blue-600'
                    : 'border-accent/15 text-text-muted hover:bg-champagne-nuvem'
                }`}
              >
                <Star className="w-5 h-5" />
                Crédito p/ cliente
              </button>
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Valor estornado{' '}
              <span className="text-text-muted font-normal">(máx. R$ {paidAmount.toFixed(2)})</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => setAmount(Math.min(parseFloat(e.target.value) || 0, paidAmount))}
                className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
                step="0.01"
                min="0.01"
                max={paidAmount}
                disabled={loading}
              />
            </div>
          </div>

          {/* Forma (só quando dinheiro devolvido) */}
          {outcome === 'dinheiro_devolvido' && (
            <div>
              <label className="block text-sm font-medium text-text mb-1">Forma do estorno</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
                disabled={loading}
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">PIX</option>
                <option value="credito">Cartão de Crédito</option>
                <option value="debito">Cartão de Débito</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          )}

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-text mb-1">Data do estorno</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
              rows={3}
              placeholder="Descreva o motivo do estorno..."
              disabled={loading}
            />
            {reason.trim().length > 0 && reason.trim().length < 20 && (
              <p className="text-xs text-red-500 mt-1">
                Mínimo de 20 caracteres ({reason.trim().length}/20)
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className={`flex-1 px-4 py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-white font-medium ${
                outcome === 'credito_cliente'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {outcome === 'credito_cliente' ? 'Converter em Crédito' : 'Confirmar Estorno'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return (
      <BottomSheet isOpen={isOpen} title={title} onClose={onClose}>
        {content}
      </BottomSheet>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-[70]">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            {title}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
