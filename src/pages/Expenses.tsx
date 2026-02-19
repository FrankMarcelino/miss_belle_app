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
  Droplets, ChevronDown, ChevronUp, Pencil,
  Sparkles, Scissors, HardHat, Box, Wifi, Gift,
  Calendar, Percent,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory =
  | 'aluguel'
  | 'energia'
  | 'internet'
  | 'insumos'
  | 'limpeza'
  | 'decoracao'
  | 'obras'
  | 'mimos'
  | 'equipamentos'
  | 'marketing'
  | 'outros';

type ExpenseRecurrence = 'once' | 'monthly' | 'yearly' | 'installments';
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
  installments_count: number;
  contract_end_date: string | null;
  adjustment_index: string | null;
  adjustment_value: number | null;
  effective_from: string;
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
  installment_number: number | null;
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
  installment_number: number | null;
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
  installments: 'Parcelado',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isPeriodFuture(period: string): boolean {
  return period > currentPeriod();
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

function getDueDateUrgency(d: string | null): 'overdue' | 'today' | 'soon' | 'ok' | null {
  if (!d) return null;
  const diff = Math.floor((new Date(d + 'T23:59:59').getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  return 'ok';
}

function daysToContractEnd(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Expenses() {
  const { user } = useAuth();
  const { showToast, ToastComponent } = useToast();

  // Data states
  const [period, setPeriod] = useState(currentPeriod);
  const [monthlySplits, setMonthlySplits] = useState<ExpenseSplit[]>([]);
  const [overdueOtherMonths, setOverdueOtherMonths] = useState<ExpenseSplit[]>([]);
  const [adminExpenses, setAdminExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // UI states
  const [view, setView] = useState<'splits' | 'manage'>('splits');
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<ExpenseCategory | 'all'>('all');

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

    const periodStart = `${period}-01`;
    const [pYear, pMonth] = period.split('-').map(Number);
    const lastDay = new Date(pYear, pMonth, 0).getDate();
    const periodEnd = `${period}-${String(lastDay).padStart(2, '0')}`;

    // Splits com reference_period = mês selecionado (recorrentes, parcelados, anuais)
    const q1 = supabase
      .from('expense_splits')
      .select('*, expense:expenses(*, creator:profiles!expenses_created_by_fkey(full_name))')
      .eq('user_id', user.id)
      .eq('reference_period', period);

    // Splits únicos (reference_period IS NULL) com vencimento no mês selecionado
    const q2 = supabase
      .from('expense_splits')
      .select('*, expense:expenses(*, creator:profiles!expenses_created_by_fkey(full_name))')
      .eq('user_id', user.id)
      .is('reference_period', null)
      .gte('due_date', periodStart)
      .lte('due_date', periodEnd);

    const [r1, r2] = await Promise.all([q1, q2]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;

    const monthly = [
      ...((r1.data as unknown as ExpenseSplit[]) ?? []),
      ...((r2.data as unknown as ExpenseSplit[]) ?? []),
    ].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

    // Splits em atraso de outros meses (pendentes com vencimento antes de hoje)
    const today = new Date().toISOString().split('T')[0];
    const { data: overdueRaw, error: e3 } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(*, creator:profiles!expenses_created_by_fkey(full_name))')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (e3) throw e3;

    // Excluir os que já estão no mês selecionado
    const monthlyIds = new Set(monthly.map(s => s.id));
    const overdueFiltered = ((overdueRaw as unknown as ExpenseSplit[]) ?? [])
      .filter(s => !monthlyIds.has(s.id));

    setMonthlySplits(monthly);
    setOverdueOtherMonths(overdueFiltered);
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

  // Derived data
  const isFuturePeriod = isPeriodFuture(period);

  const monthlyPending = monthlySplits.filter(s => s.status === 'pending');
  const monthlyPaid    = monthlySplits.filter(s => s.status === 'paid');
  const totalMonth        = monthlySplits.reduce((s, x) => s + x.amount_due, 0);
  const totalMonthPaid    = monthlyPaid.reduce((s, x) => s + x.amount_due, 0);
  const totalMonthPending = monthlyPending.reduce((s, x) => s + x.amount_due, 0);

  const urgencyOrder: Record<string, number> = { overdue: 0, today: 1, soon: 2, ok: 3 };
  const sortedMonthlyPending = [...monthlyPending].sort((a, b) => {
    const ua = getDueDateUrgency(a.due_date) ?? 'ok';
    const ub = getDueDateUrgency(b.due_date) ?? 'ok';
    return urgencyOrder[ua] - urgencyOrder[ub];
  });

  const splitCategories = [...new Set(monthlySplits.map(s => s.expense.category))];
  const filteredMonthlyPending = categoryFilter === 'all'
    ? sortedMonthlyPending
    : sortedMonthlyPending.filter(s => s.expense.category === categoryFilter);
  const filteredMonthlyPaid = categoryFilter === 'all'
    ? monthlyPaid
    : monthlyPaid.filter(s => s.expense.category === categoryFilter);

  const adminCategories = [...new Set(adminExpenses.map(e => e.category))];
  const filteredAdminExpenses = adminCategoryFilter === 'all'
    ? adminExpenses
    : adminExpenses.filter(e => e.category === adminCategoryFilter);

  function handleViewChange(v: 'splits' | 'manage') {
    setView(v);
    setCategoryFilter('all');
    setAdminCategoryFilter('all');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {ToastComponent}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Despesas</h1>
          <p className="text-text-muted mt-1 text-sm">Gerencie custos e contas a pagar</p>
        </div>
        <button
          onClick={() => setCreateSheet(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Nova Despesa</span>
        </button>
      </div>

      {/* View switcher */}
      {adminExpenses.length > 0 && (
        <div className="flex bg-champagne-nuvem rounded-xl p-1 border border-accent/15">
          <button
            onClick={() => handleViewChange('splits')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              view === 'splits' ? 'bg-white shadow-soft text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            Minha Conta
          </button>
          <button
            onClick={() => handleViewChange('manage')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              view === 'manage' ? 'bg-white shadow-soft text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            Gerenciar
            <span className={`px-1.5 py-0.5 text-xs rounded-full font-bold ${
              view === 'manage' ? 'bg-primary/15 text-primary' : 'bg-accent/20 text-text-muted'
            }`}>
              {adminExpenses.length}
            </span>
          </button>
        </div>
      )}

      {view === 'splits' ? (
        <>
          {/* Period navigator — always visible */}
          <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-accent/10 shadow-card">
            <button
              onClick={() => { setPeriod(p => navigatePeriod(p, 'prev')); setCategoryFilter('all'); }}
              className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-text-muted" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text capitalize text-sm">
                {periodLabel(period)}
              </span>
              {isFuturePeriod && (
                <span className="text-xs font-semibold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-200">
                  PREVISTO
                </span>
              )}
            </div>
            <button
              onClick={() => { setPeriod(p => navigatePeriod(p, 'next')); setCategoryFilter('all'); }}
              className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-text-muted" />
            </button>
          </div>

          {/* 3 Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl p-3 border border-accent/10 shadow-card">
              <p className="text-xs font-medium text-text-muted mb-1">Total</p>
              <p className="text-base font-bold text-text leading-tight">{formatCurrency(totalMonth)}</p>
              <p className="text-xs text-text-muted/70 mt-0.5">
                {monthlySplits.length} item{monthlySplits.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-green-100 shadow-card">
              <div className="flex items-center gap-1 mb-1">
                <Check className="w-3 h-3 text-green-500" />
                <p className="text-xs font-medium text-green-600">Pago</p>
              </div>
              <p className="text-base font-bold text-text leading-tight">{formatCurrency(totalMonthPaid)}</p>
              <p className="text-xs text-text-muted/70 mt-0.5">
                {monthlyPaid.length} item{monthlyPaid.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-orange-100 shadow-card">
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3 text-orange-500" />
                <p className="text-xs font-medium text-orange-600">A Pagar</p>
              </div>
              <p className="text-base font-bold text-text leading-tight">{formatCurrency(totalMonthPending)}</p>
              <p className="text-xs text-text-muted/70 mt-0.5">
                {monthlyPending.length} item{monthlyPending.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Em Atraso — splits vencidos de outros meses */}
          {overdueOtherMonths.length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200 overflow-hidden">
              <button
                onClick={() => setOverdueExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">Em Atraso</span>
                  <span className="px-1.5 py-0.5 text-xs bg-red-200 text-red-800 rounded-full font-bold">
                    {overdueOtherMonths.length}
                  </span>
                </div>
                {overdueExpanded
                  ? <ChevronUp className="w-4 h-4 text-red-500" />
                  : <ChevronDown className="w-4 h-4 text-red-500" />
                }
              </button>
              {overdueExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {overdueOtherMonths.map(split => (
                    <SplitCard
                      key={split.id}
                      split={split}
                      onPay={() => setPaySheet(split)}
                      onRefresh={loadUserSplits}
                      showToast={showToast}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category chips */}
          {splitCategories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setCategoryFilter('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-muted border-accent/20 hover:border-accent/40'
                }`}
              >
                Todas
              </button>
              {splitCategories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
                const Icon = cfg.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      categoryFilter === cat
                        ? `${cfg.bgColor} ${cfg.color} border-transparent`
                        : 'bg-white text-text-muted border-accent/20 hover:border-accent/40'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Unified list */}
          {monthlySplits.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-accent/10 shadow-card text-center">
              {isFuturePeriod ? (
                <>
                  <Calendar className="w-10 h-10 text-blue-300 mx-auto mb-2" />
                  <p className="text-text-muted text-sm capitalize">
                    Sem despesas previstas em {periodLabel(period)}
                  </p>
                  <p className="text-xs text-text-muted/60 mt-1">
                    Despesas mensais ativas aparecerão aqui
                  </p>
                </>
              ) : (
                <>
                  <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-text-muted text-sm capitalize">
                    Sem despesas em {periodLabel(period)}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Pendentes (ordenados por urgência) */}
              {filteredMonthlyPending.map(split => (
                <SplitCard
                  key={split.id}
                  split={split}
                  onPay={() => setPaySheet(split)}
                  onRefresh={loadUserSplits}
                  showToast={showToast}
                />
              ))}

              {/* Divisor entre pendentes e pagos */}
              {filteredMonthlyPaid.length > 0 && filteredMonthlyPending.length > 0 && (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-accent/10" />
                  <span className="text-xs text-text-muted/50 font-medium">Pagos</span>
                  <div className="flex-1 h-px bg-accent/10" />
                </div>
              )}

              {/* Pagos */}
              {filteredMonthlyPaid.map(split => (
                <SplitCard
                  key={split.id}
                  split={split}
                  onPay={() => setPaySheet(split)}
                  onRefresh={loadUserSplits}
                  showToast={showToast}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Manage view */}

          {/* Period navigator — always visible, no future restriction */}
          <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-accent/10 shadow-card">
            <button
              onClick={() => setPeriod(p => navigatePeriod(p, 'prev'))}
              className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-text-muted" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text capitalize text-sm">
                {periodLabel(period)}
              </span>
              {isPeriodFuture(period) && (
                <span className="text-xs font-semibold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-200">
                  PREVISTO
                </span>
              )}
            </div>
            <button
              onClick={() => setPeriod(p => navigatePeriod(p, 'next'))}
              className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-text-muted" />
            </button>
          </div>

          {/* Admin category chips */}
          {adminCategories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setAdminCategoryFilter('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  adminCategoryFilter === 'all'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-muted border-accent/20 hover:border-accent/40'
                }`}
              >
                Todas
              </button>
              {adminCategories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
                const Icon = cfg.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setAdminCategoryFilter(cat)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      adminCategoryFilter === cat
                        ? `${cfg.bgColor} ${cfg.color} border-transparent`
                        : 'bg-white text-text-muted border-accent/20 hover:border-accent/40'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Admin expense cards */}
          {filteredAdminExpenses.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-accent/10 shadow-card text-center">
              <Tag className="w-10 h-10 text-text-muted/40 mx-auto mb-2" />
              <p className="text-text-muted text-sm">Nenhuma despesa cadastrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAdminExpenses.map(expense => (
                <AdminExpenseCard
                  key={expense.id}
                  expense={expense}
                  period={period}
                  onManage={() => setDetailSheet(expense)}
                  onRefresh={loadData}
                  showToast={showToast}
                />
              ))}
            </div>
          )}
        </>
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
  onRefresh: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function SplitCard({ split, onPay, onRefresh, showToast }: SplitCardProps) {
  const [showUpdateAmount, setShowUpdateAmount] = useState(false);

  const cat = CATEGORY_CONFIG[split.expense.category] ?? CATEGORY_CONFIG.outros;
  const Icon = cat.icon;
  const isPaid = split.status === 'paid';
  const isForecast = !isPaid && split.reference_period !== null && isPeriodFuture(split.reference_period);
  const urgency = isPaid || isForecast ? null : getDueDateUrgency(split.due_date);

  const isInstallment = split.installment_number !== null && split.expense.installments_count > 1;
  const canUpdateAmount = split.expense.type === 'variable' && !isPaid && split.reference_period !== null;

  const borderClass = urgency === 'overdue'
    ? 'border-red-200'
    : urgency === 'today'
    ? 'border-orange-300'
    : urgency === 'soon'
    ? 'border-amber-200'
    : isPaid
    ? 'border-green-100'
    : isForecast
    ? 'border-blue-100'
    : 'border-accent/10';

  async function handleViewProof() {
    if (!split.payment_proof_url) return;
    const { data } = await supabase.storage
      .from('expense-proofs')
      .createSignedUrl(split.payment_proof_url, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <>
      <div className={`bg-white rounded-xl border shadow-card overflow-hidden transition-all ${borderClass}`}>
        {/* Urgency / forecast banner */}
        {urgency === 'overdue' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Vencido em {formatDate(split.due_date)}
            </span>
          </div>
        )}
        {urgency === 'today' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">Vence hoje</span>
          </div>
        )}
        {urgency === 'soon' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
            <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-700">
              Vence em {formatDate(split.due_date)}
            </span>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.bgColor}`}>
              <Icon className={`w-5 h-5 ${cat.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-text truncate">{split.expense.title}</p>
                  {isInstallment && (
                    <span className="inline-block text-xs font-medium text-violet-600 px-1.5 py-0.5 bg-violet-50 rounded mt-0.5">
                      Parcela {split.installment_number}/{split.expense.installments_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <p className="font-bold text-text text-lg whitespace-nowrap">
                    {formatCurrency(split.amount_due)}
                  </p>
                  {canUpdateAmount && (
                    <button
                      onClick={() => setShowUpdateAmount(true)}
                      className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Atualizar valor"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs text-text-muted">{cat.label}</span>
                <span className="text-xs text-text-muted">·</span>
                <span className="text-xs text-text-muted">{RECURRENCE_LABELS[split.expense.recurrence]}</span>
                {split.expense.type === 'fixed' && (
                  <>
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">Fixo</span>
                  </>
                )}
              </div>

              {/* Status badge */}
              <div className="mt-2">
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 px-2.5 py-1 bg-green-50 rounded-full border border-green-200">
                    <Check className="w-3 h-3" />
                    PAGO
                    {split.paid_at && (
                      <span className="font-normal text-green-600 ml-0.5">
                        · {new Date(split.paid_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </span>
                ) : isForecast ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 px-2.5 py-1 bg-blue-50 rounded-full border border-blue-200">
                    <Calendar className="w-3 h-3" />
                    PREVISTO
                    {split.due_date && (
                      <span className="font-normal text-blue-600 ml-0.5">
                        · {formatDate(split.due_date)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 px-2.5 py-1 bg-orange-50 rounded-full border border-orange-200">
                    <Clock className="w-3 h-3" />
                    PENDENTE
                  </span>
                )}
              </div>

              {split.notes && (
                <p className="text-xs text-text-muted mt-1.5 italic truncate">{split.notes}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            {!isPaid && !isForecast ? (
              <button
                onClick={onPay}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                Marcar como Pago
              </button>
            ) : isPaid ? (
              <div className="flex-1 flex items-center gap-2">
                {split.payment_proof_url && (
                  <button
                    onClick={handleViewProof}
                    className="flex items-center gap-1.5 px-3 py-2 bg-champagne-nuvem hover:bg-accent/20 text-text rounded-lg text-sm transition-colors border border-accent/15"
                  >
                    <Eye className="w-4 h-4" />
                    Comprovante
                  </button>
                )}
                <button
                  onClick={onPay}
                  className="flex items-center gap-1.5 px-3 py-2 bg-champagne-nuvem hover:bg-accent/20 text-text-muted rounded-lg text-sm transition-colors border border-accent/15"
                >
                  Detalhes
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showUpdateAmount && split.reference_period && (
        <UpdateAmountSheet
          expenseId={split.expense_id}
          period={split.reference_period}
          currentAmount={split.expense.amount}
          title={split.expense.title}
          onClose={() => setShowUpdateAmount(false)}
          onSuccess={() => {
            setShowUpdateAmount(false);
            onRefresh();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}

// ─── AdminExpenseCard ─────────────────────────────────────────────────────────

interface AdminExpenseCardProps {
  expense: AdminExpense;
  period: string;
  onManage: () => void;
  onRefresh: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function AdminExpenseCard({ expense, period, onManage, onRefresh, showToast }: AdminExpenseCardProps) {
  const { isSuperAdmin } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [splits, setSplits] = useState<SplitWithUser[]>([]);
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [showUpdateAmount, setShowUpdateAmount] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);

  const cat = CATEGORY_CONFIG[expense.category] ?? CATEGORY_CONFIG.outros;
  const Icon = cat.icon;

  // Clear cached splits when period changes
  useEffect(() => {
    setSplits([]);
    setExpanded(false);
  }, [period]);

  async function loadSplits() {
    if (splits.length > 0) {
      setExpanded(v => !v);
      return;
    }
    setLoadingSplits(true);
    const { data } = await supabase
      .from('expense_splits')
      .select('id, user_id, amount_due, status, paid_at, payment_proof_url, reference_period, installment_number, user:profiles!user_id(full_name)')
      .eq('expense_id', expense.id)
      .or(`reference_period.eq.${period},reference_period.is.null`)
      .order('status');

    setSplits((data as unknown as SplitWithUser[]) ?? []);
    setLoadingSplits(false);
    setExpanded(true);
  }

  const paidCount    = splits.filter(s => s.status === 'paid').length;
  const pendingCount = splits.filter(s => s.status === 'pending').length;

  const contractDays = daysToContractEnd(expense.contract_end_date);
  const showContractWarning = contractDays !== null && contractDays <= 60;

  function ContractBadge() {
    if (contractDays === null) return null;
    if (contractDays < 0) return (
      <span className="text-xs font-semibold text-red-600 px-2 py-0.5 bg-red-50 rounded-full border border-red-200">
        Contrato vencido há {Math.abs(contractDays)} dia{Math.abs(contractDays) !== 1 ? 's' : ''}
      </span>
    );
    if (contractDays <= 30) return (
      <span className="text-xs font-semibold text-red-600 px-2 py-0.5 bg-red-50 rounded-full border border-red-200">
        Contrato vence em {contractDays} dia{contractDays !== 1 ? 's' : ''}
      </span>
    );
    if (contractDays <= 60) return (
      <span className="text-xs font-semibold text-amber-700 px-2 py-0.5 bg-amber-50 rounded-full border border-amber-200">
        Contrato vence em {contractDays} dias
      </span>
    );
    return null;
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-accent/10 shadow-card overflow-hidden">
        {showContractWarning && (
          <div className={`flex items-center gap-2 px-4 py-2 ${contractDays !== null && contractDays <= 30 ? 'bg-red-50 border-b border-red-100' : 'bg-amber-50 border-b border-amber-100'}`}>
            <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${contractDays !== null && contractDays <= 30 ? 'text-red-500' : 'text-amber-600'}`} />
            <ContractBadge />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.bgColor}`}>
              <Icon className={`w-5 h-5 ${cat.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-text truncate">{expense.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-text-muted">{cat.label}</span>
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Repeat className="w-3 h-3" />
                      {RECURRENCE_LABELS[expense.recurrence]}
                      {expense.recurrence === 'monthly' && expense.due_day_of_month && (
                        ` · dia ${expense.due_day_of_month}`
                      )}
                      {expense.recurrence === 'installments' && expense.installments_count > 1 && (
                        ` · ${expense.installments_count}x`
                      )}
                    </span>
                    {expense.type === 'fixed' && (
                      <>
                        <span className="text-xs text-text-muted">·</span>
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">Fixo</span>
                      </>
                    )}
                    {expense.type === 'variable' && (
                      <>
                        <span className="text-xs text-text-muted">·</span>
                        <span className="text-xs px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded font-medium">Variável</span>
                      </>
                    )}
                  </div>
                  {expense.recurrence === 'monthly' && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3 text-text-muted" />
                      <span className="text-xs text-text-muted capitalize">
                        Desde {periodLabel(expense.effective_from.substring(0, 7))}
                      </span>
                    </div>
                  )}
                  {expense.contract_end_date && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3 text-text-muted" />
                      <span className="text-xs text-text-muted">
                        Contrato até {formatDate(expense.contract_end_date)}
                      </span>
                    </div>
                  )}
                </div>
                <p className="font-bold text-text text-lg whitespace-nowrap flex-shrink-0">
                  {formatCurrency(expense.amount)}
                </p>
              </div>

              {/* Assignee avatars */}
              {expense.expense_assignments.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex -space-x-1.5">
                    {expense.expense_assignments.slice(0, 4).map(a => (
                      <div
                        key={a.user_id}
                        title={a.user?.full_name ?? ''}
                        className="w-6 h-6 rounded-full bg-primary/20 border-2 border-white flex items-center justify-center"
                      >
                        <span className="text-[10px] font-bold text-primary">
                          {a.user?.full_name?.[0] ?? '?'}
                        </span>
                      </div>
                    ))}
                    {expense.expense_assignments.length > 4 && (
                      <div className="w-6 h-6 rounded-full bg-accent/20 border-2 border-white flex items-center justify-center">
                        <span className="text-[10px] font-medium text-text-muted">
                          +{expense.expense_assignments.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-text-muted">
                    {(() => {
                      const firstNames = expense.expense_assignments.map(
                        a => a.user?.full_name?.split(' ')[0] ?? '?'
                      );
                      const shown = firstNames.slice(0, 3).join(', ');
                      const extra = firstNames.length > 3 ? ` +${firstNames.length - 3}` : '';
                      return shown + extra;
                    })()}
                    {' · '}{formatCurrency(expense.amount / expense.expense_assignments.length)} cada
                  </span>
                </div>
              )}
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

            {isSuperAdmin && expense.category === 'aluguel' && expense.contract_end_date && (
              <button
                onClick={() => setShowAdjustment(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-violet-700 hover:bg-violet-50 rounded-lg text-sm transition-colors border border-violet-200"
              >
                <Percent className="w-3.5 h-3.5" />
                Reajuste
              </button>
            )}

            {expense.type === 'variable' && (
              <button
                onClick={() => setShowUpdateAmount(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-primary hover:bg-primary/10 rounded-lg text-sm transition-colors border border-primary/20"
              >
                <Pencil className="w-3.5 h-3.5" />
                Valor
              </button>
            )}

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
          <div className="border-t border-accent/10 px-4 py-3 space-y-1.5 bg-champagne-nuvem/50">
            <p className="text-xs font-medium text-text-muted mb-2">
              {periodLabel(period)} — {paidCount} pago{paidCount !== 1 ? 's' : ''}, {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
            </p>
            {splits.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-1">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'paid' ? 'bg-green-400' : 'bg-orange-400'}`} />
                <span className="text-sm text-text flex-1">{s.user?.full_name ?? '—'}</span>
                {expense.recurrence === 'installments' && s.installment_number !== null && (
                  <span className="text-xs text-violet-600 font-medium">
                    {s.installment_number}/{expense.installments_count}
                  </span>
                )}
                <span className="text-sm font-medium text-text">{formatCurrency(s.amount_due)}</span>
                <span className={`text-xs font-medium ${s.status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}>
                  {s.status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
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

      {showUpdateAmount && (
        <UpdateAmountSheet
          expenseId={expense.id}
          period={period}
          currentAmount={expense.amount}
          title={expense.title}
          onClose={() => setShowUpdateAmount(false)}
          onSuccess={() => {
            setShowUpdateAmount(false);
            setSplits([]);
            setExpanded(false);
            onRefresh();
          }}
          showToast={showToast}
        />
      )}

      {showAdjustment && (
        <AdjustmentSheet
          expense={expense}
          onClose={() => setShowAdjustment(false)}
          onSuccess={() => {
            setShowAdjustment(false);
            onRefresh();
          }}
          showToast={showToast}
        />
      )}
    </>
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
              <p className="font-medium text-text">
                {RECURRENCE_LABELS[expense.recurrence]}
                {expense.recurrence === 'installments' && expense.installments_count > 1 && ` (${expense.installments_count}x)`}
              </p>
            </div>
            {expense.recurrence === 'monthly' && (
              <div className="col-span-2">
                <p className="text-xs text-text-muted">Vigência a partir de</p>
                <p className="font-medium text-text capitalize">
                  {periodLabel(expense.effective_from.substring(0, 7))}
                </p>
              </div>
            )}
            {expense.contract_end_date && (
              <div className="col-span-2">
                <p className="text-xs text-text-muted">Término do contrato</p>
                <p className="font-medium text-text">{formatDate(expense.contract_end_date)}</p>
              </div>
            )}
            {expense.adjustment_index && (
              <div className="col-span-2">
                <p className="text-xs text-text-muted">Último reajuste</p>
                <p className="font-medium text-text">
                  {expense.adjustment_index.toUpperCase()}
                  {expense.adjustment_value && ` · ${expense.adjustment_value}%`}
                </p>
              </div>
            )}
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
              {split.installment_number !== null && split.expense.installments_count > 1 && (
                <p className="text-xs text-violet-600 font-medium">
                  Parcela {split.installment_number}/{split.expense.installments_count}
                </p>
              )}
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
  const [installmentsCount, setInstallmentsCount] = useState(2);
  const [contractEndDate, setContractEndDate] = useState('');
  const [adjustmentIndex, setAdjustmentIndex] = useState('');
  const [adjustmentValue, setAdjustmentValue] = useState('');
  // Início de vigência: mês a partir do qual splits são gerados.
  // Se o dia de vencimento deste mês já passou → próximo mês; caso contrário → mês atual.
  function smartEffectiveFrom(dayStr: string): string {
    const day = Math.min(parseInt(dayStr) || 1, 28);
    const today = new Date();
    const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), day);
    const base = today > dueThisMonth
      ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
      : new Date(today.getFullYear(), today.getMonth(), 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  }
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() => smartEffectiveFrom('5'));
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
    if (recurrence === 'installments') {
      return formatCurrency(n / installmentsCount / selectedUserIds.length);
    }
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
    if (recurrence === 'installments' && installmentsCount < 2) {
      return showToast('error', 'Parcelas inválidas', 'Informe pelo menos 2 parcelas.');
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
        p_installments_count: recurrence === 'installments' ? installmentsCount : 1,
        p_contract_end_date: contractEndDate || null,
        p_adjustment_index: adjustmentIndex || null,
        p_adjustment_value: adjustmentValue ? parseFloat(adjustmentValue) : null,
        // Para mensais: converte "YYYY-MM" → "YYYY-MM-01"
        // Para outros: null (a função usa o due_date como effective_from)
        p_effective_from: recurrence === 'monthly' ? `${effectiveFrom}-01` : null,
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

  const ADJUSTMENT_INDICES = [
    { value: 'igpm', label: 'IGPM' },
    { value: 'ipca', label: 'IPCA' },
    { value: 'inpc', label: 'INPC' },
    { value: 'fixed', label: 'Fixo' },
  ] as const;

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

        {/* Recurrence — 2x2 grid */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Recorrência</label>
          <div className="grid grid-cols-2 gap-2">
            {(['once', 'monthly', 'yearly', 'installments'] as ExpenseRecurrence[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRecurrence(r)}
                className={`py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                  recurrence === r
                    ? 'bg-primary text-white border-primary shadow-soft'
                    : 'bg-champagne-nuvem border-accent/15 text-text-muted hover:border-accent/30'
                }`}
              >
                {RECURRENCE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Due date / installment fields */}
        {recurrence === 'monthly' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Dia de vencimento *</label>
              <input
                type="number"
                min="1"
                max="28"
                value={dueDayOfMonth}
                onChange={e => {
                  setDueDayOfMonth(e.target.value);
                  setEffectiveFrom(smartEffectiveFrom(e.target.value));
                }}
                placeholder="Ex: 5"
                className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
                disabled={loading}
              />
              <p className="text-xs text-text-muted mt-1">Dia do mês em que vence (1 a 28)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Início da vigência *</label>
              <input
                type="month"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
                disabled={loading}
              />
              <p className="text-xs text-text-muted mt-1">
                Splits gerados somente a partir deste mês — sem cobranças retroativas
              </p>
            </div>
          </>
        ) : recurrence === 'installments' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Data do 1º vencimento *</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Número de parcelas *</label>
              <input
                type="number"
                min="2"
                max="60"
                value={installmentsCount}
                onChange={e => setInstallmentsCount(Math.max(2, parseInt(e.target.value) || 2))}
                className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
                disabled={loading}
              />
              <p className="text-xs text-text-muted mt-1">Mínimo 2, máximo 60 parcelas</p>
            </div>
            {dueDate && amount && parseFloat(amount) > 0 && installmentsCount >= 2 && (
              <div className="px-4 py-3 bg-violet-50 rounded-xl border border-violet-200">
                <p className="text-sm font-medium text-violet-700">Prévia do parcelamento</p>
                <p className="text-sm text-violet-600 mt-0.5">
                  {installmentsCount}x de {formatCurrency(parseFloat(amount) / installmentsCount)}
                  {selectedUserIds.length > 1 && (
                    <span className="text-xs ml-1">
                      ({formatCurrency(parseFloat(amount) / installmentsCount / selectedUserIds.length)} por responsável)
                    </span>
                  )}
                </p>
              </div>
            )}
          </>
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

        {/* Contract section — shown when category is aluguel */}
        {category === 'aluguel' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Contrato (opcional)
            </p>

            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Data de término</label>
              <input
                type="date"
                value={contractEndDate}
                onChange={e => setContractEndDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-text text-sm"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Índice de reajuste</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentIndex('')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    adjustmentIndex === ''
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white border-blue-200 text-blue-700 hover:border-blue-400'
                  }`}
                >
                  —
                </button>
                {ADJUSTMENT_INDICES.map(idx => (
                  <button
                    key={idx.value}
                    type="button"
                    onClick={() => setAdjustmentIndex(idx.value)}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      adjustmentIndex === idx.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-blue-200 text-blue-700 hover:border-blue-400'
                    }`}
                  >
                    {idx.label}
                  </button>
                ))}
              </div>
            </div>

            {adjustmentIndex && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">% estimado de reajuste</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={adjustmentValue}
                    onChange={e => setAdjustmentValue(e.target.value)}
                    placeholder="Ex: 5,5"
                    className="w-full px-3 py-2.5 pr-8 bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-text text-sm"
                    disabled={loading}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 text-sm font-medium">%</span>
                </div>
              </div>
            )}
          </div>
        )}

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
              <span className="text-sm text-text font-medium">
                {recurrence === 'installments' ? 'Por parcela / responsável' : 'Valor por pessoa'}
              </span>
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
  const [recurrence] = useState<ExpenseRecurrence>(expense.recurrence);
  const [dueDayOfMonth, setDueDayOfMonth] = useState(String(expense.due_day_of_month ?? '5'));
  const [dueDate, setDueDate] = useState(expense.due_date ?? '');
  const [contractEndDate, setContractEndDate] = useState(expense.contract_end_date ?? '');
  // effective_from no formato "YYYY-MM" para o input type="month"
  const [effectiveFrom, setEffectiveFrom] = useState(expense.effective_from.substring(0, 7));
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
    if (recurrence !== 'monthly' && recurrence !== 'installments' && !dueDate) {
      return showToast('error', 'Informe a data de vencimento', '');
    }
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
          due_date: recurrence !== 'monthly' && recurrence !== 'installments' ? dueDate : undefined,
          contract_end_date: contractEndDate || null,
          effective_from: recurrence === 'monthly' ? `${effectiveFrom}-01` : undefined,
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
          <span className="text-sm font-medium text-text">
            {RECURRENCE_LABELS[recurrence]}
            {recurrence === 'installments' && expense.installments_count > 1 && ` (${expense.installments_count}x)`}
          </span>
          <span className="ml-auto text-xs text-text-muted italic">não editável</span>
        </div>

        {/* Due date — hidden for installments (already set) */}
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
        ) : recurrence !== 'installments' ? (
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
        ) : null}

        {/* Effective from — editável apenas para mensais */}
        {recurrence === 'monthly' && (
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Início da vigência</label>
            <input
              type="month"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1">
              Splits gerados somente a partir deste mês
            </p>
          </div>
        )}

        {/* Contract end date — editable */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Data de término do contrato <span className="text-text-muted font-normal">(opcional)</span>
          </label>
          <input
            type="date"
            value={contractEndDate}
            onChange={e => setContractEndDate(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
            disabled={loading}
          />
        </div>

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

// ─── UpdateAmountSheet ────────────────────────────────────────────────────────

interface UpdateAmountSheetProps {
  expenseId: string;
  period: string;
  currentAmount: number;
  title: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function UpdateAmountSheet({ expenseId, period, currentAmount, title, onClose, onSuccess, showToast }: UpdateAmountSheetProps) {
  const [newAmount, setNewAmount] = useState(String(currentAmount));
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const val = parseFloat(newAmount);
    if (!val || val <= 0) return showToast('error', 'Valor inválido', '');

    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_period_expense_amount', {
        p_expense_id: expenseId,
        p_period: period,
        p_new_amount: val,
      });
      if (error) throw error;
      showToast('success', 'Valor atualizado!', `${title} atualizada para ${formatCurrency(val)}.`);
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro', err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet isOpen title="Atualizar Valor" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-champagne-nuvem rounded-xl p-4">
          <p className="font-semibold text-text">{title}</p>
          <p className="text-sm text-text-muted mt-0.5 capitalize">Período: {periodLabel(period)}</p>
          <p className="text-sm text-text-muted mt-0.5">Valor atual: {formatCurrency(currentAmount)}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Novo valor total (R$) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
          <p className="text-xs text-text-muted mt-1">O valor será dividido igualmente entre os responsáveis.</p>
        </div>

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
            disabled={loading}
            className="flex-1 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── AdjustmentSheet ──────────────────────────────────────────────────────────

interface AdjustmentSheetProps {
  expense: AdminExpense;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function AdjustmentSheet({ expense, onClose, onSuccess, showToast }: AdjustmentSheetProps) {
  const [adjustmentIndex, setAdjustmentIndex] = useState<'igpm' | 'ipca' | 'inpc' | 'fixed'>('igpm');
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [newAmount, setNewAmount] = useState(String(expense.amount));
  const [loading, setLoading] = useState(false);

  function handlePercentChange(val: string) {
    setAdjustmentPercent(val);
    const pct = parseFloat(val);
    if (!isNaN(pct)) {
      const calculated = expense.amount * (1 + pct / 100);
      setNewAmount(calculated.toFixed(2));
    }
  }

  async function handleSubmit() {
    const val = parseFloat(newAmount);
    if (!val || val <= 0) return showToast('error', 'Valor inválido', '');

    setLoading(true);
    try {
      const { error } = await supabase.rpc('apply_expense_adjustment', {
        p_expense_id: expense.id,
        p_new_amount: val,
        p_adjustment_index: adjustmentIndex,
        p_adjustment_value: parseFloat(adjustmentPercent) || 0,
      });
      if (error) throw error;
      showToast('success', 'Reajuste aplicado!', `${expense.title} reajustada para ${formatCurrency(val)}.`);
      onSuccess();
    } catch (err) {
      showToast('error', 'Erro', err instanceof Error ? err.message : 'Não foi possível aplicar o reajuste.');
    } finally {
      setLoading(false);
    }
  }

  const INDICES = [
    { value: 'igpm' as const, label: 'IGPM' },
    { value: 'ipca' as const, label: 'IPCA' },
    { value: 'inpc' as const, label: 'INPC' },
    { value: 'fixed' as const, label: 'Fixo' },
  ];

  const userCount = expense.expense_assignments.length;

  return (
    <BottomSheet isOpen title="Aplicar Reajuste" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-champagne-nuvem rounded-xl p-4">
          <p className="font-semibold text-text">{expense.title}</p>
          <p className="text-sm text-text-muted mt-0.5">Valor atual: {formatCurrency(expense.amount)}</p>
          {userCount > 0 && (
            <p className="text-sm text-text-muted mt-0.5">
              {userCount} responsável{userCount !== 1 ? 'is' : ''} · {formatCurrency(expense.amount / userCount)} cada
            </p>
          )}
        </div>

        {/* Índice */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Índice de reajuste</label>
          <div className="grid grid-cols-4 gap-2">
            {INDICES.map(idx => (
              <button
                key={idx.value}
                type="button"
                onClick={() => setAdjustmentIndex(idx.value)}
                className={`py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                  adjustmentIndex === idx.value
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-champagne-nuvem border-accent/15 text-text-muted hover:border-accent/30'
                }`}
              >
                {idx.label}
              </button>
            ))}
          </div>
        </div>

        {/* Percentual */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Percentual aplicado (%)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={adjustmentPercent}
              onChange={e => handlePercentChange(e.target.value)}
              placeholder="Ex: 5,5"
              className="w-full px-4 py-3 pr-10 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">%</span>
          </div>
        </div>

        {/* Novo valor */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Novo valor total (R$) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text"
              disabled={loading}
            />
          </div>
          <p className="text-xs text-text-muted mt-1">Calculado automaticamente. Edite manualmente se necessário.</p>
        </div>

        {parseFloat(newAmount) > 0 && userCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-violet-50 rounded-xl border border-violet-200">
            <span className="text-sm text-text font-medium">Novo valor por responsável</span>
            <span className="text-sm font-bold text-violet-700">
              {formatCurrency(parseFloat(newAmount) / userCount)}
            </span>
          </div>
        )}

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
            disabled={loading}
            className="flex-1 py-3.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Aplicar Reajuste'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
