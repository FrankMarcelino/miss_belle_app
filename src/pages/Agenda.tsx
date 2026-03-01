import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BottomSheet from '../components/mobile/BottomSheet';
import { useToast } from '../components/Toast';
import { useAppointments, getStartOfWeek, getEndOfWeek } from '../hooks/useAppointments';
import { supabase } from '../lib/supabase';
import DayView from '../components/agenda/views/DayView';
import WeekView from '../components/agenda/views/WeekView';
import MonthView from '../components/agenda/views/MonthView';
import CreateAppointmentForm from '../components/agenda/forms/CreateAppointmentForm';
import { Professional, ViewMode } from '../types/agenda';
import { Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function Agenda() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { appointments, loading, loadAppointments } = useAppointments({
    currentDate,
    viewMode,
    professionalId: selectedProfessional,
    isSuperAdmin,
    userId: user?.id,
  });

  useEffect(() => {
    if (isSuperAdmin) loadProfessionals();
    loadAppointments();
  }, [currentDate, viewMode, selectedProfessional, user, isSuperAdmin]);

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
      // silently fail
    }
  }

  function navigateDate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    else newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  }

  function getDateLabel() {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } else if (viewMode === 'week') {
      return `${getStartOfWeek(currentDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${getEndOfWeek(currentDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  const searchFilteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return appointments;
    const q = searchQuery.toLowerCase();
    return appointments.filter((apt) => {
      const patientName = apt.patient?.full_name?.toLowerCase() || '';
      const procedureName = apt.procedure?.name?.toLowerCase() || '';
      return patientName.includes(q) || procedureName.includes(q);
    });
  }, [appointments, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const apt of searchFilteredAppointments) {
      counts[apt.status] = (counts[apt.status] || 0) + 1;
    }
    return counts;
  }, [searchFilteredAppointments]);

  const filteredAppointments = statusFilter === 'all'
    ? searchFilteredAppointments
    : searchFilteredAppointments.filter((apt) => apt.status === statusFilter);

  const groupedAppointments = viewMode === 'day'
    ? { [currentDate.toISOString().split('T')[0]]: filteredAppointments }
    : filteredAppointments.reduce((acc, apt) => {
        if (!acc[apt.appointment_date]) acc[apt.appointment_date] = [];
        acc[apt.appointment_date].push(apt);
        return acc;
      }, {} as Record<string, typeof filteredAppointments>);

  const weekDays = viewMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => {
        const d = getStartOfWeek(currentDate);
        d.setDate(d.getDate() + i);
        return d;
      })
    : [currentDate];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {isSuperAdmin && !selectedProfessional ? 'Agenda Geral' : 'Agenda'}
          </h1>
          <p className="text-text-muted mt-1">
            {isSuperAdmin && !selectedProfessional
              ? 'Visualize todos os agendamentos da clínica'
              : 'Gerencie seus agendamentos'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Novo Agendamento
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por paciente ou procedimento..."
            className="w-full pl-12 pr-4 py-3 bg-background-card border border-accent/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base shadow-soft"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scroll-hidden">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'scheduled', label: 'Marcados' },
            { value: 'confirmed', label: 'Confirmados' },
            { value: 'completed', label: 'Realizados' },
            { value: 'cancelled', label: 'Cancelados' },
          ].map((filter) => {
            const count = filter.value === 'all' ? searchFilteredAppointments.length : statusCounts[filter.value] || 0;
            return (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  statusFilter === filter.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-background-card text-text border-accent/10 hover:bg-champagne-nuvem'
                }`}
              >
                {filter.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-accent/10 shadow-card">
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg rounded-t-xl border-b border-accent/10">
          <div className="px-4 sm:px-6 py-3 space-y-2">
            <div className="flex items-center justify-center gap-1">
              <button onClick={() => navigateDate('prev')} className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors flex-shrink-0">
                <ChevronLeft className="w-5 h-5 text-text" />
              </button>
              <h2 className="text-base sm:text-lg font-bold text-text capitalize text-center leading-tight">{getDateLabel()}</h2>
              <button onClick={() => navigateDate('next')} className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors flex-shrink-0">
                <ChevronRight className="w-5 h-5 text-text" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 rounded-lg transition-colors">
                Hoje
              </button>
              <div className="flex bg-champagne-nuvem rounded-lg p-0.5 border border-accent/10">
                {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                      viewMode === mode ? 'bg-primary text-white' : 'text-text hover:bg-background-card'
                    }`}
                  >
                    {mode === 'day' ? 'Dia' : mode === 'week' ? 'Semana' : 'Mês'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-text-muted">
                {filteredAppointments.length} agendamento{filteredAppointments.length !== 1 ? 's' : ''}
                {viewMode === 'day' ? ' neste dia' : viewMode === 'week' ? ' nesta semana' : ' neste mês'}
              </p>
              {isSuperAdmin && (
                <select
                  value={selectedProfessional}
                  onChange={(e) => setSelectedProfessional(e.target.value)}
                  className="w-48 sm:w-64 px-3 py-1.5 text-sm bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                >
                  <option value="">Todos os profissionais</option>
                  {professionals.map((prof) => (
                    <option key={prof.id} value={prof.id}>{prof.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            {viewMode === 'day' ? (
              <DayView
                appointments={filteredAppointments}
                currentDate={currentDate}
                onRefresh={loadAppointments}
                showToast={showToast}
                onCreateNew={() => setShowCreateModal(true)}
              />
            ) : viewMode === 'week' ? (
              <WeekView
                weekDays={weekDays}
                groupedAppointments={groupedAppointments}
                onRefresh={loadAppointments}
                showToast={showToast}
              />
            ) : (
              <MonthView
                currentDate={currentDate}
                appointments={filteredAppointments}
                onDayClick={(day) => { setCurrentDate(day); setViewMode('day'); }}
              />
            )}
          </div>
        )}
      </div>

      <BottomSheet isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Novo Agendamento">
        <CreateAppointmentForm
          defaultDate={currentDate.toISOString().split('T')[0]}
          defaultProfessionalId={selectedProfessional || user?.id || ''}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); loadAppointments(); }}
          showToast={showToast}
        />
      </BottomSheet>

      {ToastComponent}
    </div>
  );
}
