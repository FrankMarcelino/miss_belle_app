import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Appointment, ShowToastFn } from '../../types/agenda';
import { getPaymentBadge } from '../../lib/appointmentUtils';
import { parseSupabaseError } from '../../lib/errorHandling';
import { formatWhatsAppUrl } from '../../lib/whatsapp';
import EditAppointmentForm from './forms/EditAppointmentForm';
import CancelWithDownpaymentSheet from './CancelWithDownpaymentSheet';
import PaymentModal from '../PaymentModal';
import ReopenCashRegisterSheet from '../ReopenCashRegisterSheet';
import ReversalModal from '../ReversalModal';
import {
  MessageCircle, CalendarClock, DollarSign, AlertTriangle, RotateCcw,
  CheckCircle2, Circle, Loader2, Trash2,
} from 'lucide-react';

interface AppointmentDetailsSheetProps {
  appointment: Appointment;
  onClose: () => void;
  onRefresh: () => void;
  showToast: ShowToastFn;
}

// Stepper steps
const STEPS = ['Marcado', 'Confirmado', 'Realizado'];

function StatusStepper({ status }: { status: string }) {
  const stepIndex = status === 'scheduled' ? 0 : status === 'confirmed' ? 1 : status === 'completed' ? 2 : -1;
  if (status === 'cancelled') {
    return (
      <div className="flex items-center justify-center py-3">
        <span className="px-4 py-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-sm font-medium">
          Cancelado
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {STEPS.map((step, idx) => {
        // When status is 'completed', the final step should also be green (done), not pink (active)
        const isDone = idx < stepIndex || (status === 'completed' && idx === stepIndex);
        const isActive = idx === stepIndex && !isDone;
        return (
          <div key={step} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                  isDone
                    ? 'bg-green-500 border-green-500 text-white'
                    : isActive
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-accent/20 text-text-muted'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isActive ? (
                  <Circle className="w-3 h-3 fill-white" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium ${
                  isActive ? 'text-primary' : isDone ? 'text-green-600' : 'text-text-muted'
                }`}
              >
                {step}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mb-4 ${idx < stepIndex ? 'bg-green-400' : 'bg-accent/20'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AppointmentDetailsSheet({
  appointment,
  onClose,
  onRefresh,
  showToast,
}: AppointmentDetailsSheetProps) {
  const [updating, setUpdating] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [showSimpleCancel, setShowSimpleCancel] = useState(false);
  const [simpleCancelReason, setSimpleCancelReason] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showReopenSheet, setShowReopenSheet] = useState(false);
  const [reopeningPayment, setReopeningPayment] = useState(false);
  const [showReversalModal, setShowReversalModal] = useState(false);
  const [showUndoComplete, setShowUndoComplete] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Controla o fluxo de conclusão: true = PaymentModal vai gravar status='completed' junto
  const [concludingService, setConcludingService] = useState(false);
  // Alerta para agendamentos ainda no status 'scheduled' ao tentar concluir
  const [showConcludeWarning, setShowConcludeWarning] = useState(false);
  // Local effective status — updates immediately after DB change so UI reflects correct state
  // without waiting for parent to re-fetch and pass a new appointment prop.
  const [effectiveStatus, setEffectiveStatus] = useState<Appointment['status']>(appointment.status);

  const hasDownpayment = (appointment.downpayment_amount ?? 0) > 0;
  const ps = appointment.payment_status;

  // Determine primary action
  function getPrimaryAction() {
    const status = effectiveStatus;
    if (status === 'cancelled') return null;
    if (status === 'completed') {
      // partial = calção pago mas restante pendente; none/null/reopened = sem pagamento
      if (!ps || ps === 'none' || ps === 'reopened' || ps === 'partial') {
        return { label: 'Registrar Pagamento', action: () => setShowPaymentModal(true), color: 'bg-green-600 hover:bg-green-700' };
      }
      return null; // paid / reversed / credited / legacy → read-only
    }
    if (status === 'confirmed') {
      if (ps === 'paid') {
        return { label: 'Concluir Atendimento', action: handleConcludeOnly, color: 'bg-green-600 hover:bg-green-700' };
      }
      // All other payment states (none, null, partial, reopened…) → conclude + register payment
      return {
        label: 'Concluir → Registrar Pagamento',
        action: handleConclude,
        color: 'bg-green-600 hover:bg-green-700',
      };
    }
    if (status === 'scheduled') {
      return {
        label: 'Confirmar Atendimento',
        action: () => updateStatus('confirmed'),
        color: 'bg-primary hover:bg-primary-hover',
      };
    }
    return null;
  }

  function handleConclude() {
    if (effectiveStatus === 'scheduled') {
      setShowConcludeWarning(true);
    } else {
      setConcludingService(true);
      setShowPaymentModal(true);
    }
  }

  function handleConcludeConfirm() {
    setShowConcludeWarning(false);
    setConcludingService(true);
    setShowPaymentModal(true);
  }

  async function handleConcludeOnly() {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointment.id);
      if (error) throw error;
      setEffectiveStatus('completed');
      showToast('success', 'Atendimento concluído!', 'O pagamento já estava registrado.');
      onRefresh();
      onClose();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setUpdating(false);
    }
  }

  async function handleUndoComplete() {
    setUpdating(true);
    try {
      // Se havia pagamento registrado, remove as transações e recalcula o caixa
      if (ps === 'paid' || ps === 'partial') {
        const { data: txs } = await supabase
          .from('cash_register_transactions')
          .select('id, closing_id, amount')
          .eq('appointment_id', appointment.id)
          .eq('type', 'payment');

        if (txs?.length) {
          const closingId = txs[0].closing_id;
          await supabase.from('cash_register_transactions').delete().in('id', txs.map((t: { id: string }) => t.id));
          const { data: rem } = await supabase
            .from('cash_register_transactions')
            .select('amount, type')
            .eq('closing_id', closingId);
          const newTotal = (rem || []).reduce(
            (s: number, t: { amount: number; type: string }) =>
              t.type === 'reversal' ? s - t.amount : s + t.amount,
            0
          );
          await supabase
            .from('cash_register_closings')
            .update({ total_amount: Math.max(0, newTotal) })
            .eq('id', closingId);
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed', payment_status: 'none', has_payment: false })
        .eq('id', appointment.id);
      if (error) throw error;

      setEffectiveStatus('confirmed');
      setShowUndoComplete(false);
      showToast('success', 'Conclusão desfeita', 'Atendimento voltou para Confirmado.');
      onRefresh();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setUpdating(false);
    }
  }

  async function updateStatus(newStatus: 'scheduled' | 'confirmed' | 'completed' | 'cancelled') {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appointment.id);
      if (error) throw error;
      setEffectiveStatus(newStatus);
      onRefresh();
      onClose();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setUpdating(false);
    }
  }

  function handleCancelClick() {
    if (hasDownpayment) {
      setShowCancelSheet(true);
    } else {
      setShowSimpleCancel(true);
    }
  }

  async function handleCancelWithDownpayment(option: 'refund' | 'credit' | 'keep', reason: string) {
    setUpdating(true);
    try {
      const updateData: Record<string, unknown> = {
        status: 'cancelled',
        cancellation_reason: reason || null,
      };

      if (option === 'keep') {
        // Sinal mantido — nenhuma ação financeira extra
      } else if (option === 'refund') {
        // Marcar payment_status como reversed para refletir devolução
        updateData.payment_status = 'reversed';
      } else if (option === 'credit') {
        // Criar crédito para o cliente — buscar professional_id e criar registro
        const { data: { user } } = await supabase.auth.getUser();
        if (user && appointment.patient_id && appointment.downpayment_amount) {
          await supabase.from('patient_credits').insert({
            patient_id: appointment.patient_id,
            professional_id: user.id,
            amount_original: appointment.downpayment_amount,
            amount_remaining: appointment.downpayment_amount,
            origin: 'cancellation',
            origin_appointment_id: appointment.id,
            notes: `Crédito de cancelamento — ${appointment.procedure?.name ?? ''}`,
            created_by: user.id,
          });
        }
        updateData.payment_status = 'credited';
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointment.id);
      if (error) throw error;

      setShowCancelSheet(false);
      showToast('success', 'Agendamento cancelado', 'O cancelamento foi registrado com sucesso.');
      onRefresh();
      onClose();
    } catch (err) {
      showToast('error', 'Erro ao cancelar', parseSupabaseError(err).title);
    } finally {
      setUpdating(false);
    }
  }

  async function handleSimpleCancel() {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancellation_reason: simpleCancelReason || null })
        .eq('id', appointment.id);
      if (error) throw error;
      setShowSimpleCancel(false);
      onRefresh();
      onClose();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setUpdating(false);
    }
  }

  async function doReopenPayment(_reason: string) {
    setReopeningPayment(true);
    try {
      const { data: txs, error: txErr } = await supabase
        .from('cash_register_transactions')
        .select('id, closing_id, amount')
        .eq('appointment_id', appointment.id)
        .eq('type', 'payment');
      if (txErr) throw txErr;
      if (!txs?.length) throw new Error('Nenhuma transação de pagamento encontrada.');

      const closingId = txs[0].closing_id;
      const txIds = txs.map((t: { id: string }) => t.id);

      const { error: delErr } = await supabase
        .from('cash_register_transactions')
        .delete()
        .in('id', txIds);
      if (delErr) throw delErr;

      const { data: rem } = await supabase
        .from('cash_register_transactions')
        .select('amount, type')
        .eq('closing_id', closingId);
      const newTotal = (rem || []).reduce(
        (s: number, t: { amount: number; type: string }) => (t.type === 'reversal' ? s - t.amount : s + t.amount),
        0
      );
      await supabase
        .from('cash_register_closings')
        .update({ total_amount: Math.max(0, newTotal) })
        .eq('id', closingId);

      const { error: aptErr } = await supabase
        .from('appointments')
        .update({ payment_status: 'reopened' })
        .eq('id', appointment.id);
      if (aptErr) throw aptErr;

      setShowReopenSheet(false);
      onRefresh();
      showToast('success', 'Pagamento reaberto', 'O valor foi removido do caixa. Registre o pagamento correto.');
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setReopeningPayment(false);
    }
  }

  async function handleDelete() {
    if (!deleteReason.trim() || deleteReason.trim().length < 5) {
      showToast('error', 'Motivo obrigatório', 'Informe o motivo da exclusão (mínimo 5 caracteres).');
      return;
    }

    setDeleting(true);
    try {
      const apptId = appointment.id;

      // 1. Nullify patient_credit_uses.appointment_id references
      const { error: creditUsesErr } = await supabase
        .from('patient_credit_uses')
        .update({ appointment_id: null })
        .eq('appointment_id', apptId);
      if (creditUsesErr) throw creditUsesErr;

      // 2. Nullify patient_credits.origin_appointment_id references
      const { error: creditsErr } = await supabase
        .from('patient_credits')
        .update({ origin_appointment_id: null })
        .eq('origin_appointment_id', apptId);
      if (creditsErr) throw creditsErr;

      // 3. Remove cash_register_transactions and recalculate affected closings
      const { data: txs } = await supabase
        .from('cash_register_transactions')
        .select('id, closing_id, amount, type')
        .eq('appointment_id', apptId);

      if (txs && txs.length > 0) {
        const closingIds = [...new Set(txs.map((t: { closing_id: string }) => t.closing_id))];

        const { error: txDelErr } = await supabase
          .from('cash_register_transactions')
          .delete()
          .eq('appointment_id', apptId);
        if (txDelErr) throw txDelErr;

        for (const cid of closingIds) {
          const { data: rem } = await supabase
            .from('cash_register_transactions')
            .select('amount, type')
            .eq('closing_id', cid);
          const newTotal = (rem || []).reduce(
            (s: number, t: { amount: number; type: string }) =>
              t.type === 'reversal' ? s - t.amount : s + t.amount,
            0
          );
          await supabase
            .from('cash_register_closings')
            .update({ total_amount: Math.max(0, newTotal) })
            .eq('id', cid);
        }
      }

      // 4. Delete the appointment
      const { error: deleteErr } = await supabase
        .from('appointments')
        .delete()
        .eq('id', apptId);
      if (deleteErr) throw deleteErr;

      setShowDeleteConfirm(false);
      showToast('success', 'Agendamento excluído', `Motivo: ${deleteReason.trim()}`);
      onRefresh();
      onClose();
    } catch (err) {
      const appError = parseSupabaseError(err);
      showToast('error', 'Erro ao excluir', appError.description || appError.title);
    } finally {
      setDeleting(false);
    }
  }

  if (showEditForm) {
    return (
      <EditAppointmentForm
        appointment={appointment}
        onClose={() => setShowEditForm(false)}
        onSuccess={() => { setShowEditForm(false); onRefresh(); onClose(); }}
        showToast={showToast}
      />
    );
  }

  const primaryAction = getPrimaryAction();
  const isVariableProc = appointment.procedure?.is_variable_price ?? false;
  const effectivePrice = appointment.final_price ?? appointment.procedure?.default_price ?? 0;
  const paymentAmount = isVariableProc && appointment.final_price == null ? 0 : effectivePrice;
  const pc = getPaymentBadge(ps, effectiveStatus, effectivePrice);
  const isCancelled = effectiveStatus === 'cancelled';
  const isCompleted = effectiveStatus === 'completed';
  const canShowPaymentActions = ps === 'paid' || ps === 'partial';

  return (
    <div className="space-y-5">
      {/* Status Stepper */}
      <StatusStepper status={effectiveStatus} />

      {/* Payment badge — sempre visível quando há custo */}
      {pc && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${pc.bg} ${pc.color}`}>
          <pc.Icon className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{pc.label}</span>
          {effectivePrice > 0 && (
            <span className="ml-auto font-bold">
              R$ {effectivePrice.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Patient info */}
      <div className="space-y-3">
        <div>
          <label className="text-sm text-text-muted">Paciente</label>
          <p className="text-text font-medium">{appointment.patient?.full_name}</p>
        </div>

        {appointment.patient?.phone && (
          <div>
            <label className="text-sm text-text-muted">Telefone</label>
            <div className="flex items-center gap-2 mt-1">
              <a
                href={formatWhatsAppUrl(appointment.patient.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {appointment.patient.phone}
              </a>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-text-muted">Procedimento</label>
          <p className="text-text font-medium">{appointment.procedure?.name}</p>
        </div>

        <div>
          <label className="text-sm text-text-muted">Data e Hora</label>
          <p className="text-text font-medium">
            {new Date(appointment.appointment_date + 'T12:00:00').toLocaleDateString('pt-BR')} às{' '}
            {appointment.appointment_time.substring(0, 5)}
          </p>
        </div>

        {appointment.professional && (
          <div>
            <label className="text-sm text-text-muted">Profissional</label>
            <p className="text-text font-medium">{appointment.professional.full_name}</p>
          </div>
        )}

        {hasDownpayment && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <label className="text-sm text-green-800 font-medium">Calção Pago</label>
            <p className="text-green-700 font-bold text-lg mt-1">
              R$ {(appointment.downpayment_amount ?? 0).toFixed(2)}
            </p>
            {appointment.downpayment_method && (
              <p className="text-xs text-green-600 mt-1">
                Forma:{' '}
                {{ dinheiro: 'Dinheiro', credito: 'Cartão de Crédito', debito: 'Cartão de Débito', pix: 'PIX' }[
                  appointment.downpayment_method
                ] ?? appointment.downpayment_method}
              </p>
            )}
            {appointment.downpayment_notes && (
              <p className="text-xs text-green-600 mt-1">Obs: {appointment.downpayment_notes}</p>
            )}
          </div>
        )}

        {appointment.rescheduled_from_date && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="text-sm text-blue-800 font-medium">Remarcado</label>
            <p className="text-xs text-blue-600 mt-1">
              Data original:{' '}
              {new Date(appointment.rescheduled_from_date + 'T12:00:00').toLocaleDateString('pt-BR')}
              {appointment.rescheduled_from_time && ` às ${appointment.rescheduled_from_time.substring(0, 5)}`}
            </p>
            {(appointment.reschedule_count ?? 0) > 1 && (
              <p className="text-xs text-blue-500 mt-0.5">
                Remarcado {appointment.reschedule_count} vezes
              </p>
            )}
          </div>
        )}

        {isCancelled && appointment.cancellation_reason && (
          <div>
            <label className="text-sm text-text-muted">Motivo do Cancelamento</label>
            <p className="text-text font-medium">{appointment.cancellation_reason}</p>
          </div>
        )}
      </div>

      {/* Delete option for cancelled appointments */}
      {isCancelled && (
        <div className="pt-4 border-t border-accent/10 space-y-3">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-red-300 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Excluir agendamento
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800 font-semibold">Excluir agendamento permanentemente?</p>
              </div>
              <p className="text-xs text-red-700">
                Esta ação é irreversível. O agendamento e todas as transações financeiras vinculadas serão removidos.
              </p>
              <div>
                <label className="block text-sm font-medium text-red-800 mb-1">
                  Motivo da exclusão <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-text resize-none text-sm"
                  rows={2}
                  placeholder="Informe o motivo da exclusão..."
                  disabled={deleting}
                />
                {deleteReason.trim().length > 0 && deleteReason.trim().length < 5 && (
                  <p className="text-xs text-red-500 mt-1">
                    Mínimo de 5 caracteres ({deleteReason.trim().length}/5)
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteReason(''); }}
                  disabled={deleting}
                  className="flex-1 px-3 py-2 text-sm border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteReason.trim().length < 5}
                  className="flex-1 px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simple cancel form */}
      {showSimpleCancel && (
        <div className="pt-4 border-t border-accent/10">
          <label className="block text-sm font-medium text-text mb-2">Motivo do Cancelamento (opcional)</label>
          <textarea
            value={simpleCancelReason}
            onChange={(e) => setSimpleCancelReason(e.target.value)}
            className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
            rows={3}
            placeholder="Por que este agendamento foi cancelado?"
            disabled={updating}
          />
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => setShowSimpleCancel(false)}
              className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              disabled={updating}
            >
              Voltar
            </button>
            <button
              onClick={handleSimpleCancel}
              disabled={updating}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {updating ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </button>
          </div>
        </div>
      )}

      {/* Warning: concluindo sem confirmação */}
      {showConcludeWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-semibold">Agendamento não confirmado</p>
          </div>
          <p className="text-sm text-amber-700">
            Este agendamento ainda está como "Marcado" e não foi confirmado pelo profissional. Deseja concluí-lo assim mesmo?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConcludeWarning(false)}
              className="flex-1 px-4 py-2.5 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors font-medium text-sm"
            >
              Voltar
            </button>
            <button
              onClick={handleConcludeConfirm}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium text-sm"
            >
              Continuar assim mesmo
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isCancelled && !showSimpleCancel && !showConcludeWarning && (
        <div className="pt-4 border-t border-accent/10 space-y-3">
          {/* Primary action */}
          {primaryAction && (
            <button
              onClick={primaryAction.action}
              disabled={updating}
              className={`w-full py-3.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${primaryAction.color}`}
            >
              <DollarSign className="w-5 h-5" />
              {updating ? 'Processando...' : primaryAction.label}
            </button>
          )}

          {/* Secondary actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowEditForm(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg text-sm font-medium transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              Remarcar
            </button>
            {effectiveStatus === 'scheduled' && (
              <button
                onClick={handleConclude}
                disabled={updating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Concluir
              </button>
            )}
            <button
              onClick={handleCancelClick}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>

          {/* Payment correction actions */}
          {canShowPaymentActions && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReversalModal(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Estornar
              </button>
              <button
                onClick={() => setShowReopenSheet(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reabrir
              </button>
            </div>
          )}

          {/* Desfazer conclusão — volta para Confirmado */}
          {isCompleted && !showUndoComplete && (
            <button
              onClick={() => setShowUndoComplete(true)}
              disabled={updating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-orange-200 text-orange-600 hover:bg-orange-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Desfazer conclusão
            </button>
          )}

          {showUndoComplete && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
              <p className="text-sm text-orange-800 font-medium">Desfazer conclusão?</p>
              <p className="text-xs text-orange-700">
                O status voltará para "Confirmado".
                {(ps === 'paid' || ps === 'partial') && ' O pagamento registrado será removido do caixa.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUndoComplete(false)}
                  disabled={updating}
                  className="flex-1 px-3 py-2 text-sm border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUndoComplete}
                  disabled={updating}
                  className="flex-1 px-3 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </div>
          )}

          {/* Excluir agendamento */}
          {!showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={updating || deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-red-300 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Excluir agendamento
            </button>
          )}

          {showDeleteConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800 font-semibold">Excluir agendamento permanentemente?</p>
              </div>
              <p className="text-xs text-red-700">
                Esta ação é irreversível. O agendamento e todas as transações financeiras vinculadas serão removidos.
              </p>
              <div>
                <label className="block text-sm font-medium text-red-800 mb-1">
                  Motivo da exclusão <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-text resize-none text-sm"
                  rows={2}
                  placeholder="Informe o motivo da exclusão..."
                  disabled={deleting}
                />
                {deleteReason.trim().length > 0 && deleteReason.trim().length < 5 && (
                  <p className="text-xs text-red-500 mt-1">
                    Mínimo de 5 caracteres ({deleteReason.trim().length}/5)
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteReason(''); }}
                  disabled={deleting}
                  className="flex-1 px-3 py-2 text-sm border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteReason.trim().length < 5}
                  className="flex-1 px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setConcludingService(false); }}
          appointmentId={appointment.id}
          patientId={appointment.patient_id}
          patientName={appointment.patient?.full_name || ''}
          procedureName={appointment.procedure?.name || ''}
          totalAmount={paymentAmount}
          downpaymentAmount={appointment.downpayment_amount}
          downpaymentMethod={appointment.downpayment_method}
          isVariablePrice={isVariableProc}
          minPrice={appointment.procedure?.min_price}
          concludeService={concludingService}
          onSuccess={() => {
            setShowPaymentModal(false);
            setConcludingService(false);
            if (concludingService) setEffectiveStatus('completed');
            onRefresh();
            onClose();
          }}
        />
      )}

      {/* Cancel with downpayment sheet */}
      <CancelWithDownpaymentSheet
        isOpen={showCancelSheet}
        onClose={() => setShowCancelSheet(false)}
        downpaymentAmount={appointment.downpayment_amount ?? 0}
        patientName={appointment.patient?.full_name ?? ''}
        onConfirm={handleCancelWithDownpayment}
        isLoading={updating}
      />

      <ReopenCashRegisterSheet
        isOpen={showReopenSheet}
        title="Reabrir Pagamento"
        onConfirm={doReopenPayment}
        onCancel={() => setShowReopenSheet(false)}
        isLoading={reopeningPayment}
      />

      <ReversalModal
        isOpen={showReversalModal}
        onClose={() => setShowReversalModal(false)}
        appointmentId={appointment.id}
        patientId={appointment.patient_id}
        patientName={appointment.patient?.full_name || ''}
        procedureName={appointment.procedure?.name || ''}
        onSuccess={() => { setShowReversalModal(false); onRefresh(); }}
        showToast={showToast}
      />
    </div>
  );
}
