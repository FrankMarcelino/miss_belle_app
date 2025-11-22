import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, Users, TrendingUp, DollarSign, Clock, Loader2 } from 'lucide-react';

type Period = 'day' | 'week' | 'month';

interface Stats {
  completedAppointments: number;
  totalAppointments: number;
  attendanceRate: number;
  totalRevenue: number;
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

export default function Dashboard() {
  const { profile, isSuperAdmin, user } = useAuth();
  const [period, setPeriod] = useState<Period>('day');
  const [stats, setStats] = useState<Stats>({
    completedAppointments: 0,
    totalAppointments: 0,
    attendanceRate: 0,
    totalRevenue: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [topProcedures, setTopProcedures] = useState<TopProcedure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [period, user, isSuperAdmin]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadUpcomingAppointments(),
        loadTopProcedures(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (period) {
      case 'day':
        return { start: today, end: today };
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return {
          start: weekStart.toISOString().split('T')[0],
          end: weekEnd.toISOString().split('T')[0],
        };
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
          start: monthStart.toISOString().split('T')[0],
          end: monthEnd.toISOString().split('T')[0],
        };
      }
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

      setStats({
        completedAppointments: completed,
        totalAppointments: total,
        attendanceRate: rate,
        totalRevenue: revenue,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
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
          professional:profiles(full_name)
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

      setUpcomingAppointments(data || []);
    } catch (error) {
      console.error('Error loading upcoming appointments:', error);
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
    } catch (error) {
      console.error('Error loading top procedures:', error);
    }
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
      label: 'Total Financeiro',
      value: `R$ ${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">
          Bem-vindo{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-text-muted">
          {isSuperAdmin
            ? 'Visão geral da clínica'
            : 'Acompanhe seu desempenho pessoal'}
        </p>
      </div>

      <div className="flex gap-2 bg-background-card rounded-lg p-1 w-fit border border-accent/20">
        <button
          onClick={() => setPeriod('day')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            period === 'day'
              ? 'bg-primary text-white'
              : 'text-text hover:bg-champagne-nuvem'
          }`}
        >
          Dia
        </button>
        <button
          onClick={() => setPeriod('week')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            period === 'week'
              ? 'bg-primary text-white'
              : 'text-text hover:bg-champagne-nuvem'
          }`}
        >
          Semana
        </button>
        <button
          onClick={() => setPeriod('month')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            period === 'month'
              ? 'bg-primary text-white'
              : 'text-text hover:bg-champagne-nuvem'
          }`}
        >
          Mês
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-background-card rounded-xl p-6 border border-accent/20 shadow-card hover:shadow-soft transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-text-muted text-sm mb-1">{stat.label}</h3>
              <p className="text-2xl font-bold text-text">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-background-card rounded-xl p-6 border border-accent/20 shadow-card">
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
                  className="bg-champagne-nuvem rounded-lg p-4 border border-accent/20"
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
                    <p className="text-text-muted text-sm">
                      {apt.professional.full_name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-background-card rounded-xl p-6 border border-accent/20 shadow-card">
          <h3 className="text-lg font-semibold text-text mb-4">
            Procedimentos Mais Atendidos
          </h3>
          {topProcedures.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-muted">Sem dados disponíveis</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProcedures.map((proc, index) => (
                <div
                  key={proc.name}
                  className="flex items-center justify-between bg-champagne-nuvem rounded-lg p-4 border border-accent/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <span className="text-text font-medium">{proc.name}</span>
                  </div>
                  <span className="text-text-muted font-semibold">
                    {proc.count} {proc.count === 1 ? 'vez' : 'vezes'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
