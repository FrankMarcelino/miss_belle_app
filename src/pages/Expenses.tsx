import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import BottomSheet from '../components/mobile/BottomSheet';
import {
  Plus, Loader2, ChevronLeft, ChevronRight,
  Check, Clock, Home, Zap, TrendingUp,
  MoreHorizontal, Upload, Eye,
  Repeat, Tag, Users, Trash2, AlertTriangle, X,
  Droplets, ChevronDown, ChevronUp, Pencil, UserCircle,
  Sparkles, Scissors, HardHat, Box, Wifi, Gift,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory =
  | 'aluguel'      // aluguel do espaço e locações
  | 'energia'      // água, luz, gás — contas fixas do imóvel
  | 'internet'     // internet, telefone, streaming
  | 'insumos'      // produtos consumidos nos atendimentos
  | 'limpeza'      // faxineira, dedetização, jardineiro, descartáveis
  | 'decoracao'    // plantas, quadros, objetos decorativos
  | 'obras'        // reformas, reparos, melhorias
  | 'mimos'        // café, comidas, mimos para clientes
  | 'equipamentos' // compra ou manutenção de equipamentos
  | 'marketing'    // publicidade, redes sociais, impressos
  | 'outros';      // despesas diversas

type ExpenseRecurrence = 'once' | 'monthly' | 'yearly';
type ExpenseType = 'fixed' | 'variable';

interface Expense {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  type: ExpenseType;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
  due_day_of_month: number | null;
  due_date: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  creator?: { full_name: string } | null;
}

interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_due: number;
  reference_period: string | null;
  due_date: string | null;
  status: 'pending' | 'paid';
  paid_at: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  expense: Expense;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role?: string;
}

interface AdminExpense extends Expense {
  expense_assignments: Array<{
    user_id: string;
    user: { id: string; full_name: string } | null;
  }>;
}

interface SplitWithUser {
  id: string;
  user_id: string;
  amount_due: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
  payment_proof_url: string | null;
  reference_period: string | null;
  user: { full_name: string } | null;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ExpenseCategory, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  aluguel:      { icon: Home,           color: 'text-blue-600',   bgColor: 'bg-blue-100',   label: 'Aluguel',      description: 'Aluguel do espaço e locações' },
  energia:      { icon: Zap,            color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'Água & Luz',   description: 'Água, luz, gás — contas fixas do imóvel' },
  internet:     { icon: Wifi,           color: 'text-sky-600',    bgColor: 'bg-sky-100',    label: 'Internet',     description: 'Internet, telefone e streaming' },
  insumos:      { icon: Scissors,       color: 'text-green-600',  bgColor: 'bg-green-100',  label: 'Insumos',      description: 'Produtos consumidos nos atendimentos (tintas, ceras, químicas…)' },
  limpeza:      { icon: Droplets,       color: 'text-cyan-600',   bgColor: 'bg-cyan-100',   label: 'Limpeza',      description: 'Faxineira, dedetização, jardineiro, papel, sacos, copos descartáveis' },
  decoracao:    { icon: Sparkles,       color: 'text-pink-500',   bgColor: 'bg-pink-100',   label: 'Decoração',    description: 'Plantas, quadros, flores e objetos decorativos' },
  obras:        { icon: HardHat,        color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Obras',        description: 'Reformas, melhorias, reparos e manutenção' },
  mimos:        { icon: Gift,           color: 'text-rose-500',   bgColor: 'bg-rose-100',   label: 'Mimos',        description: 'Café, água, comidas e mimos para os clientes' },
  equipamentos: { icon: Box,            color: 'text-purple-600', bgColor: 'bg-purple-100', label: 'Equipamentos', description: 'Compra ou manutenção de equipamentos e mobiliário' },
  marketing:    { icon: TrendingUp,     color: 'text-violet-600', bgColor: 'bg-violet-100', label: 'Marketing',    description: 'Publicidade, redes sociais, impressos e eventos' },
  outros:       { icon: MoreHorizontal, color: 'text-gray-500',   bgColor: 'bg-gray-100',   label: 'Outros',       description: 'Despesas diversas não classificadas' },
};

const RECURRENCE_LABELS: Record<ExpenseRecurrence, string> = {
  once: 'Única',
  monthly: 'Mensal',
  yearly: 'Anual',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function navigatePeriod(period: string, dir: 'prev' | 'next'): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1);
  d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Expenses() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();

  const [period, setPeriod] = useState(currentPeriod);
  const [pendingSplits, setPendingSplits] = useState<ExpenseSplit[]>([]);
  const [paidSplits, setPaidSplits] = useState<ExpenseSplit[]>([]);
  const [adminExpenses, setAdminExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheets
  const [createSheet, setCreateSheet] = useState(false);
  const [paySheet, setPaySheet] = useState<ExpenseSplit | null>(null);
  const [detailSheet, setDetailSheet] = useState<AdminExpense | null>(null);
  const [editSheet, setEditSheet] = useState<AdminExpense | null>(null);

  useEffect(() => {
    loadData();
  }, [user, period]);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      await supabase.rpc('ensure_period_splits', { p_period: period });
      await Promise.all([
        loadUserSplits(),
        loadAdminExpenses(),
      ]);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? JSON.stringify(err);
      showToast('error', 'Erro ao carregar despesas', msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserSplits() {
    if (!user) return;

    // Pendentes: qualquer período (despesas únicas atrasadas aparecem aqui)
    const { data: pending, error: e1 } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(*, creator:profiles!expenses_created_by_fkey(full_name))')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    if (e1) throw e1;

    // Pagas: somente do período selecionado (histórico mensal)
    const periodStart = `${period}-01`;
    const periodEnd   = `${period}-31`;

    const { data: paid, error: e2 } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(*, creator:profiles!expenses_created_by_fkey(full_name))')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .gte('paid_at', periodStart)
      .lte('paid_at', periodEnd + 'T23:59:59');

    if (e2) throw e2;

    setPendingSplits((pending as unknown as ExpenseSplit[]) ?? []);
    setPaidSplits((paid as unknown as ExpenseSplit[]) ?? []);
  }

  async function loadAdminExpenses() {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        creator:profiles!expenses_created_by_fkey(full_name),
        expense_assignments(
          user_id,
          user:profiles!expense_assignments_user_id_fkey(id, full_name)
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setAdminExpenses((data as unknown as AdminExpense[]) ?? []);
  }

  async function handleDeactivateExpense(id: string) {
    const { error } = await supabase
      .from('expenses')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      showToast('error', 'Erro', 'Não foi possível desativar a despesa.');
      return;
    }
    showToast('success', 'Despesa desativada', 'A despesa foi removida da lista.');
    setDetailSheet(null);
    loadAdminExpenses();
  }

  const totalPending = pendingSplits.reduce((s, x) => s + x.amount_due, 0);
  const totalPaid    = paidSplits.reduce((s, x) => s + x.amount_due, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {ToastComponent}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Despesas</h1>
          <p className="text-text-muted mt-1">Gerencie custos e contas a pagar</p>
        </div>
        <button
          onClick={() => setCreateSheet(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Nova Despesa</span>
        </button>
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-accent/10 shadow-card">
        <button
          onClick={() => setPeriod(p => navigatePeriod(p, 'prev'))}
          className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-text-muted" />
        </button>
        <span className="font-semibold text-text capitalize">
          {periodLabel(period)}
        </span>
        <button
          onClick={() => setPeriod(p => navigatePeriod(p, 'next'))}
          className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
          disabled={period >= currentPeriod()}
        >
          <ChevronRight className={`w-5 h-5 ${period >= currentPeriod() ? 'text-accent/40' : 'text-text-muted'}`} />
        </button>
      </div>

      {/* Summary cards */}
      {(pendingSplits.length > 0 || paidSplits.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 border border-orange-200 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-medium text-orange-600">A Pagar</span>
            </div>
            <p className="text-xl font-bold text-text">{formatCurrency(totalPending)}</p>
            <p className="text-xs text-text-muted mt-0.5">{pendingSplits.length} despesa{pendingSplits.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-green-200 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-green-600">Pago</span>
            </div>
            <p className="text-xl font-bold text-text">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-text-muted mt-0.5">{paidSplits.length} despesa{paidSplits.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Pending splits */}
      <section>
        <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-500" />
          A Pagar
          {pendingSplits.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
              {pendingSplits.length}
            </span>
          )}
        </h2>

        {pendingSplits.length === 0 ? (
          <div className="bg-white rounded-xl p-8 border border-accent/10 shadow-card text-center">
            <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-text-muted text-sm">Nenhuma despesa pendente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingSplits.map(split => (
              <SplitCard
                key={split.id}
                split={split}
                onPay={() => setPaySheet(split)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Paid splits */}
      {paidSplits.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            Pago em {periodLabel(period)}
          </h2>
          <div className="space-y-3">
            {paidSplits.map(split => (
              <SplitCard
                key={split.id}
                split={split}
                onPay={() => setPaySheet(split)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All expenses (admin sees all, regular users see expenses they created or are assigned to) */}
      {adminExpenses.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-text-muted" />
            {isSuperAdmin ? 'Todas as Despesas' : 'Despesas que Gerencio'}
            <span className="ml-1 px-2 py-0.5 bg-champagne-nuvem text-text-muted text-xs font-medium rounded-full">
              {adminExpenses.length}
            </span>
          </h2>
          <div className="space-y-3">
            {adminExpenses.map(expense => (
              <AdminExpenseCard
                key={expense.id}
                expense={expense}
                period={period}
                onManage={() => setDetailSheet(expense)}
                showToast={showToast}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sheets */}
      {createSheet && (
        <CreateExpenseSheet
          onClose={() => setCreateSheet(false)}
          onSuccess={() => {
            setCreateSheet(false);
            loadData();
          }}
          showToast={showToast}
        />
      )}

      {paySheet && (
        <PaySplitSheet
          split={paySheet}
          onClose={() => setPaySheet(null)}
          onSuccess={() => {
            setPaySheet(null);
            loadUserSplits();
          }}
          showToast={showToast}
        />
      )}

      {detailSheet && (
        <ExpenseDetailSheet
          expense={detailSheet}
          period={period}
          onClose={() => setDetailSheet(null)}
          onDeactivate={handleDeactivateExpense}
          onEdit={() => {
            setEditSheet(detailSheet);
            setDetailSheet(null);
          }}
          showToast={showToast}
        />
      )}

      {editSheet && (
        <EditExpenseSheet
          expense={editSheet}
          onClose={() => setEditSheet(null)}
          onSuccess={() => {
            setEditSheet(null);
            loadData();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─── SplitCard ────────────────────────────────────────────────────────────────

interface SplitCardProps {
  split: ExpenseSplit;
  onPay: () => void;
}

function SplitCard({ split, onPay }: SplitCardProps) {
  const cat = CATEGORY_CONFIG[split.expense.category] ?? CATEGORY_CONFIG.outros;
  const Icon = cat.icon;
  const isPaid = split.status === 'paid';

  async function handleViewProof() {
    if (!split.payment_proof_url) return;
    const { data } = await supabase.storage
      .from('expense-proofs')
      .createSignedUrl(split.payment_proof_url, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <div className={`bg-white rounded-xl p-4 border shadow-card transition-all ${
      isPaid ? 'border-green-200' : 'border-accent/10'
    }`}>
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.bgColor}`}>
          <Icon className={`w-5 h-5 ${cat.color}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-text truncate">{split.expense.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-text-muted">{cat.label}</span>
                <span className="text-xs text-text-muted">·</span>
                <span className="text-xs text-text-muted">
                  {RECURRENCE_LABELS[split.expense.recurrence]}
                </span>
                {split.expense.type === 'fixed' && (
                  <>
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">Fixo</span>
                  </>
                )}
                {split.expense.creator?.full_name && (
                  <>
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs flex items-center gap-0.5 text-text-muted">
                      <UserCircle className="w-3 h-3" />
                      {split.expense.creator.full_name.split(' ')[0]}
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="font-bold text-text text-lg whitespace-nowrap">
              {formatCurrency(split.amount_due)}
            </p>
          </div>

          {split.due_date && !isPaid && (
            <p className="text-xs text-text-muted mt-1">
              Vence em {formatDate(split.due_date)}
            </p>
          )}

          {isPaid && split.paid_at && (
            <p className="text-xs text-green-600 mt-1">
              Pago em {new Date(split.paid_at).toLocaleDateString('pt-BR')}
            </p>
          )}

          {split.notes && (
            <p className="text-xs text-text-muted mt-1 italic truncate">{split.notes}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {!isPaid ? (
          <button
            onClick={onPay}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Check className="w-4 h-4" />
            Marcar como Pago
          </button>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">
              <Check className="w-4 h-4" />
              Pago
            </span>
            {split.payment_proof_url && (
              <button
                onClick={handleViewProof}
                className="flex items-center gap-1.5 px-3 py-2 bg-champagne-nuvem hover:bg-accent/20 text-text rounded-lg text-sm transition-colors border border-accent/15"
              >
                <Eye className="w-4 h-4" />
                Comprovante
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AdminExpenseCard ─────────────────────────────────────────────────────────

interface AdminExpenseCardProps {
  expense: AdminExpense;
  period: string;
  onManage: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function AdminExpenseCard({ expense, period, onManage }: AdminExpenseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [splits, setSplits] = useState<SplitWithUser[]>([]);
  const [loadingSplits, setLoadingSplits] = useState(false);

  const cat = CATEGORY_CONFIG[expense.category] ?? CATEGORY_CONFIG.outros;
  const Icon = cat.icon;

  async function loadSplits() {
    if (splits.length > 0) {
      setExpanded(v => !v);
      return;
    }
    setLoadingSplits(true);
    const { data } = await supabase
      .from('expense_splits')
      .select('id, user_id, amount_due, status, paid_at, payment_proof_url, reference_period, user:profiles!user_id(full_name)')
      .eq('expense_id', expense.id)
      .or(`reference_period.eq.${period},reference_period.is.null`)
      .order('status');

    setSplits((data as unknown as SplitWithUser[]) ?? []);
    setLoadingSplits(false);
    setExpanded(true);
  }

  const paidCount    = splits.filter(s => s.status === 'paid').length;
  const pendingCount = splits.filter(s => s.status === 'pending').length;

  return (
    <div className="bg-white rounded-xl border border-accent/10 shadow-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.bgColor}`}>
            <Icon className={`w-5 h-5 ${cat.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-text">{expense.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-text-muted">{cat.label}</span>
                  <span className="text-xs text-text-muted">·</span>
                  <span className="text-xs text-text-muted flex items-center gap-1">
                    <Repeat className="w-3 h-3" />
                    {RECURRENCE_LABELS[expense.recurrence]}
                    {expense.recurrence === 'monthly' && expense.due_day_of_month && (
                      <span> · dia {expense.due_day_of_month}</span>
                    )}
                  </span>
                  {expense.creator?.full_name && (
                    <>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs flex items-center gap-0.5 text-text-muted">
                        <UserCircle className="w-3 h-3" />
                        {expense.creator.full_name.split(' ')[0]}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <p className="font-bold text-text text-lg whitespace-nowrap">
                {formatCurrency(expense.amount)}
              </p>
            </div>

            {/* Assigned users pill */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Users className="w-3.5 h-3.5 text-text-muted" />
              {expense.expense_assignments.slice(0, 3).map(a => (
                <span
                  key={a.user_id}
                  className="text-xs px-2 py-0.5 bg-champagne-nuvem text-text rounded-full"
                >
                  {a.user?.full_name?.split(' ')[0] ?? '—'}
                </span>
              ))}
              {expense.expense_assignments.length > 3 && (
                <span className="text-xs text-text-muted">
                  +{expense.expense_assignments.length - 3}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={loadSplits}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-champagne-nuvem hover:bg-accent/20 rounded-lg text-sm text-text transition-colors border border-accent/10"
          >
            {loadingSplits ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {expanded ? 'Ocultar' : 'Ver pagamentos'}
              </>
            )}
          </button>
          <button
            onClick={onManage}
            className="px-3 py-2 text-text-muted hover:bg-champagne-nuvem rounded-lg text-sm transition-colors border border-accent/10"
          >
            Gerenciar
          </button>
        </div>
      </div>

      {/* Expanded splits */}
      {expanded && splits.length > 0 && (
        <div className="border-t border-accent/10 px-4 py-3 space-y-2 bg-champagne-nuvem/50">
          <p className="text-xs font-medium text-text-muted mb-2">
            {periodLabel(period)} — {paidCount} pago{paidCount !== 1 ? 's' : ''}, {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </p>
          {splits.map(s => (
            <div key={s.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-text">{s.user?.full_name ?? '—'}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">{formatCurrency(s.amount_due)}</span>
                {s.status === 'paid' ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Pago
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Pendente
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && splits.length === 0 && !loadingSplits && (
        <div className="border-t border-accent/10 px-4 py-3 bg-champagne-nuvem/50">
          <p className="text-xs text-text-muted text-center">Sem pagamentos para este período</p>
        </div>
      )}
    </div>
  );
}

// ─── ExpenseDetailSheet ───────────────────────────────────────────────────────

interface ExpenseDetailSheetProps {
  expense: AdminExpense;
  period: string;
  onClose: () => void;
  onDeactivate: (id: string) => void;
  onEdit: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function ExpenseDetailSheet({ expense, onClose, onDeactivate, onEdit }: ExpenseDetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cat = CATEGORY_CONFIG[expense.category] ?? CATEGORY_CONFIG.outros;

  return (
    <BottomSheet isOpen title={`Gerenciar Despesa`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-champagne-nuvem rounded-xl p-4 space-y-2">
          <p className="text-lg font-semibold text-text">{expense.title}</p>
          {expense.description && (
            <p className="text-sm text-text-muted">{expense.description}</p>
          )}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-xs text-text-muted">Valor total</p>
              <p className="font-bold text-text">{formatCurrency(expense.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Categoria</p>
              <p className="font-medium text-text">{cat.label}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Tipo</p>
              <p className="font-medium text-text">{expense.type === 'fixed' ? 'Fixo' : 'Variável'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Recorrência</p>
              <p className="font-medium text-text">{RECURRENCE_LABELS[expense.recurrence]}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-text mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-text-muted" />
            Responsáveis ({expense.expense_assignments.length})
          </p>
          <div className="space-y-2">
            {expense.expense_assignments.map(a => (
              <div key={a.user_id} className="flex items-center gap-3 py-2 px-3 bg-champagne-nuvem rounded-lg">
                <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {a.user?.full_name?.[0] ?? '?'}
                  </span>
                </div>
                <span className="text-sm text-text">{a.user?.full_name ?? '—'}</span>
                <span className="ml-auto text-sm font-medium text-text-muted">
                  {formatCurrency(expense.amount / expense.expense_assignments.length)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-accent/10 space-y-2">
          <button
            onClick={onEdit}
            className="w-full flex items-center justify-center gap-2 py-3 text-primary hover:bg-primary/5 rounded-lg transition-colors border border-primary/20 text-sm font-medium"
          >
            <Pencil className="w-4 h-4" />
            Editar Despesa
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Desativar Despesa
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  Desativar esta despesa? Os splits pendentes continuarão visíveis até serem pagos.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 border border-red-300 text-red-600 rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onDeactivate(expense.id)}
                  className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── PaySplitSheet ────────────────────────────────────────────────────────────

interface PaySplitSheetProps {
  split: ExpenseSplit;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function PaySplitSheet({ split, onClose, onSuccess, showToast }: PaySplitSheetProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState(split.notes ?? '');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPaid = split.status === 'paid';
  const cat = CATEGORY_CONFIG[split.expense.category] ?? CATEGORY_CONFIG.outros;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setUploadedFile(file);
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);

    try {
      let proofPath: string | null = split.payment_proof_url ?? null;

      if (uploadedFile) {
        const ext = uploadedFile.name.split('.').pop() ?? 'jpg';
        const path = `${user.id}/${split.id}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('expense-proofs')
          .upload(path, uploadedFile, { upsert: true });

        if (uploadError) throw uploadError;
        proofPath = path;
      }

      const updatePayload: Record<string, unknown> = {
        notes: notes.trim() || null,
      };

      if (!isPaid) {
        updatePayload.status = 'paid';
        updatePayload.payment_proof_url = proofPath;
      } else if (proofPath !== split.payment_proof_url) {
        updatePayload.payment_proof_url = proofPath;
      }

      const { error } = await supabase
        .from('expense_splits')
        .update(updatePayload)
        .eq('id', split.id);

      if (error) throw error;

      showToast('success', 'Pagamento registrado!', `${split.expense.title} marcada como paga.`);
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro', err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevertToPending() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: 'pending' })
        .eq('id', split.id);

      if (error) throw error;
      showToast('info', 'Status revertido', 'Despesa marcada como pendente novamente.');
      onSuccess();
    } catch {
      showToast('error', 'Erro', 'Não foi possível reverter o status.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={isPaid ? 'Detalhes do Pagamento' : 'Registrar Pagamento'}
    >
      <div className="space-y-4">
        {/* Expense info */}
        <div className={`rounded-xl p-4 ${cat.bgColor} border border-opacity-20`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center`}>
              {(() => { const I = cat.icon; return <I className={`w-5 h-5 ${cat.color}`} />; })()}
            </div>
            <div>
              <p className="font-semibold text-text">{split.expense.title}</p>
              <p className="text-xs text-text-muted">{cat.label} · {RECURRENCE_LABELS[split.expense.recurrence]}</p>
            </div>
            <p className="ml-auto text-2xl font-bold text-text">
              {formatCurrency(split.amount_due)}
            </p>
          </div>
          {split.due_date && !isPaid && (
            <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Vence em {formatDate(split.due_date)}
            </p>
          )}
        </div>

        {/* Proof upload */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Comprovante de Pagamento
            <span className="text-text-muted font-normal"> (opcional)</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileSelect}
          />

          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Comprovante"
                className="w-full max-h-48 object-cover rounded-xl border border-accent/15"
              />
              <button
                type="button"
                onClick={() => { setUploadedFile(null); setPreviewUrl(null); }}
                className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-soft"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-accent/30 hover:border-primary hover:bg-champagne-nuvem/50 rounded-xl transition-colors"
            >
              <Upload className="w-6 h-6 text-text-muted" />
              <span className="text-sm text-text-muted">
                {uploadedFile ? uploadedFile.name : 'Toque para selecionar imagem ou PDF'}
              </span>
            </button>
          )}

          {split.payment_proof_url && !uploadedFile && (
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Comprovante já anexado — selecione um novo para substituir
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Observações
            <span className="text-text-muted font-normal"> (opcional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none text-sm"
            rows={2}
            placeholder="Ex: Pago via PIX, referência #1234"
            disabled={loading}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          {!isPaid ? (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Confirmar Pagamento
                </>
              )}
            </button>
          ) : (
            <>
              {uploadedFile && (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Comprovante'}
                </button>
              )}
              <button
                onClick={handleRevertToPending}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 border border-orange-200 text-orange-600 hover:bg-orange-50 rounded-xl text-sm font-medium transition-colors"
              >
                Marcar como Pendente Novamente
              </button>
            </>
          )}

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-3 border border-accent/20 text-text-muted hover:bg-champagne-nuvem rounded-xl text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── CreateExpenseSheet ───────────────────────────────────────────────────────

interface CreateExpenseSheetProps {
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function CreateExpenseSheet({ onClose, onSuccess, showToast }: CreateExpenseSheetProps) {
  const { isSuperAdmin } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<ExpenseType>('fixed');
  const [category, setCategory] = useState<ExpenseCategory>('outros');
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>('once');
  const [dueDayOfMonth, setDueDayOfMonth] = useState('5');
  const [dueDate, setDueDate] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const filterAdmins = (list: UserProfile[]) =>
      isSuperAdmin ? list : list.filter(u => u.role !== 'super_admin');

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_active_users');
    if (!rpcError && rpcData && (rpcData as UserProfile[]).length > 0) {
      setUsers(filterAdmins(rpcData as UserProfile[]));
      setLoadingUsers(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name');

    if (profilesError) {
      showToast('error', 'Erro ao carregar usuários', profilesError.message);
      setLoadingUsers(false);
      return;
    }

    setUsers(filterAdmins((profilesData as UserProfile[]) ?? []));
    setLoadingUsers(false);
  }

  function toggleUser(id: string) {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  }

  function selectAllUsers() {
    setSelectedUserIds(users.map(u => u.id));
  }

  function amountPerUser(): string {
    const n = parseFloat(amount);
    if (!n || selectedUserIds.length === 0) return '—';
    return formatCurrency(n / selectedUserIds.length);
  }

  async function handleSubmit() {
    if (!title.trim()) return showToast('error', 'Título obrigatório', '');
    if (!amount || parseFloat(amount) <= 0) return showToast('error', 'Valor inválido', '');
    if (selectedUserIds.length === 0) return showToast('error', 'Selecione ao menos um responsável', '');
    if (recurrence !== 'monthly' && !dueDate) return showToast('error', 'Informe a data de vencimento', '');
    if (recurrence === 'monthly' && (!dueDayOfMonth || parseInt(dueDayOfMonth) < 1 || parseInt(dueDayOfMonth) > 28)) {
      return showToast('error', 'Dia inválido', 'Informe um dia entre 1 e 28.');
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('create_expense_with_assignments', {
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_amount: parseFloat(amount),
        p_type: type,
        p_category: category,
        p_recurrence: recurrence,
        p_user_ids: selectedUserIds,
        p_due_day_of_month: recurrence === 'monthly' ? parseInt(dueDayOfMonth) : null,
        p_due_date: recurrence !== 'monthly' ? dueDate : null,
      });

      if (error) throw error;

      showToast('success', 'Despesa criada!', `${title} atribuída a ${selectedUserIds.length} responsável${selectedUserIds.length > 1 ? 'is' : ''}.`);
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro ao criar despesa', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet isOpen title="Nova Despesa" onClose={onClose}>
      <div className="space-y-5">

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Título *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Aluguel do estúdio"
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
            disabled={loading}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Valor total (R$) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
        </div>

        {/* Type toggle */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Tipo</label>
          <div className="flex bg-champagne-nuvem rounded-xl p-1 border border-accent/15">
            <button
              type="button"
              onClick={() => setType('fixed')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                type === 'fixed' ? 'bg-primary text-white shadow-soft' : 'text-text-muted hover:text-text'
              }`}
            >
              Fixo
            </button>
            <button
              type="button"
              onClick={() => setType('variable')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                type === 'variable' ? 'bg-primary text-white shadow-soft' : 'text-text-muted hover:text-text'
              }`}
            >
              Variável
            </button>
          </div>
        </div>

        {/* Recurrence */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Recorrência</label>
          <div className="flex bg-champagne-nuvem rounded-xl p-1 border border-accent/15">
            {(['once', 'monthly', 'yearly'] as ExpenseRecurrence[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRecurrence(r)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  recurrence === r ? 'bg-primary text-white shadow-soft' : 'text-text-muted hover:text-text'
                }`}
              >
                {RECURRENCE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        {recurrence === 'monthly' ? (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Dia de vencimento *</label>
            <input
              type="number"
              min="1"
              max="28"
              value={dueDayOfMonth}
              onChange={e => setDueDayOfMonth(e.target.value)}
              placeholder="Ex: 5"
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1">Dia do mês em que vence (1 a 28)</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Data de vencimento *</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">Categoria</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [ExpenseCategory, typeof CATEGORY_CONFIG.outros][]).map(([key, cfg]) => {
              const I = cfg.icon;
              return (
                <button
                  key={key}
                  type="button"
                  title={cfg.description}
                  onClick={() => setCategory(key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-colors ${
                    category === key
                      ? `${cfg.bgColor} border-transparent`
                      : 'bg-champagne-nuvem border-accent/15 hover:border-accent/30'
                  }`}
                >
                  <I className={`w-5 h-5 ${category === key ? cfg.color : 'text-text-muted'}`} />
                  <span className={`text-[10px] font-medium leading-none text-center ${category === key ? cfg.color : 'text-text-muted'}`}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Descrição <span className="text-text-muted font-normal">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalhes adicionais sobre a despesa"
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none text-sm"
            rows={2}
            disabled={loading}
          />
        </div>

        {/* User assignment */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-text">
              Responsáveis *
            </label>
            <button
              type="button"
              onClick={selectAllUsers}
              className="text-xs text-primary font-medium"
            >
              Selecionar todos
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map(u => {
                const selected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-champagne-nuvem border-accent/15 hover:border-accent/30'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
                      selected ? 'bg-primary text-white' : 'bg-accent/30 text-text-muted'
                    }`}>
                      {selected ? <Check className="w-4 h-4" /> : u.full_name[0]}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${selected ? 'text-text' : 'text-text-muted'}`}>
                        {u.full_name}
                      </p>
                      <p className="text-xs text-text-muted">{u.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedUserIds.length > 0 && amount && parseFloat(amount) > 0 && (
            <div className="mt-3 flex items-center justify-between px-4 py-3 bg-primary/10 rounded-xl border border-primary/20">
              <span className="text-sm text-text font-medium">Valor por pessoa</span>
              <span className="text-sm font-bold text-primary">{amountPerUser()}</span>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3 pb-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3.5 border border-accent/20 text-text hover:bg-champagne-nuvem rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || selectedUserIds.length === 0}
            className="flex-1 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Criar Despesa'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── EditExpenseSheet ─────────────────────────────────────────────────────────

interface EditExpenseSheetProps {
  expense: AdminExpense;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function EditExpenseSheet({ expense, onClose, onSuccess, showToast }: EditExpenseSheetProps) {
  const { isSuperAdmin } = useAuth();
  const [title, setTitle] = useState(expense.title);
  const [description, setDescription] = useState(expense.description ?? '');
  const [amount, setAmount] = useState(String(expense.amount));
  const [type, setType] = useState<ExpenseType>(expense.type);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [recurrence] = useState<ExpenseRecurrence>(expense.recurrence); // recurrence is read-only after creation
  const [dueDayOfMonth, setDueDayOfMonth] = useState(String(expense.due_day_of_month ?? '5'));
  const [dueDate, setDueDate] = useState(expense.due_date ?? '');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    expense.expense_assignments.map(a => a.user_id)
  );
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const filterAdmins = (list: UserProfile[]) =>
      isSuperAdmin ? list : list.filter(u => u.role !== 'super_admin');

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_active_users');
    if (!rpcError && rpcData && (rpcData as UserProfile[]).length > 0) {
      setUsers(filterAdmins(rpcData as UserProfile[]));
      setLoadingUsers(false);
      return;
    }
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name');
    if (profilesError) {
      showToast('error', 'Erro ao carregar usuários', profilesError.message);
      setLoadingUsers(false);
      return;
    }
    setUsers(filterAdmins((profilesData as UserProfile[]) ?? []));
    setLoadingUsers(false);
  }

  function toggleUser(id: string) {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  }

  function amountPerUser(): string {
    const n = parseFloat(amount);
    if (!n || selectedUserIds.length === 0) return '—';
    return formatCurrency(n / selectedUserIds.length);
  }

  async function handleSubmit() {
    if (!title.trim()) return showToast('error', 'Título obrigatório', '');
    if (!amount || parseFloat(amount) <= 0) return showToast('error', 'Valor inválido', '');
    if (selectedUserIds.length === 0) return showToast('error', 'Selecione ao menos um responsável', '');
    if (recurrence !== 'monthly' && !dueDate) return showToast('error', 'Informe a data de vencimento', '');
    if (recurrence === 'monthly' && (!dueDayOfMonth || parseInt(dueDayOfMonth) < 1 || parseInt(dueDayOfMonth) > 28)) {
      return showToast('error', 'Dia inválido', 'Informe um dia entre 1 e 28.');
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('expenses')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          amount: parseFloat(amount),
          type,
          category,
          due_day_of_month: recurrence === 'monthly' ? parseInt(dueDayOfMonth) : null,
          due_date: recurrence !== 'monthly' ? dueDate : null,
        })
        .eq('id', expense.id);

      if (updateError) throw updateError;

      const { error: assignError } = await supabase.rpc('update_expense_assignments', {
        p_expense_id: expense.id,
        p_user_ids: selectedUserIds,
      });

      if (assignError) throw assignError;

      showToast('success', 'Despesa atualizada!', `${title} foi salva com sucesso.`);
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro ao salvar', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet isOpen title="Editar Despesa" onClose={onClose}>
      <div className="space-y-5">

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Título *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
            disabled={loading}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Valor total (R$) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
        </div>

        {/* Type toggle */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Tipo</label>
          <div className="flex bg-champagne-nuvem rounded-xl p-1 border border-accent/15">
            <button
              type="button"
              onClick={() => setType('fixed')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                type === 'fixed' ? 'bg-primary text-white shadow-soft' : 'text-text-muted hover:text-text'
              }`}
            >
              Fixo
            </button>
            <button
              type="button"
              onClick={() => setType('variable')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                type === 'variable' ? 'bg-primary text-white shadow-soft' : 'text-text-muted hover:text-text'
              }`}
            >
              Variável
            </button>
          </div>
        </div>

        {/* Recurrence info (read-only) */}
        <div className="flex items-center gap-2 px-4 py-3 bg-champagne-nuvem rounded-xl border border-accent/15">
          <Repeat className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted">Recorrência:</span>
          <span className="text-sm font-medium text-text">{RECURRENCE_LABELS[recurrence]}</span>
          <span className="ml-auto text-xs text-text-muted italic">não editável</span>
        </div>

        {/* Due date */}
        {recurrence === 'monthly' ? (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Dia de vencimento *</label>
            <input
              type="number"
              min="1"
              max="28"
              value={dueDayOfMonth}
              onChange={e => setDueDayOfMonth(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1">Dia do mês em que vence (1 a 28)</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Data de vencimento *</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">Categoria</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [ExpenseCategory, typeof CATEGORY_CONFIG.outros][]).map(([key, cfg]) => {
              const I = cfg.icon;
              return (
                <button
                  key={key}
                  type="button"
                  title={cfg.description}
                  onClick={() => setCategory(key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-colors ${
                    category === key
                      ? `${cfg.bgColor} border-transparent`
                      : 'bg-champagne-nuvem border-accent/15 hover:border-accent/30'
                  }`}
                >
                  <I className={`w-5 h-5 ${category === key ? cfg.color : 'text-text-muted'}`} />
                  <span className={`text-[10px] font-medium leading-none text-center ${category === key ? cfg.color : 'text-text-muted'}`}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Descrição <span className="text-text-muted font-normal">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none text-sm"
            rows={2}
            disabled={loading}
          />
        </div>

        {/* User assignment */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-text">Responsáveis *</label>
            <button
              type="button"
              onClick={() => setSelectedUserIds(users.map(u => u.id))}
              className="text-xs text-primary font-medium"
            >
              Selecionar todos
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map(u => {
                const selected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-champagne-nuvem border-accent/15 hover:border-accent/30'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
                      selected ? 'bg-primary text-white' : 'bg-accent/30 text-text-muted'
                    }`}>
                      {selected ? <Check className="w-4 h-4" /> : u.full_name[0]}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${selected ? 'text-text' : 'text-text-muted'}`}>
                        {u.full_name}
                      </p>
                      <p className="text-xs text-text-muted">{u.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedUserIds.length > 0 && amount && parseFloat(amount) > 0 && (
            <div className="mt-3 flex items-center justify-between px-4 py-3 bg-primary/10 rounded-xl border border-primary/20">
              <span className="text-sm text-text font-medium">Valor por pessoa</span>
              <span className="text-sm font-bold text-primary">{amountPerUser()}</span>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3 pb-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3.5 border border-accent/20 text-text hover:bg-champagne-nuvem rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || selectedUserIds.length === 0}
            className="flex-1 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
