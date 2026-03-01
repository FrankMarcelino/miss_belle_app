import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PaymentModal from '../components/PaymentModal';
import { useToast } from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import BottomSheet from '../components/mobile/BottomSheet';
import ReopenCashRegisterSheet from '../components/ReopenCashRegisterSheet';
import EditTransactionSheet from '../components/EditTransactionSheet';
import {
  Plus, Loader2, DollarSign, X, Check, Calendar, TrendingUp, Trash2,
  AlertTriangle, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Pencil,
} from 'lucide-react';

interface CashRegisterClosing {
  id: string;
  professional_id: string;
  closing_date: string;
  total_amount: number;
  notes: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  created_at: string;
  professional?: { full_name: string };
}

interface Transaction {
  id: string;
  closing_id: string;
  appointment_id: string | null;
  amount: number;
  payment_method: string;
  type: string;
  notes: string | null;
  created_at: string;
  appointment?: {
    downpayment_amount: number;
    patient: { full_name: string };
    procedure: { name: string; default_price: number };
  };
}

interface TodayAppt {
  id: string;
  appointment_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  payment_status: string | null;
  downpayment_amount: number;
  downpayment_method: 'dinheiro' | 'credito' | 'debito' | 'pix' | null;
  patient_id: string;
  patient: { full_name: string } | null;
  procedure: { name: string; default_price: number } | null;
}

interface Professional {
  id: string;
  full_name: string;
}

const METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
};

export default function CashRegister() {
  const { user, isSuperAdmin } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessional, setSelectedProfessional] = useState('');

  // Today data
  const [todayAppts, setTodayAppts] = useState<TodayAppt[]>([]);
  const [todayTransactions, setTodayTransactions] = useState<Transaction[]>([]);
  const [todayClosing, setTodayClosing] = useState<CashRegisterClosing | null>(null);
  const [loadingToday, setLoadingToday] = useState(false);

  // History
  const [closings, setClosings] = useState<CashRegisterClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedClosingId, setExpandedClosingId] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Record<string, Transaction[]>>({});
  const [loadingExpanded, setLoadingExpanded] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmFinalizeId, setConfirmFinalizeId] = useState<string | null>(null);
  const [finalizingHistoryId, setFinalizingHistoryId] = useState<string | null>(null);
  const [undoCompleteId, setUndoCompleteId] = useState<string | null>(null);

  // Modals
  const [selectedAppt, setSelectedAppt] = useState<TodayAppt | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showEditTx, setShowEditTx] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showFinalizeSheet, setShowFinalizeSheet] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [reopeningClosing, setReopeningClosing] = useState<CashRegisterClosing | null>(null);
  const [reopening, setReopening] = useState(false);

  const { showToast, ToastComponent } = useToast();

  const profId = isSuperAdmin ? (selectedProfessional || null) : (user?.id ?? null);

  useEffect(() => {
    if (isSuperAdmin) loadProfessionals();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (profId) loadToday();
    loadHistory();
  }, [user, isSuperAdmin, selectedProfessional]);

  async function loadProfessionals() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      setProfessionals(data || []);
    } catch {}
  }

  async function loadToday() {
    if (!profId) return;
    setLoadingToday(true);
    try {
      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_time, status, payment_status,
          downpayment_amount, downpayment_method, patient_id,
          patient:patients(full_name),
          procedure:procedures(name, default_price)
        `)
        .eq('appointment_date', today)
        .eq('professional_id', profId)
        .neq('status', 'cancelled')
        .order('appointment_time');

      if (apptErr) throw apptErr;
      setTodayAppts((appts || []) as unknown as TodayAppt[]);

      // Today's closing (latest for today, open or finalized)
      const { data: closingRows } = await supabase
        .from('cash_register_closings')
        .select('*, professional:profiles(full_name)')
        .eq('professional_id', profId)
        .eq('closing_date', today)
        .order('created_at', { ascending: false })
        .limit(1);

      const closing = closingRows?.[0] ?? null;
      setTodayClosing(closing);

      if (closing) {
        const { data: txs } = await supabase
          .from('cash_register_transactions')
          .select(`
            *,
            appointment:appointments(
              downpayment_amount,
              patient:patients(full_name),
              procedure:procedures(name, default_price)
            )
          `)
          .eq('closing_id', closing.id)
          .order('created_at');
        setTodayTransactions((txs || []) as unknown as Transaction[]);
      } else {
        setTodayTransactions([]);
      }
    } catch {} finally {
      setLoadingToday(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      let query = supabase
        .from('cash_register_closings')
        .select('*, professional:profiles(full_name)')
        .neq('closing_date', today)
        .order('closing_date', { ascending: false });

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      } else if (selectedProfessional) {
        query = query.eq('professional_id', selectedProfessional);
      }

      const { data, error } = await query;
      if (error) throw error;
      setClosings(data || []);
    } catch {} finally {
      setLoadingHistory(false);
    }
  }

  async function loadExpandedTransactions(closingId: string) {
    setLoadingExpanded(prev => ({ ...prev, [closingId]: true }));
    try {
      const { data } = await supabase
        .from('cash_register_transactions')
        .select(`
          *,
          appointment:appointments(
            downpayment_amount,
            patient:patients(full_name),
            procedure:procedures(name, default_price)
          )
        `)
        .eq('closing_id', closingId)
        .order('created_at', { ascending: false });
      setExpandedTransactions(prev => ({
        ...prev,
        [closingId]: (data || []) as unknown as Transaction[],
      }));
    } catch {} finally {
      setLoadingExpanded(prev => ({ ...prev, [closingId]: false }));
    }
  }

  async function toggleExpand(closingId: string) {
    if (expandedClosingId === closingId) {
      setExpandedClosingId(null);
      return;
    }
    setExpandedClosingId(closingId);
    if (!expandedTransactions[closingId]) {
      await loadExpandedTransactions(closingId);
    }
  }

  async function deleteHistoryTransaction(transactionId: string, closingId: string) {
    try {
      const { error } = await supabase
        .from('cash_register_transactions')
        .delete()
        .eq('id', transactionId);
      if (error) throw error;

      // Recalculate closing total
      const { data: txs } = await supabase
        .from('cash_register_transactions')
        .select('amount, type')
        .eq('closing_id', closingId);
      const newTotal = (txs || []).reduce(
        (s: number, t: { amount: number; type: string }) =>
          t.type === 'reversal' ? s - t.amount : s + t.amount,
        0
      );
      await supabase
        .from('cash_register_closings')
        .update({ total_amount: Math.max(0, newTotal) })
        .eq('id', closingId);

      setConfirmDeleteId(null);
      loadHistory();
      await loadExpandedTransactions(closingId);
    } catch (err) {
      showToast('error', 'Erro ao excluir', parseSupabaseError(err).title);
    }
  }

  async function finalizeHistoryClosing(closingId: string) {
    setFinalizingHistoryId(closingId);
    try {
      const { data: updated, error } = await supabase
        .from('cash_register_closings')
        .update({ is_finalized: true, finalized_at: new Date().toISOString() })
        .eq('id', closingId)
        .select('id');
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error('Permissão negada.');
      setConfirmFinalizeId(null);
      showToast('success', 'Fechamento finalizado', '');
      loadHistory();
      await loadExpandedTransactions(closingId);
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setFinalizingHistoryId(null);
    }
  }

  async function handleUndoComplete(appt: TodayAppt) {
    try {
      // Remove transações do caixa de hoje se existirem
      const apptTxs = getApptTx(appt.id);
      if (apptTxs.length > 0 && todayClosing) {
        await supabase
          .from('cash_register_transactions')
          .delete()
          .in('id', apptTxs.map(t => t.id));
        const { data: rem } = await supabase
          .from('cash_register_transactions')
          .select('amount, type')
          .eq('closing_id', todayClosing.id);
        const newTotal = (rem || []).reduce(
          (s: number, t: { amount: number; type: string }) =>
            t.type === 'reversal' ? s - t.amount : s + t.amount,
          0
        );
        await supabase
          .from('cash_register_closings')
          .update({ total_amount: Math.max(0, newTotal) })
          .eq('id', todayClosing.id);
      }

      await supabase
        .from('appointments')
        .update({ status: 'confirmed', payment_status: 'none', has_payment: false })
        .eq('id', appt.id);

      setUndoCompleteId(null);
      showToast('success', 'Conclusão desfeita', 'Atendimento voltou para Confirmado.');
      loadToday();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    }
  }

  async function doFinalize(reason?: string) {
    if (!todayClosing) return;
    setFinalizing(true);
    try {
      const updateData: Record<string, unknown> = {
        is_finalized: true,
        finalized_at: new Date().toISOString(),
      };
      if (reason) updateData.notes = reason;

      const { data: updated, error } = await supabase
        .from('cash_register_closings')
        .update(updateData)
        .eq('id', todayClosing.id)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error('Permissão negada. Verifique se você tem acesso para finalizar este fechamento.');
      }

      setShowFinalizeSheet(false);
      showToast('success', 'Caixa fechado!', 'O fechamento do dia foi finalizado.');
      loadToday();
      loadHistory();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setFinalizing(false);
    }
  }

  async function doReopen(reason: string) {
    if (!reopeningClosing) return;
    setReopening(true);
    const closing = reopeningClosing;
    try {
      const notesEntry = `Reaberto em ${new Date().toLocaleString('pt-BR')}: ${reason}`;
      const newNotes = closing.notes ? `${closing.notes}\n${notesEntry}` : notesEntry;

      const { data: updated, error } = await supabase
        .from('cash_register_closings')
        .update({ is_finalized: false, finalized_at: null, notes: newNotes })
        .eq('id', closing.id)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error('Permissão negada.');

      setReopeningClosing(null);
      // Clear expanded cache so it reloads fresh
      setExpandedTransactions(prev => {
        const next = { ...prev };
        delete next[closing.id];
        return next;
      });
      loadToday();
      loadHistory();
    } catch (err) {
      showToast('error', 'Erro', parseSupabaseError(err).title);
    } finally {
      setReopening(false);
    }
  }

  // Computed for today summary
  const methodTotals = todayTransactions
    .filter(t => t.type !== 'reversal')
    .reduce((acc, t) => {
      acc[t.payment_method] = (acc[t.payment_method] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalReceived = todayClosing?.total_amount ?? 0;
  const canFinalizeToday = todayClosing && !todayClosing.is_finalized && todayTransactions.length > 0;

  // FinalizeConfirmSheet scenario
  const linkedTransactions = todayTransactions.filter(t => t.appointment_id && t.appointment);
  const expectedTotal =
    linkedTransactions.length > 0
      ? linkedTransactions.reduce((sum, t) => {
          const price = t.appointment?.procedure.default_price ?? 0;
          const down = t.appointment?.downpayment_amount ?? 0;
          return sum + (price - down);
        }, 0)
      : null;
  const linkedActual = linkedTransactions.reduce((s, t) => s + t.amount, 0);
  const scenario: 'zero' | 'divergent' | 'normal' =
    totalReceived === 0
      ? 'zero'
      : expectedTotal !== null && expectedTotal > 0 && Math.abs(linkedActual - expectedTotal) > 0.01
      ? 'divergent'
      : 'normal';

  function getApptTx(apptId: string) {
    return todayTransactions.filter(t => t.appointment_id === apptId && t.type !== 'reversal');
  }

  const todayFormatted = new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  return (
    <div className="space-y-6">
      {ToastComponent}

      <div>
        <h1 className="text-2xl font-bold text-text">
          {isSuperAdmin ? 'Fechamentos de Caixa' : 'Fechar Caixa'}
        </h1>
        <p className="text-text-muted mt-1">
          {isSuperAdmin
            ? 'Visualize e gerencie os fechamentos de caixa'
            : 'Gerencie os pagamentos e o fechamento diário'}
        </p>
      </div>

      {/* Super admin professional filter */}
      {isSuperAdmin && (
        <div className="bg-background-card rounded-xl border border-accent/10 shadow-card p-4">
          <label className="block text-sm font-medium text-text mb-2">Profissional</label>
          <select
            value={selectedProfessional}
            onChange={e => setSelectedProfessional(e.target.value)}
            className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* TODAY SECTION */}
      {(!isSuperAdmin || selectedProfessional) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text capitalize">{todayFormatted}</h2>
            {todayClosing?.is_finalized && (
              <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                <Check className="w-3 h-3" />
                Fechado
              </span>
            )}
          </div>

          {loadingToday ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary card — only if a closing exists */}
              {todayClosing && (
                <div className="bg-background-card rounded-xl border border-accent/10 shadow-card p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm text-text-muted mb-1">Total recebido</p>
                      <p className="text-3xl font-bold text-text">R$ {totalReceived.toFixed(2)}</p>
                      {Object.keys(methodTotals).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(methodTotals).map(([method, amount]) => (
                            <span
                              key={method}
                              className="px-3 py-1 bg-champagne-nuvem rounded-full text-xs font-medium text-text border border-accent/10"
                            >
                              {METHOD_LABELS[method] ?? method} R$ {amount.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {todayClosing.is_finalized ? (
                        <button
                          onClick={() => setReopeningClosing(todayClosing)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-champagne-nuvem border border-accent/15 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reabrir
                        </button>
                      ) : canFinalizeToday ? (
                        <button
                          onClick={() => setShowFinalizeSheet(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
                        >
                          <Check className="w-4 h-4" />
                          Fechar o dia
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Today movement list */}
              {todayAppts.length > 0 ? (
                <div className="bg-background-card rounded-xl border border-accent/10 shadow-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-accent/10">
                    <h3 className="font-semibold text-text">Movimento do Dia</h3>
                  </div>
                  <div className="divide-y divide-accent/5">
                    {todayAppts.map(appt => {
                      const txs = getApptTx(appt.id);
                      // isPaid: source of truth é payment_status, não os txs de hoje
                      const isPaid = appt.payment_status === 'paid';
                      const needsPayment =
                        appt.status === 'completed' &&
                        (!appt.payment_status ||
                          appt.payment_status === 'none' ||
                          appt.payment_status === 'partial' ||
                          appt.payment_status === 'reopened');
                      const isPending =
                        appt.status === 'scheduled' || appt.status === 'confirmed';
                      const isCompleted = appt.status === 'completed';
                      const isUndoing = undoCompleteId === appt.id;

                      return (
                        <div key={appt.id} className="flex items-center gap-3 px-5 py-4">
                          <span className="text-sm font-medium text-text-muted w-11 flex-shrink-0">
                            {appt.appointment_time.substring(0, 5)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text truncate">
                              {appt.patient?.full_name}
                            </p>
                            <p className="text-xs text-text-muted truncate">
                              {appt.procedure?.name}
                              {appt.procedure?.default_price
                                ? ` · R$ ${appt.procedure.default_price.toFixed(2)}`
                                : ''}
                            </p>
                          </div>

                          {/* Confirmação inline de desfazer conclusão */}
                          {isUndoing ? (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-orange-700 whitespace-nowrap">Desfazer?</span>
                              <button
                                onClick={() => setUndoCompleteId(null)}
                                className="py-1.5 px-3 text-xs text-text border border-accent/15 hover:bg-champagne-nuvem rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleUndoComplete(appt)}
                                className="py-1.5 px-3 text-xs text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                              >
                                Confirmar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isPaid ? (
                                <>
                                  <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">
                                    <Check className="w-3 h-3" />
                                    {txs.length > 0
                                      ? txs
                                          .map(t => METHOD_LABELS[t.payment_method] ?? t.payment_method)
                                          .filter((v, i, a) => a.indexOf(v) === i)
                                          .join(', ')
                                      : 'Pago'}
                                  </span>
                                  {!todayClosing?.is_finalized && txs.length === 1 && (
                                    <button
                                      onClick={() => { setSelectedTx(txs[0]); setShowEditTx(true); }}
                                      className="p-1.5 hover:bg-champagne-nuvem rounded-lg transition-colors text-text-muted"
                                      title="Editar transação"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              ) : needsPayment ? (
                                <>
                                  <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-200 whitespace-nowrap">
                                    Falta pagar
                                  </span>
                                  <button
                                    onClick={() => { setSelectedAppt(appt); setShowPaymentModal(true); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Registrar
                                  </button>
                                </>
                              ) : isPending ? (
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200 whitespace-nowrap">
                                  A cobrar
                                </span>
                              ) : null}

                              {/* Botão desfazer conclusão — disponível para todo atendimento realizado */}
                              {isCompleted && !todayClosing?.is_finalized && (
                                <button
                                  onClick={() => setUndoCompleteId(appt.id)}
                                  className="p-1.5 hover:bg-champagne-nuvem rounded-lg transition-colors text-orange-500"
                                  title="Desfazer conclusão"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!todayClosing?.is_finalized && todayClosing && (
                    <div className="px-5 py-4 border-t border-accent/10">
                      <button
                        onClick={() => setShowAddTx(true)}
                        className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Transação manual
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-background-card rounded-xl border border-accent/10 shadow-card p-8 text-center">
                  <Calendar className="w-10 h-10 text-text-muted mx-auto mb-3" />
                  <p className="text-text-muted">Nenhum atendimento agendado para hoje</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* HISTORY SECTION */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text">Histórico</h2>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : closings.length === 0 ? (
          <div className="bg-background-card rounded-xl border border-accent/10 shadow-card p-8 text-center">
            <TrendingUp className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">Nenhum fechamento anterior</p>
          </div>
        ) : (
          <div className="space-y-2">
            {closings.map(closing => {
              const isExpanded = expandedClosingId === closing.id;
              const txList = expandedTransactions[closing.id] || [];
              const isLoadingTxs = loadingExpanded[closing.id] || false;

              return (
                <div
                  key={closing.id}
                  className="bg-background-card rounded-xl border border-accent/10 shadow-card overflow-hidden"
                >
                  {/* Closing header row */}
                  <button
                    onClick={() => toggleExpand(closing.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-champagne-nuvem/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="font-medium text-text">
                          {new Date(closing.closing_date + 'T12:00:00').toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                          })}
                        </p>
                        {isSuperAdmin && closing.professional && (
                          <p className="text-xs text-text-muted">{closing.professional.full_name}</p>
                        )}
                      </div>
                      <span className="text-lg font-bold text-text">
                        R$ {closing.total_amount.toFixed(2)}
                      </span>
                      {closing.is_finalized ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                          <Check className="w-3 h-3" />
                          Finalizado
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full border border-accent/10">
                          Em Aberto
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-text-muted flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-text-muted flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded transactions */}
                  {isExpanded && (
                    <div className="border-t border-accent/10">
                      {isLoadingTxs ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        </div>
                      ) : txList.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-text-muted">
                          Nenhuma transação registrada
                        </div>
                      ) : (
                        <div className="divide-y divide-accent/5">
                          {txList.map(tx => (
                            <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-text">
                                    R$ {tx.amount.toFixed(2)}
                                  </span>
                                  <span className="px-2 py-0.5 bg-champagne-nuvem rounded-full text-xs font-medium text-text border border-accent/10">
                                    {METHOD_LABELS[tx.payment_method] ?? tx.payment_method}
                                  </span>
                                </div>
                                {tx.appointment && (
                                  <p className="text-xs text-text-muted mt-0.5">
                                    {tx.appointment.patient.full_name} ·{' '}
                                    {tx.appointment.procedure.name}
                                  </p>
                                )}
                                {tx.notes && (
                                  <p className="text-xs text-text-muted mt-0.5">{tx.notes}</p>
                                )}
                              </div>
                              {!closing.is_finalized && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {confirmDeleteId === tx.id ? (
                                    <>
                                      <button
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="py-1.5 px-3 text-xs text-text border border-accent/15 hover:bg-champagne-nuvem rounded-lg transition-colors"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() => deleteHistoryTransaction(tx.id, closing.id)}
                                        className="py-1.5 px-3 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                                      >
                                        Excluir
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteId(tx.id)}
                                      className="p-1.5 hover:bg-background rounded-lg transition-colors text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions row for this closing */}
                      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-accent/10">
                        {closing.is_finalized ? (
                          <button
                            onClick={() => setReopeningClosing(closing)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-champagne-nuvem border border-accent/15 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reabrir
                          </button>
                        ) : (
                          <>
                            {confirmFinalizeId === closing.id ? (
                              <>
                                <button
                                  onClick={() => setConfirmFinalizeId(null)}
                                  className="py-2 px-4 text-sm text-text border border-accent/15 hover:bg-champagne-nuvem rounded-lg transition-colors"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => finalizeHistoryClosing(closing.id)}
                                  disabled={finalizingHistoryId === closing.id}
                                  className="flex items-center gap-2 py-2 px-4 text-sm text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {finalizingHistoryId === closing.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  Confirmar
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmFinalizeId(closing.id)}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors"
                              >
                                <Check className="w-4 h-4" />
                                Finalizar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALS */}

      {/* Register Payment from today's movement list */}
      {showPaymentModal && selectedAppt && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setSelectedAppt(null); }}
          appointmentId={selectedAppt.id}
          patientId={selectedAppt.patient_id}
          patientName={selectedAppt.patient?.full_name || ''}
          procedureName={selectedAppt.procedure?.name || ''}
          totalAmount={selectedAppt.procedure?.default_price || 0}
          downpaymentAmount={selectedAppt.downpayment_amount}
          downpaymentMethod={selectedAppt.downpayment_method}
          onSuccess={() => { setShowPaymentModal(false); setSelectedAppt(null); loadToday(); }}
        />
      )}

      {/* Edit existing transaction */}
      {showEditTx && selectedTx && (
        <EditTransactionSheet
          isOpen={showEditTx}
          transaction={selectedTx}
          onClose={() => { setShowEditTx(false); setSelectedTx(null); }}
          onSuccess={() => { setShowEditTx(false); setSelectedTx(null); loadToday(); }}
        />
      )}

      {/* Manual transaction */}
      {showAddTx && todayClosing && (
        <AddTransactionModal
          closingId={todayClosing.id}
          professionalId={todayClosing.professional_id}
          onClose={() => setShowAddTx(false)}
          onSuccess={() => { setShowAddTx(false); loadToday(); }}
        />
      )}

      {/* Finalize today */}
      <FinalizeConfirmSheet
        isOpen={showFinalizeSheet}
        scenario={scenario}
        totalAmount={totalReceived}
        expectedTotal={expectedTotal}
        linkedActual={linkedActual}
        onConfirm={doFinalize}
        onCancel={() => setShowFinalizeSheet(false)}
        isLoading={finalizing}
      />

      {/* Reopen (today or history) */}
      <ReopenCashRegisterSheet
        isOpen={!!reopeningClosing}
        onConfirm={doReopen}
        onCancel={() => setReopeningClosing(null)}
        isLoading={reopening}
      />
    </div>
  );
}

// ─── Add Transaction Modal ─────────────────────────────────────────────────

interface AddTransactionModalProps {
  closingId: string;
  professionalId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddTransactionModal({ closingId, professionalId, onClose, onSuccess }: AddTransactionModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const { showToast, ToastComponent } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('cash_register_transactions')
        .insert({
          closing_id: closingId,
          appointment_id: null,
          professional_id: professionalId,
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          notes: notes || null,
        });
      if (error) throw error;
      onSuccess();
    } catch (error) {
      const appErr = parseSupabaseError(error);
      showToast('error', appErr.title, appErr.description);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-[60]">
      {ToastComponent}
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <div className="flex items-start justify-between mb-6">
          <h3 className="text-lg font-semibold text-text">Transação Manual</h3>
          <button onClick={onClose} className="p-1 hover:bg-champagne-nuvem rounded-lg transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
              placeholder="0.00"
              required
              disabled={loading}
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">Forma de Pagamento</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            >
              <option>Dinheiro</option>
              <option>Cartão de Crédito</option>
              <option>Cartão de Débito</option>
              <option>PIX</option>
              <option>Transferência</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Finalize Confirm Sheet ────────────────────────────────────────────────

interface FinalizeConfirmSheetProps {
  isOpen: boolean;
  scenario: 'zero' | 'divergent' | 'normal';
  totalAmount: number;
  expectedTotal: number | null;
  linkedActual: number;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function FinalizeConfirmSheet({
  isOpen,
  scenario,
  totalAmount,
  expectedTotal,
  linkedActual,
  onConfirm,
  onCancel,
  isLoading,
}: FinalizeConfirmSheetProps) {
  const [reason, setReason] = useState('');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const canConfirm = scenario !== 'divergent' || reason.trim().length >= 10;

  const content = (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        {scenario === 'normal' ? (
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        ) : (
          <AlertTriangle className="w-12 h-12 text-orange-500" />
        )}
        <h3 className="text-lg font-semibold text-text">
          {scenario === 'zero' && 'Nenhum valor registrado'}
          {scenario === 'divergent' && 'Valor divergente do esperado'}
          {scenario === 'normal' && 'Confirmar finalização'}
        </h3>
      </div>

      {scenario === 'zero' && (
        <p className="text-sm text-text-muted text-center">
          Isso é permitido para serviços gratuitos como avaliações.
        </p>
      )}

      {scenario === 'divergent' && expectedTotal !== null && (
        <>
          <div className="bg-champagne-nuvem rounded-lg border border-accent/10 divide-y divide-accent/10">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-text-muted">Esperado</span>
              <span className="text-sm font-medium text-text">R$ {expectedTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-text-muted">Registrado</span>
              <span className="text-sm font-medium text-text">R$ {linkedActual.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-text-muted">Diferença</span>
              <span
                className={`text-sm font-semibold ${
                  linkedActual - expectedTotal < 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {linkedActual - expectedTotal >= 0 ? '+' : ''}R${' '}
                {(linkedActual - expectedTotal).toFixed(2)}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Motivo da divergência <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
              rows={3}
              placeholder="Descreva o motivo da diferença de valor..."
              disabled={isLoading}
            />
            {reason.trim().length > 0 && reason.trim().length < 10 && (
              <p className="text-xs text-red-500 mt-1">
                Mínimo de 10 caracteres ({reason.trim().length}/10)
              </p>
            )}
          </div>
        </>
      )}

      {scenario === 'normal' && (
        <p className="text-sm text-text-muted text-center">
          Total: R$ {totalAmount.toFixed(2)}. Esta ação não pode ser desfeita.
        </p>
      )}

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
          onClick={() => onConfirm(scenario === 'divergent' ? reason.trim() : undefined)}
          disabled={!canConfirm || isLoading}
          className="flex-1 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {scenario === 'zero' && 'Finalizar mesmo assim'}
          {scenario === 'divergent' && 'Confirmar com justificativa'}
          {scenario === 'normal' && 'Finalizar'}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} title="Fechar o Dia" onClose={onCancel}>
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
