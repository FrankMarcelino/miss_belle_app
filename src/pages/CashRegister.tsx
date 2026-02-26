import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PaymentModal from '../components/PaymentModal';
import { useToast } from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import BottomSheet from '../components/mobile/BottomSheet';
import ReopenCashRegisterSheet from '../components/ReopenCashRegisterSheet';
import { Plus, Loader2, DollarSign, X, Check, Calendar, TrendingUp, Trash2, Clock, User, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

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
  notes: string | null;
  created_at: string;
  appointment?: {
    downpayment_amount: number;
    patient: { full_name: string };
    procedure: { name: string; default_price: number };
  };
}

interface Professional {
  id: string;
  full_name: string;
}

interface PendingAppointment {
  id: string;
  appointment_time: string;
  downpayment_amount: number;
  downpayment_method: 'dinheiro' | 'credito' | 'debito' | 'pix' | null;
  patient: { full_name: string };
  procedure: { name: string; default_price: number };
}

export default function CashRegister() {
  const { user, isSuperAdmin } = useAuth();
  const [closings, setClosings] = useState<CashRegisterClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClosing, setSelectedClosing] = useState<CashRegisterClosing | null>(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [dateFilter, setDateFilter] = useState<string>('');

  const [pendingAppointments, setPendingAppointments] = useState<PendingAppointment[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<PendingAppointment | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    if (isSuperAdmin) {
      loadProfessionals();
    }
    loadClosings();
    loadPendingAppointments();
  }, [user, isSuperAdmin, selectedProfessional, dateFilter]);

  async function loadProfessionals() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setProfessionals(data || []);
    } catch {
    }
  }

  async function loadClosings() {
    try {
      setLoading(true);
      let query = supabase
        .from('cash_register_closings')
        .select('*, professional:profiles(full_name)')
        .order('closing_date', { ascending: false });

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      } else if (selectedProfessional) {
        query = query.eq('professional_id', selectedProfessional);
      }

      if (dateFilter) {
        query = query.eq('closing_date', dateFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setClosings(data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingAppointments() {
    try {
      setLoadingPending(true);
      const today = new Date().toISOString().split('T')[0];

      let query = supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          downpayment_amount,
          downpayment_method,
          patient:patients(full_name),
          procedure:procedures(name, default_price)
        `)
        .eq('appointment_date', today)
        .in('status', ['scheduled', 'confirmed'])
        .order('appointment_time');

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      } else if (selectedProfessional) {
        query = query.eq('professional_id', selectedProfessional);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPendingAppointments((data || []) as unknown as PendingAppointment[]);
    } catch {
    } finally {
      setLoadingPending(false);
    }
  }

  async function createClosing() {
    const today = new Date().toISOString().split('T')[0];

    try {
      const { data: existing } = await supabase
        .from('cash_register_closings')
        .select('id')
        .eq('professional_id', user?.id)
        .eq('closing_date', today)
        .maybeSingle();

      if (existing) {
        showToast('warning', 'Fechamento já existe', 'Já existe um fechamento para hoje. Abra-o para adicionar transações.');
        return;
      }

      const { data, error } = await supabase
        .from('cash_register_closings')
        .insert({
          professional_id: user?.id,
          closing_date: today,
          total_amount: 0,
        })
        .select('*, professional:profiles(full_name)')
        .single();

      if (error) throw error;

      setSelectedClosing(data);
      setShowTransactions(true);
      loadClosings();
    } catch (error) {
      const appErr = parseSupabaseError(error);
      showToast('error', appErr.title, appErr.description);
    }
  }

  function openClosing(closing: CashRegisterClosing) {
    setSelectedClosing(closing);
    setShowTransactions(true);
  }

  function handleClosePayment(appointment: PendingAppointment) {
    setSelectedAppointment(appointment);
    setShowPaymentModal(true);
  }

  function handlePaymentSuccess() {
    setShowPaymentModal(false);
    setSelectedAppointment(null);
    loadPendingAppointments();
    loadClosings();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ToastComponent}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {isSuperAdmin ? 'Fechamentos de Caixa' : 'Fechar Caixa'}
          </h1>
          <p className="text-text-muted mt-1">
            {isSuperAdmin
              ? 'Visualize e gerencie os fechamentos de caixa'
              : 'Registre suas receitas diárias'}
          </p>
        </div>
        {!isSuperAdmin && (
          <button
            onClick={createClosing}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
          >
            <Plus className="w-5 h-5" />
            Novo Fechamento
          </button>
        )}
      </div>

      <div className="bg-background-card rounded-xl border border-accent/10 shadow-card">
        <div className="p-6 border-b border-accent/10 space-y-4">
          <div className="flex flex-wrap gap-4">
            {isSuperAdmin && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-text mb-2">
                  Profissional
                </label>
                <select
                  value={selectedProfessional}
                  onChange={(e) => setSelectedProfessional(e.target.value)}
                  className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                >
                  <option value="">Todos os profissionais</option>
                  {professionals.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-text mb-2">
                Data
              </label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              />
            </div>

            {(selectedProfessional || dateFilter) && (
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSelectedProfessional('');
                    setDateFilter('');
                  }}
                  className="px-4 py-2 text-sm text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
                >
                  Limpar Filtros
                </button>
              </div>
            )}
          </div>
        </div>

        {pendingAppointments.length > 0 && (
          <div className="border-b border-accent/10 p-6">
            <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Atendimentos Pendentes de Pagamento
            </h2>
            {loadingPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {pendingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="bg-white rounded-xl p-4 border shadow-card border-accent/10 hover:shadow-card-hover transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-text">
                            {appointment.appointment_time.substring(0, 5)}
                          </span>
                          <span className="text-text flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {appointment.patient?.full_name}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted mb-2">
                          {appointment.procedure?.name} - R$ {appointment.procedure?.default_price.toFixed(2)}
                        </p>
                        {appointment.downpayment_amount > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded px-2 py-1 inline-block">
                            <p className="text-xs text-green-700 font-medium">
                              Calção: R$ {appointment.downpayment_amount.toFixed(2)} ({
                                appointment.downpayment_method === 'dinheiro' ? 'Dinheiro' :
                                appointment.downpayment_method === 'credito' ? 'Crédito' :
                                appointment.downpayment_method === 'debito' ? 'Débito' : 'PIX'
                              })
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleClosePayment(appointment)}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft flex items-center gap-2 whitespace-nowrap"
                      >
                        <DollarSign className="w-4 h-4" />
                        Fechar Caixa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {closings.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted">
              {dateFilter || selectedProfessional
                ? 'Nenhum fechamento encontrado com os filtros aplicados'
                : 'Nenhum fechamento cadastrado'}
            </p>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {closings.map((closing) => (
                <div
                  key={closing.id}
                  onClick={() => openClosing(closing)}
                  className={`bg-white rounded-xl p-5 border shadow-card cursor-pointer hover:shadow-card-hover transition-all ${
                    closing.is_finalized
                      ? 'border-green-200 bg-green-50'
                      : 'border-accent/10'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-text-muted" />
                      <span className="font-semibold text-text">
                        {new Date(closing.closing_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {closing.is_finalized ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                        <Check className="w-3 h-3" />
                        Finalizado
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full border border-accent/10">
                        Em Aberto
                      </span>
                    )}
                  </div>

                  {closing.professional && (
                    <p className="text-sm text-text-muted mb-3">
                      {closing.professional.full_name}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-2xl font-bold text-text">
                    <DollarSign className="w-6 h-6" />
                    R$ {closing.total_amount.toFixed(2)}
                  </div>

                  {closing.notes && (
                    <p className="mt-3 text-sm text-text-muted line-clamp-2">
                      {closing.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showTransactions && selectedClosing && (
        <TransactionsModal
          closing={selectedClosing}
          onClose={() => {
            setShowTransactions(false);
            setSelectedClosing(null);
            loadClosings();
          }}
          onUpdate={loadClosings}
        />
      )}

      {showPaymentModal && selectedAppointment && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          appointmentId={selectedAppointment.id}
          patientName={selectedAppointment.patient?.full_name || ''}
          procedureName={selectedAppointment.procedure?.name || ''}
          totalAmount={selectedAppointment.procedure?.default_price || 0}
          downpaymentAmount={selectedAppointment.downpayment_amount}
          downpaymentMethod={selectedAppointment.downpayment_method}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}

interface TransactionsModalProps {
  closing: CashRegisterClosing;
  onClose: () => void;
  onUpdate: () => void;
}

function TransactionsModal({ closing, onClose, onUpdate }: TransactionsModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [currentClosing, setCurrentClosing] = useState<CashRegisterClosing>(closing);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showFinalizeSheet, setShowFinalizeSheet] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showReopenSheet, setShowReopenSheet] = useState(false);
  const [reopening, setReopening] = useState(false);

  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    loadTransactions();
  }, [closing.id]);

  async function loadTransactions() {
    try {
      setLoading(true);

      const { data: closingData, error: closingError } = await supabase
        .from('cash_register_closings')
        .select('*, professional:profiles(full_name)')
        .eq('id', closing.id)
        .single();

      if (closingError) throw closingError;
      if (closingData) {
        setCurrentClosing(closingData);
      }

      const { data, error } = await supabase
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function deleteTransaction(transactionId: string) {
    try {
      const { error } = await supabase
        .from('cash_register_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;

      setConfirmDeleteId(null);
      loadTransactions();
      onUpdate();
    } catch (err) {
      const appErr = parseSupabaseError(err);
      showToast('error', appErr.title, appErr.description);
    }
  }

  async function doFinalize(reason?: string) {
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
        .eq('id', currentClosing.id)
        .select('id');

      if (error) throw error;

      if (!updated || updated.length === 0) {
        throw new Error('Permissão negada. Verifique se você tem acesso para finalizar este fechamento.');
      }

      setShowFinalizeSheet(false);
      onUpdate();
      onClose();
    } catch (err) {
      const appErr = parseSupabaseError(err);
      showToast('error', appErr.title, appErr.description);
    } finally {
      setFinalizing(false);
    }
  }

  async function doReopen(reason: string) {
    setReopening(true);
    try {
      const notesEntry = `Reaberto em ${new Date().toLocaleString('pt-BR')}: ${reason}`;
      const newNotes = currentClosing.notes
        ? `${currentClosing.notes}\n${notesEntry}`
        : notesEntry;

      const { data: updated, error } = await supabase
        .from('cash_register_closings')
        .update({ is_finalized: false, finalized_at: null, notes: newNotes })
        .eq('id', currentClosing.id)
        .select('id');

      if (error) throw error;

      if (!updated || updated.length === 0) {
        throw new Error('Permissão negada. Verifique se você tem acesso para reabrir este fechamento.');
      }

      setShowReopenSheet(false);
      loadTransactions();
      onUpdate();
    } catch (err) {
      const appErr = parseSupabaseError(err);
      showToast('error', appErr.title, appErr.description);
    } finally {
      setReopening(false);
    }
  }

  // Calculate scenario
  const linkedTransactions = transactions.filter((t) => t.appointment);
  const expectedTotal =
    linkedTransactions.length > 0
      ? linkedTransactions.reduce((sum, t) => {
          const price = t.appointment?.procedure.default_price ?? 0;
          const down = t.appointment?.downpayment_amount ?? 0;
          return sum + (price - down);
        }, 0)
      : null;
  const linkedActual = linkedTransactions.reduce((sum, t) => sum + t.amount, 0);

  const scenario: 'zero' | 'divergent' | 'normal' =
    currentClosing.total_amount === 0
      ? 'zero'
      : expectedTotal !== null &&
        expectedTotal > 0 &&
        Math.abs(linkedActual - expectedTotal) > 0.01
      ? 'divergent'
      : 'normal';

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      {ToastComponent}
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-3xl w-full p-6 border border-accent/10 my-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-text">Fechamento de Caixa</h2>
            <p className="text-text-muted mt-1">
              {new Date(closing.closing_date).toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-champagne-nuvem rounded-lg transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="bg-champagne-nuvem rounded-lg p-6 mb-6 border border-accent/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-muted mb-1">Total do Dia</p>
              <div className="flex items-center gap-2 text-3xl font-bold text-text">
                <DollarSign className="w-8 h-8" />
                R$ {currentClosing.total_amount.toFixed(2)}
              </div>
            </div>
            {currentClosing.is_finalized ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg border border-green-200">
                  <Check className="w-5 h-5" />
                  Finalizado
                </div>
                <button
                  onClick={() => setShowReopenSheet(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-champagne-nuvem border border-accent/15 rounded-lg transition-colors"
                  title="Reabrir fechamento"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reabrir
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowFinalizeSheet(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
              >
                <Check className="w-5 h-5" />
                Finalizar
              </button>
            )}
          </div>
        </div>

        {!currentClosing.is_finalized && (
          <div className="mb-6">
            <button
              onClick={() => setShowAddTransaction(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nova Transação
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted">Nenhuma transação registrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="bg-white rounded-xl p-4 border shadow-card border-accent/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-bold text-text">
                        R$ {transaction.amount.toFixed(2)}
                      </span>
                      <span className="px-3 py-1 bg-background rounded-full text-xs font-medium text-text border border-accent/10">
                        {transaction.payment_method}
                      </span>
                    </div>
                    {transaction.appointment && (
                      <p className="text-sm text-text-muted">
                        {transaction.appointment.patient.full_name} -{' '}
                        {transaction.appointment.procedure.name}
                      </p>
                    )}
                    {transaction.notes && (
                      <p className="text-sm text-text-muted mt-1">{transaction.notes}</p>
                    )}
                  </div>
                  {!currentClosing.is_finalized && (
                    <div className="flex items-center gap-2 ml-2">
                      {confirmDeleteId === transaction.id ? (
                        <>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="py-2 px-4 text-sm text-text border border-accent/15 hover:bg-champagne-nuvem rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => deleteTransaction(transaction.id)}
                            className="py-2 px-4 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                          >
                            Excluir
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(transaction.id)}
                          className="p-2 hover:bg-background rounded-lg transition-colors text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddTransaction && !currentClosing.is_finalized && (
          <AddTransactionModal
            closingId={currentClosing.id}
            professionalId={currentClosing.professional_id}
            onClose={() => setShowAddTransaction(false)}
            onSuccess={() => {
              setShowAddTransaction(false);
              loadTransactions();
              onUpdate();
            }}
          />
        )}

        <FinalizeConfirmSheet
          isOpen={showFinalizeSheet}
          scenario={scenario}
          totalAmount={currentClosing.total_amount}
          expectedTotal={expectedTotal}
          linkedActual={linkedActual}
          onConfirm={doFinalize}
          onCancel={() => setShowFinalizeSheet(false)}
          isLoading={finalizing}
        />

        <ReopenCashRegisterSheet
          isOpen={showReopenSheet}
          onConfirm={doReopen}
          onCancel={() => setShowReopenSheet(false)}
          isLoading={reopening}
        />
      </div>
    </div>
  );
}

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
  const isMobile = window.innerWidth < 768;

  const canConfirm = scenario !== 'divergent' || reason.trim().length >= 10;

  const content = (
    <div className="space-y-5">
      {/* Icon + title */}
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

      {/* Scenario-specific content */}
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
              <span className="text-sm font-medium text-text">
                R$ {expectedTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-text-muted">Registrado</span>
              <span className="text-sm font-medium text-text">
                R$ {linkedActual.toFixed(2)}
              </span>
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
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
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

      {/* Buttons */}
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
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {scenario === 'zero' && 'Finalizar mesmo assim'}
          {scenario === 'divergent' && 'Confirmar com justificativa'}
          {scenario === 'normal' && 'Finalizar'}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} title="Finalizar Caixa" onClose={onCancel}>
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

interface AddTransactionModalProps {
  closingId: string;
  professionalId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface TodayAppointment {
  id: string;
  patient: { full_name: string } | null;
  procedure: { name: string } | null;
}

function AddTransactionModal({ closingId, professionalId, onClose, onSuccess }: AddTransactionModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [notes, setNotes] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(false);

  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    loadTodayAppointments();
  }, [professionalId]);

  async function loadTodayAppointments() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient:patients(full_name), procedure:procedures(name)')
        .eq('professional_id', professionalId)
        .eq('appointment_date', today)
        .eq('status', 'completed');

      if (error) throw error;
      setAppointments((data || []) as unknown as TodayAppointment[]);
    } catch {
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error: transactionError } = await supabase
        .from('cash_register_transactions')
        .insert({
          closing_id: closingId,
          appointment_id: appointmentId || null,
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          notes: notes || null,
        });

      if (transactionError) throw transactionError;

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
          <h3 className="text-lg font-semibold text-text">Nova Transação</h3>
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
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              disabled={loading}
            >
              <option>Dinheiro</option>
              <option>Cartão de Crédito</option>
              <option>Cartão de Débito</option>
              <option>PIX</option>
              <option>Transferência</option>
            </select>
          </div>

          {appointments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Atendimento (opcional)
              </label>
              <select
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                disabled={loading}
              >
                <option value="">Não vincular</option>
                {appointments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.patient?.full_name} - {apt.procedure?.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text mb-2">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
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
