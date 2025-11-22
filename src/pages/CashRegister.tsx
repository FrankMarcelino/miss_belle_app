import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Loader2, DollarSign, X, Check, Calendar, TrendingUp, Trash2 } from 'lucide-react';

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
    patient: { full_name: string };
    procedure: { name: string };
  };
}

interface Professional {
  id: string;
  full_name: string;
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

  useEffect(() => {
    if (isSuperAdmin) {
      loadProfessionals();
    }
    loadClosings();
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
    } catch (error) {
      console.error('Error loading professionals:', error);
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
    } catch (error) {
      console.error('Error loading closings:', error);
    } finally {
      setLoading(false);
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
        alert('Já existe um fechamento para hoje. Abra-o para adicionar transações.');
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
    } catch (error: any) {
      console.error('Error creating closing:', error);
      alert(error.message || 'Erro ao criar fechamento');
    }
  }

  function openClosing(closing: CashRegisterClosing) {
    setSelectedClosing(closing);
    setShowTransactions(true);
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

      <div className="bg-background-card rounded-xl border border-accent/20 shadow-card">
        <div className="p-6 border-b border-accent/20 space-y-4">
          <div className="flex flex-wrap gap-4">
            {isSuperAdmin && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-text mb-2">
                  Profissional
                </label>
                <select
                  value={selectedProfessional}
                  onChange={(e) => setSelectedProfessional(e.target.value)}
                  className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
                  className={`bg-champagne-nuvem rounded-lg p-5 border cursor-pointer hover:shadow-soft transition-all ${
                    closing.is_finalized
                      ? 'border-green-200 bg-green-50'
                      : 'border-accent/20'
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
                      <span className="px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full border border-accent/20">
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

  useEffect(() => {
    loadTransactions();
  }, [closing.id]);

  async function loadTransactions() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cash_register_transactions')
        .select(`
          *,
          appointment:appointments(
            patient:patients(full_name),
            procedure:procedures(name)
          )
        `)
        .eq('closing_id', closing.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTransaction(transactionId: string) {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('cash_register_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;

      await updateTotal();
      loadTransactions();
      onUpdate();
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  }

  async function updateTotal() {
    const total = transactions
      .filter((t) => t.id !== transactions[0]?.id)
      .reduce((sum, t) => sum + t.amount, 0);

    await supabase
      .from('cash_register_closings')
      .update({ total_amount: total })
      .eq('id', closing.id);
  }

  async function finalizeClosing() {
    if (!confirm('Finalizar o fechamento? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('cash_register_closings')
        .update({
          is_finalized: true,
          finalized_at: new Date().toISOString(),
        })
        .eq('id', closing.id);

      if (error) throw error;

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error finalizing closing:', error);
    }
  }

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-3xl w-full p-6 border border-accent/20 my-8">
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

        <div className="bg-champagne-nuvem rounded-lg p-6 mb-6 border border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-muted mb-1">Total do Dia</p>
              <div className="flex items-center gap-2 text-3xl font-bold text-text">
                <DollarSign className="w-8 h-8" />
                R$ {totalAmount.toFixed(2)}
              </div>
            </div>
            {closing.is_finalized ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg border border-green-200">
                <Check className="w-5 h-5" />
                Finalizado
              </div>
            ) : (
              <button
                onClick={finalizeClosing}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
              >
                <Check className="w-5 h-5" />
                Finalizar
              </button>
            )}
          </div>
        </div>

        {!closing.is_finalized && (
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
                className="bg-champagne-nuvem rounded-lg p-4 border border-accent/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-bold text-text">
                        R$ {transaction.amount.toFixed(2)}
                      </span>
                      <span className="px-3 py-1 bg-background rounded-full text-xs font-medium text-text border border-accent/20">
                        {transaction.payment_method}
                      </span>
                    </div>
                    {transaction.appointment && (
                      <p className="text-sm text-text-muted">
                        {transaction.appointment.patient.full_name} - {transaction.appointment.procedure.name}
                      </p>
                    )}
                    {transaction.notes && (
                      <p className="text-sm text-text-muted mt-1">{transaction.notes}</p>
                    )}
                  </div>
                  {!closing.is_finalized && (
                    <button
                      onClick={() => deleteTransaction(transaction.id)}
                      className="p-2 hover:bg-background rounded-lg transition-colors text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddTransaction && !closing.is_finalized && (
          <AddTransactionModal
            closingId={closing.id}
            professionalId={closing.professional_id}
            onClose={() => setShowAddTransaction(false)}
            onSuccess={() => {
              setShowAddTransaction(false);
              loadTransactions();
              onUpdate();
            }}
          />
        )}
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

function AddTransactionModal({ closingId, professionalId, onClose, onSuccess }: AddTransactionModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [notes, setNotes] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
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

      const { data: transactions } = await supabase
        .from('cash_register_transactions')
        .select('amount')
        .eq('closing_id', closingId);

      const total = (transactions || []).reduce((sum, t) => sum + t.amount, 0) + parseFloat(amount);

      const { error: updateError } = await supabase
        .from('cash_register_closings')
        .update({ total_amount: total })
        .eq('id', closingId);

      if (updateError) throw updateError;

      onSuccess();
    } catch (error: any) {
      console.error('Error adding transaction:', error);
      alert(error.message || 'Erro ao adicionar transação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/20">
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                disabled={loading}
              >
                <option value="">Não vincular</option>
                {appointments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.patient.full_name} - {apt.procedure.name}
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
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
