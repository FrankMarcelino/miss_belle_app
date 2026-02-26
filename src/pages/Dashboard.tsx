import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Calendar,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Loader2,
  BarChart2,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  MessageCircle,
} from 'lucide-react';
import { formatWhatsAppUrl } from '../lib/whatsapp';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

type Period = 'day' | 'week' | 'month';

interface Stats {
  completedAppointments: number;
  totalAppointments: number;
  attendanceRate: number;
  totalRevenue: number;
  ticketMedio: number;
  newPatients: number;
}

interface UpcomingAppointment {
  id: string;
  appointment_time: string;
  patient: { full_name: string };
  procedure: { name: string };
  professional?: { full_name: string };
}

interface TopProcedure {
  name: string;
  count: number;
}

interface PaymentStat {
  method: string;
  total: number;
}

interface ExpenseStats {
  totalExpenses: number;
  paidExpenses: number;
  pendingExpenses: number;
}

interface DelinquentAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient: { full_name: string; phone: string };
  procedure: { name: string; default_price: number };
  professional?: { full_name: string };
}

interface FinancialStats {
  consolidated: number;      // pago + appointment_date <= hoje
  suspended: number;         // pago + appointment_date > hoje
  projected: number;         // sem pagamento + appointment_date > hoje
  reversals: number;         // estornados no período
  delinquency: number;       // completed + payment_status=none (valor estimado)
  delinquencyCount: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
};

const CHART_COLORS = ['#E9A8C9', '#D9C6A5', '#c47fad', '#b8a07e', '#f0c8de'];

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatDateLabel(date: Date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = PT_MONTHS[date.getMonth()].substring(0, 3);
  return `${d} ${m}`;
}

export default function Dashboard() {
  const { profile, isSuperAdmin, user } = useAuth();
  const [periodMode, setPeriodMode] = useState<Period>('month');
  const [periodOffset, setPeriodOffset] = useState(0);

  const [stats, setStats] = useState<Stats>({
    completedAppointments: 0,
    totalAppointments: 0,
    attendanceRate: 0,
    totalRevenue: 0,
    ticketMedio: 0,
    newPatients: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [topProcedures, setTopProcedures] = useState<TopProcedure[]>([]);
  const [paymentStats, setPaymentStats] = useState<PaymentStat[]>([]);
  const [expenseStats, setExpenseStats] = useState<ExpenseStats>({
    totalExpenses: 0,
    paidExpenses: 0,
    pendingExpenses: 0,
  });
  const [financialStats, setFinancialStats] = useState<FinancialStats>({
    consolidated: 0,
    suspended: 0,
    projected: 0,
    reversals: 0,
    delinquency: 0,
    delinquencyCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showDelinquency, setShowDelinquency] = useState(false);
  const [delinquentList, setDelinquentList] = useState<DelinquentAppointment[]>([]);
  const [loadingDelinquency, setLoadingDelinquency] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [periodMode, periodOffset, user, isSuperAdmin]);

  function getDateRange() {
    const now = new Date();
    switch (periodMode) {
      case 'day': {
        const d = new Date(now);
        d.setDate(d.getDate() + periodOffset);
        const str = d.toISOString().split('T')[0];
        return { start: str, end: str };
      }
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + periodOffset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return {
          start: weekStart.toISOString().split('T')[0],
          end: weekEnd.toISOString().split('T')[0],
        };
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return {
          start: d.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        };
      }
    }
  }

  function getPeriodLabel() {
    const now = new Date();
    switch (periodMode) {
      case 'day': {
        const d = new Date(now);
        d.setDate(d.getDate() + periodOffset);
        if (periodOffset === 0) return `Hoje, ${formatDateLabel(d)}`;
        if (periodOffset === -1) return `Ontem, ${formatDateLabel(d)}`;
        const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
        return `${formatDateLabel(d)}${year}`;
      }
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + periodOffset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const yearSuffix = weekStart.getFullYear() !== now.getFullYear() ||
          weekEnd.getFullYear() !== now.getFullYear()
          ? ` ${weekEnd.getFullYear()}`
          : '';
        return `${formatDateLabel(weekStart)} – ${formatDateLabel(weekEnd)}${yearSuffix}`;
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
        const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
        return `${PT_MONTHS[d.getMonth()]}${year}`;
      }
    }
  }

  async function loadDashboardData() {
    setLoading(true);
    try {
      const promises: Promise<void>[] = [
        loadStats(),
        loadUpcomingAppointments(),
        loadTopProcedures(),
        loadPaymentStats(),
        loadExpenseStats(),
        loadFinancialStats(),
      ];
      await Promise.all(promises);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const { start, end } = getDateRange();

      let query = supabase
        .from('appointments')
        .select('status')
        .gte('appointment_date', start)
        .lte('appointment_date', end);

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data: appointments, error: appointmentsError } = await query;
      if (appointmentsError) throw appointmentsError;

      const completed = appointments?.filter((a) => a.status === 'completed').length || 0;
      const total = appointments?.filter((a) => a.status !== 'cancelled').length || 0;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

      let revenueQuery = supabase
        .from('cash_register_closings')
        .select('total_amount')
        .gte('closing_date', start)
        .lte('closing_date', end);

      if (!isSuperAdmin && user) {
        revenueQuery = revenueQuery.eq('professional_id', user.id);
      }

      const { data: closings, error: closingsError } = await revenueQuery;
      if (closingsError) throw closingsError;

      const revenue = closings?.reduce((sum, c) => sum + c.total_amount, 0) || 0;
      const ticketMedio = completed > 0 ? revenue / completed : 0;

      // New patients in period
      let patientsQuery = supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start + 'T00:00:00')
        .lte('created_at', end + 'T23:59:59');

      if (!isSuperAdmin && user) {
        patientsQuery = patientsQuery.eq('professional_id', user.id);
      }

      const { count: newPatientsCount } = await patientsQuery;

      setStats({
        completedAppointments: completed,
        totalAppointments: total,
        attendanceRate: rate,
        totalRevenue: revenue,
        ticketMedio,
        newPatients: newPatientsCount || 0,
      });
    } catch {
      // ignore
    }
  }

  async function loadUpcomingAppointments() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toTimeString().split(' ')[0];

      let query = supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          patient:patients(full_name),
          procedure:procedures(name),
          professional:profiles!professional_id(full_name)
        `)
        .eq('appointment_date', today)
        .gte('appointment_time', now)
        .in('status', ['scheduled', 'confirmed'])
        .order('appointment_time')
        .limit(5);

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setUpcomingAppointments((data as unknown as UpcomingAppointment[]) || []);
    } catch {
      // ignore
    }
  }

  async function loadTopProcedures() {
    try {
      const { start, end } = getDateRange();
      let query = supabase
        .from('appointments')
        .select('procedure_id')
        .eq('status', 'completed')
        .gte('appointment_date', start)
        .lte('appointment_date', end);

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data: appointments, error: appointmentsError } = await query;
      if (appointmentsError) throw appointmentsError;

      const procedureCounts = (appointments || []).reduce((acc, apt) => {
        acc[apt.procedure_id] = (acc[apt.procedure_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topProcedureIds = Object.entries(procedureCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id]) => id);

      if (topProcedureIds.length === 0) {
        setTopProcedures([]);
        return;
      }

      const { data: procedures, error: proceduresError } = await supabase
        .from('procedures')
        .select('id, name')
        .in('id', topProcedureIds);

      if (proceduresError) throw proceduresError;

      const topProcs = (procedures || []).map((proc) => ({
        name: proc.name,
        count: procedureCounts[proc.id],
      }));

      setTopProcedures(topProcs);
    } catch {
      // ignore
    }
  }

  async function loadPaymentStats() {
    try {
      const { start, end } = getDateRange();

      // Get closing IDs in period
      let closingsQuery = supabase
        .from('cash_register_closings')
        .select('id')
        .gte('closing_date', start)
        .lte('closing_date', end);

      if (!isSuperAdmin && user) {
        closingsQuery = closingsQuery.eq('professional_id', user.id);
      }

      const { data: closings, error: closingsError } = await closingsQuery;
      if (closingsError) throw closingsError;

      if (!closings || closings.length === 0) {
        setPaymentStats([]);
        return;
      }

      const closingIds = closings.map((c) => c.id);

      const { data: transactions, error: txError } = await supabase
        .from('cash_register_transactions')
        .select('payment_method, amount')
        .in('closing_id', closingIds);

      if (txError) throw txError;

      const totals = (transactions || []).reduce((acc, tx) => {
        const method = tx.payment_method || 'outro';
        acc[method] = (acc[method] || 0) + (tx.amount || 0);
        return acc;
      }, {} as Record<string, number>);

      const stats: PaymentStat[] = Object.entries(totals)
        .map(([method, total]) => ({
          method: PAYMENT_LABELS[method] || method,
          total,
        }))
        .sort((a, b) => b.total - a.total);

      setPaymentStats(stats);
    } catch {
      // ignore
    }
  }

  async function loadExpenseStats() {
    if (!user) return;
    try {
      const { start, end } = getDateRange();

      let allSplits: { amount_due: number; status: string }[] = [];

      if (periodMode === 'month') {
        const refPeriod = start.substring(0, 7);
        let q1 = supabase
          .from('expense_splits')
          .select('amount_due, status')
          .eq('reference_period', refPeriod);
        let q2 = supabase
          .from('expense_splits')
          .select('amount_due, status')
          .is('reference_period', null)
          .gte('due_date', start)
          .lte('due_date', end);

        if (!isSuperAdmin) {
          q1 = q1.eq('user_id', user.id);
          q2 = q2.eq('user_id', user.id);
        }

        const [r1, r2] = await Promise.all([q1, q2]);
        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;
        allSplits = [...(r1.data || []), ...(r2.data || [])];
      } else {
        let q = supabase
          .from('expense_splits')
          .select('amount_due, status')
          .gte('due_date', start)
          .lte('due_date', end);

        if (!isSuperAdmin) {
          q = q.eq('user_id', user.id);
        }

        const { data, error } = await q;
        if (error) throw error;
        allSplits = data || [];
      }

      const totalExpenses = allSplits.reduce((sum, s) => sum + (s.amount_due || 0), 0);
      const paidExpenses = allSplits
        .filter((s) => s.status === 'paid')
        .reduce((sum, s) => sum + (s.amount_due || 0), 0);
      const pendingExpenses = totalExpenses - paidExpenses;

      setExpenseStats({ totalExpenses, paidExpenses, pendingExpenses });
    } catch {
      setExpenseStats({ totalExpenses: 0, paidExpenses: 0, pendingExpenses: 0 });
    }
  }

  async function loadFinancialStats() {
    if (!user) return;
    try {
      const { start, end } = getDateRange();
      const today = new Date().toISOString().split('T')[0];

      let query = supabase
        .from('appointments')
        .select('status, payment_status, appointment_date, procedure:procedures(default_price)')
        .gte('appointment_date', start)
        .lte('appointment_date', end)
        .or('payment_status.is.null,payment_status.neq.legacy');

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data: appts, error } = await query;
      if (error) throw error;

      const price = (apt: { procedure: unknown }) =>
        (apt.procedure as { default_price?: number } | null)?.default_price ?? 0;

      const consolidated = (appts || [])
        .filter((a) => ['paid', 'partial'].includes(a.payment_status ?? '') && a.appointment_date <= today)
        .reduce((s, a) => s + price(a), 0);

      const suspended = (appts || [])
        .filter((a) => a.payment_status === 'paid' && a.appointment_date > today)
        .reduce((s, a) => s + price(a), 0);

      const projected = (appts || [])
        .filter(
          (a) =>
            !['paid', 'reversed', 'credited'].includes(a.payment_status ?? '') &&
            a.appointment_date > today &&
            a.status !== 'cancelled'
        )
        .reduce((s, a) => s + price(a), 0);

      const reversals = (appts || [])
        .filter((a) => a.payment_status === 'reversed')
        .reduce((s, a) => s + price(a), 0);

      const delinquentAppts = (appts || []).filter(
        (a) => a.status === 'completed' && (!a.payment_status || a.payment_status === 'none')
      );
      const delinquency = delinquentAppts.reduce((s, a) => s + price(a), 0);

      setFinancialStats({
        consolidated,
        suspended,
        projected,
        reversals,
        delinquency,
        delinquencyCount: delinquentAppts.length,
      });
    } catch {
      // ignore
    }
  }

  async function loadDelinquentList() {
    setLoadingDelinquency(true);
    try {
      const { start, end } = getDateRange();
      let query = supabase
        .from('appointments')
        .select(`
          id, appointment_date, appointment_time,
          patient:patients(full_name, phone),
          procedure:procedures(name, default_price),
          professional:profiles!professional_id(full_name)
        `)
        .eq('status', 'completed')
        .eq('payment_status', 'none')
        .gte('appointment_date', start)
        .lte('appointment_date', end)
        .order('appointment_date', { ascending: false });

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDelinquentList((data || []) as unknown as DelinquentAppointment[]);
    } catch {
      // ignore
    } finally {
      setLoadingDelinquency(false);
    }
  }

  function handleModeChange(mode: Period) {
    setPeriodMode(mode);
    setPeriodOffset(0);
  }

  const statCards = [
    {
      label: 'Atendimentos Realizados',
      value: stats.completedAppointments.toString(),
      icon: Calendar,
      color: 'bg-primary',
    },
    {
      label: 'Agendamentos Criados',
      value: stats.totalAppointments.toString(),
      icon: Users,
      color: 'bg-accent',
    },
    {
      label: 'Taxa de Comparecimento',
      value: `${stats.attendanceRate}%`,
      icon: TrendingUp,
      color: 'bg-primary',
    },
    {
      label: 'Receita Consolidada',
      value: `R$ ${financialStats.consolidated.toFixed(2)}`,
      icon: DollarSign,
      color: 'bg-accent',
    },
    {
      label: 'Ticket Médio',
      value: `R$ ${stats.completedAppointments > 0 ? (financialStats.consolidated / stats.completedAppointments).toFixed(2) : '0.00'}`,
      icon: BarChart2,
      color: 'bg-primary',
    },
    {
      label: 'Novos Pacientes',
      value: stats.newPatients.toString(),
      icon: UserPlus,
      color: 'bg-accent',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const revenueVsExpenses = stats.totalRevenue + expenseStats.totalExpenses;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">
          Bem-vindo{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-text-muted">
          {isSuperAdmin ? 'Visão geral da clínica' : 'Acompanhe seu desempenho pessoal'}
        </p>
      </div>

      {/* Period selector + navigation */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode tabs */}
        <div className="flex gap-2 bg-white rounded-xl p-1 border border-accent/10 shadow-card">
          {(['day', 'week', 'month'] as Period[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                periodMode === mode
                  ? 'bg-primary text-white'
                  : 'text-text hover:bg-champagne-nuvem'
              }`}
            >
              {mode === 'day' ? 'Dia' : mode === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 bg-white rounded-xl px-2 py-1 border border-accent/10 shadow-card">
          <button
            onClick={() => setPeriodOffset((o) => o - 1)}
            className="p-1.5 rounded-md text-text-muted hover:bg-champagne-nuvem hover:text-text transition-colors"
            aria-label="Período anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-text px-2 min-w-[160px] text-center">
            {getPeriodLabel()}
          </span>
          <button
            onClick={() => setPeriodOffset((o) => o + 1)}
            className="p-1.5 rounded-md text-text-muted hover:bg-champagne-nuvem hover:text-text transition-colors"
            aria-label="Próximo período"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Today button */}
        <button
          onClick={() => setPeriodOffset(0)}
          disabled={periodOffset === 0}
          className="px-3 py-2 rounded-xl text-sm font-medium bg-white border border-accent/10 shadow-card text-text hover:bg-champagne-nuvem transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Hoje
        </button>
      </div>

      {/* Stat cards — 2 cols mobile, 3 tablet, 6 desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-background-card rounded-xl p-4 border border-accent/10 shadow-card hover:shadow-card-hover transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`${stat.color} w-10 h-10 rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <h3 className="text-text-muted text-xs mb-1 leading-tight">{stat.label}</h3>
              <p className="text-xl font-bold text-text">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Financial breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Receita */}
        <div className="bg-background-card rounded-xl p-5 border border-accent/10 shadow-card">
          <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            Receita do Período
          </h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Consolidada <span className="text-[10px]">(paga + realizada)</span></span>
              <span className="font-semibold text-green-600">R$ {financialStats.consolidated.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Suspensa <span className="text-[10px]">(paga, atend. futuro)</span></span>
              <span className="font-semibold text-blue-600">R$ {financialStats.suspended.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Projetada <span className="text-[10px]">(agend. futuro s/ pgto)</span></span>
              <span className="font-semibold text-text-muted">R$ {financialStats.projected.toFixed(2)}</span>
            </div>
            {financialStats.reversals > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Estornos</span>
                <span className="font-semibold text-red-500">- R$ {financialStats.reversals.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-accent/10 flex items-center justify-between text-sm">
              <span className="font-medium text-text">Total potencial</span>
              <span className="font-bold text-text">
                R$ {(financialStats.consolidated + financialStats.suspended + financialStats.projected - financialStats.reversals).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Inadimplência + Despesas */}
        <div className="space-y-4">
          {financialStats.delinquencyCount > 0 && (
            <button
              onClick={() => { setShowDelinquency(true); loadDelinquentList(); }}
              className="w-full text-left bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors"
            >
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Inadimplência
                <span className="ml-auto text-xs text-red-500">Ver lista →</span>
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-600">
                  {financialStats.delinquencyCount} atendimento{financialStats.delinquencyCount !== 1 ? 's' : ''} sem pagamento
                </span>
                <span className="font-bold text-red-700">R$ {financialStats.delinquency.toFixed(2)}</span>
              </div>
            </button>
          )}
          <div className="bg-background-card rounded-xl p-4 border border-accent/10 shadow-card">
            <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-orange-500" />
              Despesas
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Devidas</span>
                <span className="font-medium text-text">R$ {expenseStats.totalExpenses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Pagas</span>
                <span className="font-medium text-green-600">R$ {expenseStats.paidExpenses.toFixed(2)}</span>
              </div>
              <div className="pt-1.5 border-t border-accent/10 flex justify-between">
                <span className="font-medium text-text">Restante</span>
                <span className={`font-bold ${expenseStats.pendingExpenses > 0 ? 'text-orange-500' : 'text-text-muted'}`}>
                  R$ {expenseStats.pendingExpenses.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment method chart */}
        <div className="bg-background-card rounded-xl p-6 border border-accent/10 shadow-card">
          <h3 className="text-lg font-semibold text-text mb-4">Receita por Método de Pagamento</h3>
          {paymentStats.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-text-muted">Nenhuma transação no período</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paymentStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="method"
                  tick={{ fontSize: 12, fill: '#9B8E8E' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9B8E8E' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `R$${v}`}
                  width={55}
                />
                <Tooltip
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Total']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #D9C6A5',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {paymentStats.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Receita vs Despesas — visível para todos */}
        <div className="bg-background-card rounded-xl p-6 border border-accent/10 shadow-card">
          <h3 className="text-lg font-semibold text-text mb-4">Receita vs Despesas</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-muted">Total Faturado</span>
                <span className="font-semibold text-green-600">
                  R$ {stats.totalRevenue.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-400 h-2 rounded-full transition-all"
                  style={{
                    width: revenueVsExpenses > 0
                      ? `${Math.min((stats.totalRevenue / revenueVsExpenses) * 100, 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-muted">Despesas Lançadas</span>
                <span className="font-semibold text-orange-500">
                  R$ {expenseStats.totalExpenses.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-orange-400 h-2 rounded-full transition-all"
                  style={{
                    width: revenueVsExpenses > 0
                      ? `${Math.min((expenseStats.totalExpenses / revenueVsExpenses) * 100, 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            <div className="flex gap-4 text-sm text-text-muted pt-1">
              <span>Pago: <span className="text-text font-medium">R$ {expenseStats.paidExpenses.toFixed(2)}</span></span>
              <span>Pendente: <span className="text-text font-medium">R$ {expenseStats.pendingExpenses.toFixed(2)}</span></span>
            </div>

            <div className="pt-3 border-t border-accent/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Resultado do Período</span>
                <span
                  className={`text-lg font-bold ${
                    stats.totalRevenue - expenseStats.totalExpenses >= 0
                      ? 'text-green-600'
                      : 'text-red-500'
                  }`}
                >
                  R$ {(stats.totalRevenue - expenseStats.totalExpenses).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming appointments (always today) */}
        <div className="bg-background-card rounded-xl p-6 border border-accent/10 shadow-card">
          <h3 className="text-lg font-semibold text-text mb-4">
            {isSuperAdmin ? 'Próximos Atendimentos' : 'Sua Agenda do Dia'}
          </h3>
          {upcomingAppointments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-muted">Nenhum agendamento para hoje</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="bg-champagne-nuvem rounded-lg p-4 border border-accent/10"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-4 h-4 text-text-muted" />
                    <span className="font-semibold text-text">
                      {apt.appointment_time.substring(0, 5)}
                    </span>
                  </div>
                  <p className="text-text font-medium">{apt.patient.full_name}</p>
                  <p className="text-text-muted text-sm">{apt.procedure.name}</p>
                  {apt.professional && (
                    <p className="text-text-muted text-sm">{apt.professional.full_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-background-card rounded-xl p-6 border border-accent/10 shadow-card">
          <h3 className="text-lg font-semibold text-text mb-4">Procedimentos Mais Atendidos</h3>
          {topProcedures.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-muted">Sem dados disponíveis</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProcedures.map((proc, index) => (
                <div
                  key={proc.name}
                  className="flex items-center justify-between bg-champagne-nuvem rounded-lg p-3 border border-accent/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs">
                      {index + 1}
                    </div>
                    <span className="text-text font-medium text-sm">{proc.name}</span>
                  </div>
                  <span className="text-text-muted font-semibold text-sm">
                    {proc.count} {proc.count === 1 ? 'vez' : 'vezes'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delinquency modal */}
      {showDelinquency && (
        <div className="fixed inset-0 bg-grafite-rosado/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-background-card w-full sm:max-w-lg sm:rounded-2xl shadow-soft-lg border border-accent/10 flex flex-col max-h-[90vh] rounded-t-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-accent/10">
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Inadimplência — {getPeriodLabel()}
              </h2>
              <button
                onClick={() => setShowDelinquency(false)}
                className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-5">
              {loadingDelinquency ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : delinquentList.length === 0 ? (
                <p className="text-center text-text-muted py-8">Nenhum inadimplente no período.</p>
              ) : (
                <div className="space-y-3">
                  {delinquentList.map((apt) => {
                    const dateStr = new Date(apt.appointment_date + 'T12:00:00').toLocaleDateString('pt-BR');
                    const price = apt.procedure?.default_price ?? 0;
                    return (
                      <div key={apt.id} className="bg-champagne-nuvem rounded-lg p-3 border border-accent/10">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-text text-sm truncate">{apt.patient?.full_name}</p>
                              {apt.patient?.phone && (
                                <a
                                  href={formatWhatsAppUrl(
                                    apt.patient.phone,
                                    `Olá, ${apt.patient.full_name}! Passando para lembrar sobre o pagamento do procedimento ${apt.procedure?.name}.`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-shrink-0 p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Enviar lembrete via WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <p className="text-text-muted text-xs mt-0.5">{apt.procedure?.name}</p>
                            <p className="text-text-muted text-xs">
                              {dateStr} às {apt.appointment_time?.substring(0, 5)}
                            </p>
                            {isSuperAdmin && apt.professional && (
                              <p className="text-text-muted text-xs">{apt.professional.full_name}</p>
                            )}
                          </div>
                          <span className="text-sm font-bold text-red-600 flex-shrink-0">
                            {price > 0 ? `R$ ${price.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {!loadingDelinquency && delinquentList.length > 0 && (
              <div className="p-5 border-t border-accent/10">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-text">
                    {delinquentList.length} atendimento{delinquentList.length !== 1 ? 's' : ''} sem pagamento
                  </span>
                  <span className="text-red-600">R$ {financialStats.delinquency.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
