import { useEffect, useState, useMemo, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BottomSheet from '../components/mobile/BottomSheet';
import PatientAutocomplete from '../components/mobile/PatientAutocomplete';
import PaymentModal from '../components/PaymentModal';
import { useToast } from '../components/Toast';
import { parseSupabaseError, validateAppointmentData } from '../lib/errorHandling';
import { formatWhatsAppUrl } from '../lib/whatsapp';
import { Plus, Loader2, ChevronLeft, ChevronRight, ChevronDown, AlertCircle, Clock, Search, CalendarClock, MessageCircle } from 'lucide-react';

interface Appointment {
  id: string;
  patient_id: string;
  procedure_id: string;
  professional_id: string;
  appointment_date: string;
  appointment_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  cancellation_reason: string | null;
  downpayment_amount?: number;
  downpayment_method?: 'dinheiro' | 'credito' | 'debito' | 'pix' | null;
  downpayment_notes?: string | null;
  has_payment?: boolean;
  patient?: { full_name: string; phone?: string };
  procedure?: { name: string; duration_minutes: number; default_price?: number };
  professional?: { full_name: string };
}

interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
}

interface Professional {
  id: string;
  full_name: string;
}

type ViewMode = 'day' | 'week' | 'month';

export default function Agenda() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (isSuperAdmin) {
      loadProfessionals();
    }
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
    } catch (error) {
    }
  }

  async function loadAppointments() {
    try {
      setLoading(true);
      let query = supabase
        .from('appointments')
        .select(`
          *,
          patient:patients(full_name, phone),
          procedure:procedures(name, duration_minutes, default_price),
          professional:profiles!professional_id(full_name)
        `)
        .order('appointment_time');

      const dateStr = currentDate.toISOString().split('T')[0];

      if (viewMode === 'day') {
        query = query.eq('appointment_date', dateStr);
      } else if (viewMode === 'week') {
        const startOfWeek = getStartOfWeek(currentDate);
        const endOfWeek = getEndOfWeek(currentDate);
        query = query
          .gte('appointment_date', startOfWeek.toISOString().split('T')[0])
          .lte('appointment_date', endOfWeek.toISOString().split('T')[0]);
      } else {
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        query = query
          .gte('appointment_date', firstDay.toISOString().split('T')[0])
          .lte('appointment_date', lastDay.toISOString().split('T')[0]);
      }

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      } else if (selectedProfessional) {
        query = query.eq('professional_id', selectedProfessional);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }

  function getStartOfWeek(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  function getEndOfWeek(date: Date) {
    const start = getStartOfWeek(date);
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  }

  function navigateDate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-accent/10 text-accent border-accent/10';
      case 'confirmed':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Marcado';
      case 'confirmed':
        return 'Confirmado';
      case 'completed':
        return 'Realizado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  // Search-filtered appointments (without status filter, for accurate counters)
  const searchFilteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return appointments;
    const query = searchQuery.toLowerCase();
    return appointments.filter((apt) => {
      const patientName = apt.patient?.full_name?.toLowerCase() || '';
      const procedureName = apt.procedure?.name?.toLowerCase() || '';
      return patientName.includes(query) || procedureName.includes(query);
    });
  }, [appointments, searchQuery]);

  // Status counters based on search-filtered results
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const apt of searchFilteredAppointments) {
      counts[apt.status] = (counts[apt.status] || 0) + 1;
    }
    return counts;
  }, [searchFilteredAppointments]);

  // Final filtered appointments (search + status)
  const filteredAppointments = statusFilter === 'all'
    ? searchFilteredAppointments
    : searchFilteredAppointments.filter((apt) => apt.status === statusFilter);

  const groupedAppointments = viewMode === 'day'
    ? { [currentDate.toISOString().split('T')[0]]: filteredAppointments }
    : filteredAppointments.reduce((acc, apt) => {
        if (!acc[apt.appointment_date]) {
          acc[apt.appointment_date] = [];
        }
        acc[apt.appointment_date].push(apt);
        return acc;
      }, {} as Record<string, Appointment[]>);

  const weekDays = viewMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => {
        const d = getStartOfWeek(currentDate);
        d.setDate(d.getDate() + i);
        return d;
      })
    : [currentDate];

  function getDateLabel() {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } else if (viewMode === 'week') {
      return `${getStartOfWeek(currentDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      })} - ${getEndOfWeek(currentDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`;
    } else {
      return currentDate.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    }
  }

  function handleMonthDayClick(day: Date) {
    setCurrentDate(day);
    setViewMode('day');
  }

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
        {/* Search Bar */}
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

        {/* Status Filter Chips with Counters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scroll-hidden">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'scheduled', label: 'Marcados' },
            { value: 'confirmed', label: 'Confirmados' },
            { value: 'completed', label: 'Realizados' },
            { value: 'cancelled', label: 'Cancelados' },
          ].map((filter) => {
            const count = filter.value === 'all'
              ? searchFilteredAppointments.length
              : statusCounts[filter.value] || 0;
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
            {/* Row 1: Date label with navigation arrows */}
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors flex-shrink-0"
              >
                <ChevronLeft className="w-5 h-5 text-text" />
              </button>
              <h2 className="text-base sm:text-lg font-bold text-text capitalize text-center leading-tight">
                {getDateLabel()}
              </h2>
              <button
                onClick={() => navigateDate('next')}
                className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors flex-shrink-0"
              >
                <ChevronRight className="w-5 h-5 text-text" />
              </button>
            </div>

            {/* Row 2: Hoje button + view toggle */}
            <div className="flex items-center justify-between">
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 rounded-lg transition-colors"
              >
                Hoje
              </button>
              <div className="flex bg-champagne-nuvem rounded-lg p-0.5 border border-accent/10">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'day'
                      ? 'bg-primary text-white'
                      : 'text-text hover:bg-background-card'
                  }`}
                >
                  Dia
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'week'
                      ? 'bg-primary text-white'
                      : 'text-text hover:bg-background-card'
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'month'
                      ? 'bg-primary text-white'
                      : 'text-text hover:bg-background-card'
                  }`}
                >
                  Mês
                </button>
              </div>
            </div>

            {/* Row 3: Summary + professional filter */}
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
                    <option key={prof.id} value={prof.id}>
                      {prof.full_name}
                    </option>
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
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onRefresh={loadAppointments}
                showToast={showToast}
                onCreateNew={() => setShowCreateModal(true)}
              />
            ) : viewMode === 'week' ? (
              <WeekView
                weekDays={weekDays}
                groupedAppointments={groupedAppointments}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onRefresh={loadAppointments}
                showToast={showToast}
              />
            ) : (
              <MonthView
                currentDate={currentDate}
                appointments={filteredAppointments}
                onDayClick={handleMonthDayClick}
              />
            )}
          </div>
        )}
      </div>

      <BottomSheet
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Novo Agendamento"
      >
        <CreateAppointmentForm
          defaultDate={currentDate.toISOString().split('T')[0]}
          defaultProfessionalId={selectedProfessional || user?.id || ''}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadAppointments();
          }}
          showToast={showToast}
        />
      </BottomSheet>

      {ToastComponent}
    </div>
  );
}

// ==================== MonthView ====================

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  onDayClick: (day: Date) => void;
}

function MonthView({ currentDate, appointments, onDayClick }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
  const totalDays = lastDayOfMonth.getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  // Group appointments by date
  const countsByDate: Record<string, number> = {};
  for (const apt of appointments) {
    countsByDate[apt.appointment_date] = (countsByDate[apt.appointment_date] || 0) + 1;
  }

  // Build grid cells
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push(new Date(year, month, d));
  }
  // Fill remaining cells to complete the last row
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weekDayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDayHeaders.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-text-muted py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }
          const dateStr = date.toISOString().split('T')[0];
          const count = countsByDate[dateStr] || 0;
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(date)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors hover:bg-champagne-nuvem border ${
                isToday
                  ? 'border-primary bg-primary/5 font-bold'
                  : 'border-transparent'
              }`}
            >
              <span className={isToday ? 'text-primary' : 'text-text'}>{date.getDate()}</span>
              {count > 0 && (
                <span
                  className={`text-[10px] font-semibold px-1.5 rounded-full ${
                    count >= 5
                      ? 'bg-red-100 text-red-700'
                      : count >= 3
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== DayView ====================

interface DayViewProps {
  appointments: Appointment[];
  currentDate: Date;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
  onCreateNew: () => void;
}

function DayView({ appointments, currentDate, getStatusColor, getStatusLabel, onRefresh, showToast, onCreateNew }: DayViewProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayStr = now.toISOString().split('T')[0];
  const viewingToday = currentDate.toISOString().split('T')[0] === todayStr;

  const nextAppointmentId = useMemo(() => {
    if (!viewingToday) return null;
    const upcoming = appointments.filter(
      (apt) =>
        apt.appointment_time >= nowTimeStr &&
        (apt.status === 'scheduled' || apt.status === 'confirmed')
    );
    return upcoming.length > 0 ? upcoming[0].id : null;
  }, [appointments, viewingToday, nowTimeStr]);

  // Position for current time indicator line
  const timeIndicatorIndex = useMemo(() => {
    if (!viewingToday) return -1;
    const idx = appointments.findIndex(apt => apt.appointment_time.substring(0, 5) > nowTimeStr);
    return idx === -1 ? appointments.length : idx;
  }, [appointments, viewingToday, nowTimeStr]);

  if (appointments.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <CalendarClock className="w-12 h-12 text-text-muted/40 mx-auto" />
        <div>
          <p className="text-text-muted font-medium">Nenhum agendamento para este dia</p>
          <p className="text-text-muted/60 text-sm mt-1">Que tal criar um novo agendamento?</p>
        </div>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>
    );
  }

  const nowIndicator = (
    <div className="flex items-center gap-2 py-1">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
      <div className="flex-1 h-px bg-red-500" />
      <span className="text-xs font-medium text-red-500 flex-shrink-0">{nowTimeStr}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      {appointments.map((apt, index) => (
        <Fragment key={apt.id}>
          {index === timeIndicatorIndex && nowIndicator}
          <AppointmentCard
            appointment={apt}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            onRefresh={onRefresh}
            showToast={showToast}
            isNext={apt.id === nextAppointmentId}
          />
        </Fragment>
      ))}
      {timeIndicatorIndex === appointments.length && nowIndicator}
    </div>
  );
}

// ==================== WeekView ====================

interface WeekViewProps {
  weekDays: Date[];
  groupedAppointments: Record<string, Appointment[]>;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function WeekView({ weekDays, groupedAppointments, getStatusColor, getStatusLabel, onRefresh, showToast }: WeekViewProps) {
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const dateStr = day.toISOString().split('T')[0];
          const dayAppointments = groupedAppointments[dateStr] || [];
          const isToday = dateStr === new Date().toISOString().split('T')[0];

          return (
            <div
              key={dateStr}
              className={`bg-champagne-nuvem rounded-lg p-4 border ${
                isToday ? 'border-primary' : 'border-accent/10'
              }`}
            >
              <div className="mb-3">
                <div
                  className={`text-sm font-medium ${
                    isToday ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isToday ? 'text-primary' : 'text-text'
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>

              {dayAppointments.length === 0 ? (
                <p className="text-xs text-text-muted">Sem agendamentos</p>
              ) : (
                <div className="space-y-2">
                  {dayAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      onClick={() => setSelectedAppointment(apt)}
                      className="bg-background rounded-lg p-2 border border-accent/10 text-xs cursor-pointer hover:shadow-card-hover transition-all active:scale-[0.98]"
                    >
                      <div className="font-medium text-text truncate">
                        {apt.appointment_time.substring(0, 5)}
                        {apt.procedure?.duration_minutes && (
                          <span className="text-text-muted font-normal"> · {apt.procedure.duration_minutes}min</span>
                        )}
                      </div>
                      <div className="text-text-muted truncate">
                        {apt.patient?.full_name}
                      </div>
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs mt-1 border ${getStatusColor(apt.status)}`}>
                        {getStatusLabel(apt.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedAppointment && (
        <BottomSheet
          isOpen={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          title="Detalhes do Agendamento"
        >
          <AppointmentDetailsContent
            appointment={selectedAppointment}
            onClose={() => setSelectedAppointment(null)}
            onRefresh={() => {
              setSelectedAppointment(null);
              onRefresh();
            }}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            showToast={showToast}
          />
        </BottomSheet>
      )}
    </>
  );
}

// ==================== AppointmentCard ====================

interface AppointmentCardProps {
  appointment: Appointment;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
  isNext?: boolean;
}

function AppointmentCard({ appointment, getStatusColor, getStatusLabel, onRefresh, showToast, isNext }: AppointmentCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        className={`bg-white rounded-xl p-5 border shadow-card hover:shadow-card-hover transition-all cursor-pointer active:scale-[0.98] min-h-[80px] md:min-h-[72px] ${
          isNext ? 'border-primary border-2 ring-2 ring-primary/20' : 'border-accent/10'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 text-text font-bold text-lg">
                <Clock className="w-5 h-5 flex-shrink-0" />
                <span className="text-base">{appointment.appointment_time.substring(0, 5)}</span>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${getStatusColor(appointment.status)}`}>
                {getStatusLabel(appointment.status)}
              </span>
              {isNext && (
                <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-primary text-white whitespace-nowrap">
                  PRÓXIMO
                </span>
              )}
            </div>
            <h4 className="text-text font-semibold text-base mb-1.5 truncate">{appointment.patient?.full_name}</h4>
            <p className="text-text-muted text-sm mb-1 truncate">
              {appointment.procedure?.name}
              {appointment.procedure?.duration_minutes && (
                <span className="text-text-muted/60"> · {appointment.procedure.duration_minutes} min</span>
              )}
            </p>
            {appointment.professional && (
              <p className="text-text-muted text-sm truncate">
                Profissional: {appointment.professional.full_name}
              </p>
            )}
          </div>
        </div>
      </div>

      <BottomSheet
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="Detalhes do Agendamento"
      >
        <AppointmentDetailsContent
          appointment={appointment}
          onClose={() => setShowDetails(false)}
          onRefresh={onRefresh}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          showToast={showToast}
        />
      </BottomSheet>
    </>
  );
}

// ==================== AppointmentDetailsContent ====================

interface AppointmentDetailsContentProps {
  appointment: Appointment;
  onClose: () => void;
  onRefresh: () => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function AppointmentDetailsContent({
  appointment,
  onClose,
  onRefresh,
  getStatusColor,
  getStatusLabel,
  showToast,
}: AppointmentDetailsContentProps) {
  const [updating, setUpdating] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  async function updateStatus(newStatus: 'scheduled' | 'confirmed' | 'completed' | 'cancelled') {
    if (newStatus === 'cancelled' && !showCancelReason) {
      setShowCancelReason(true);
      return;
    }

    // Se for concluir, abrir modal de pagamento ao invés de atualizar diretamente
    if (newStatus === 'completed') {
      setShowPaymentModal(true);
      return;
    }

    setUpdating(true);
    try {
      const updateData: { status: string; cancellation_reason?: string } = { status: newStatus };
      if (newStatus === 'cancelled' && cancellationReason) {
        updateData.cancellation_reason = cancellationReason;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointment.id);

      if (error) throw error;

      onRefresh();
      onClose();
    } catch (error) {
    } finally {
      setUpdating(false);
    }
  }

  function handlePaymentSuccess() {
    onRefresh();
    onClose();
  }

  if (showEditForm) {
    return (
      <EditAppointmentForm
        appointment={appointment}
        onClose={() => setShowEditForm(false)}
        onSuccess={() => {
          setShowEditForm(false);
          onRefresh();
          onClose();
        }}
        showToast={showToast}
      />
    );
  }

  return (
    <div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted">Status</label>
            <div className="mt-1">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(appointment.status)}`}>
                {getStatusLabel(appointment.status)}
              </span>
            </div>
          </div>

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

          {appointment.downpayment_amount && appointment.downpayment_amount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <label className="text-sm text-green-800 font-medium">Calção Pago</label>
              <p className="text-green-700 font-bold text-lg mt-1">
                R$ {appointment.downpayment_amount.toFixed(2)}
              </p>
              {appointment.downpayment_method && (
                <p className="text-xs text-green-600 mt-1">
                  Forma: {appointment.downpayment_method === 'dinheiro' ? 'Dinheiro' :
                           appointment.downpayment_method === 'credito' ? 'Cartão de Crédito' :
                           appointment.downpayment_method === 'debito' ? 'Cartão de Débito' : 'PIX'}
                </p>
              )}
              {appointment.downpayment_notes && (
                <p className="text-xs text-green-600 mt-1">
                  Obs: {appointment.downpayment_notes}
                </p>
              )}
            </div>
          )}

          {appointment.status === 'cancelled' && appointment.cancellation_reason && (
            <div>
              <label className="text-sm text-text-muted">Motivo do Cancelamento</label>
              <p className="text-text font-medium">{appointment.cancellation_reason}</p>
            </div>
          )}

          {showCancelReason && (
            <div className="pt-4 border-t border-accent/10">
              <label className="block text-sm font-medium text-text mb-2">
                Motivo do Cancelamento (opcional)
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
                rows={3}
                placeholder="Por que este agendamento foi cancelado?"
                disabled={updating}
              />
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowCancelReason(false)}
                  className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
                  disabled={updating}
                >
                  Voltar
                </button>
                <button
                  onClick={() => updateStatus('cancelled')}
                  disabled={updating}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {updating ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </div>
          )}

          {!showCancelReason && (
            <div className="pt-4 border-t border-accent/10">
              <label className="text-sm font-medium text-text mb-3 block">Ações</label>
              <div className="grid grid-cols-2 gap-3">
                {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="btn-touch bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <CalendarClock className="w-4 h-4" />
                    Remarcar
                  </button>
                )}
                {appointment.status !== 'confirmed' && appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                  <button
                    onClick={() => updateStatus('confirmed')}
                    disabled={updating}
                    className="btn-touch bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                )}
                {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                  <button
                    onClick={() => updateStatus('completed')}
                    disabled={updating}
                    className="btn-touch bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Concluir
                  </button>
                )}
                {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
                  <button
                    onClick={() => updateStatus('cancelled')}
                    disabled={updating}
                    className="btn-touch bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Payment Modal */}
        {showPaymentModal && (
          <PaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            appointmentId={appointment.id}
            patientName={appointment.patient?.full_name || ''}
            procedureName={appointment.procedure?.name || ''}
            totalAmount={appointment.procedure?.default_price || 0}
            downpaymentAmount={appointment.downpayment_amount}
            downpaymentMethod={appointment.downpayment_method}
            onSuccess={handlePaymentSuccess}
          />
        )}
    </div>
  );
}

// ==================== TimeSlotPicker ====================

interface TimeSlotPickerProps {
  value: string;
  onChange: (time: string) => void;
  professionalId: string;
  date: string;
  excludeAppointmentId?: string;
  disabled?: boolean;
}

interface OccupiedSlot {
  patientName: string;
}

function TimeSlotPicker({ value, onChange, professionalId, date, excludeAppointmentId, disabled }: TimeSlotPickerProps) {
  const [occupiedSlots, setOccupiedSlots] = useState<Record<string, OccupiedSlot>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (professionalId && date) {
      loadDayAppointments();
    }
  }, [professionalId, date]);

  async function loadDayAppointments() {
    setLoadingSlots(true);
    try {
      let query = supabase
        .from('appointments')
        .select('id, appointment_time, patient:patients(full_name), procedure:procedures(duration_minutes)')
        .eq('professional_id', professionalId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed'])
        .order('appointment_time');

      if (excludeAppointmentId) {
        query = query.neq('id', excludeAppointmentId);
      }

      const { data: appointments, error } = await query;
      if (error) throw error;

      const occupied: Record<string, OccupiedSlot> = {};
      for (const apt of appointments || []) {
        const patient = apt.patient as { full_name: string } | null;
        const procedure = apt.procedure as { duration_minutes: number } | null;
        const startTime = apt.appointment_time.substring(0, 5);
        const duration = procedure?.duration_minutes || 30;
        const patientName = patient?.full_name || '';

        // Mark all 15-min slots within the duration as occupied
        const [startH, startM] = startTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        for (let m = startMinutes; m < startMinutes + duration; m += 15) {
          const h = Math.floor(m / 60);
          const min = m % 60;
          const slotKey = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
          occupied[slotKey] = { patientName };
        }
      }
      setOccupiedSlots(occupied);
    } catch (error) {
    } finally {
      setLoadingSlots(false);
    }
  }

  const periods = useMemo(() => {
    const slots: { time: string; period: string }[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const period = h < 6 ? 'Madrugada' : h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
        slots.push({ time, period });
      }
    }

    const grouped: { name: string; slots: string[] }[] = [];
    let current: { name: string; slots: string[] } | null = null;
    for (const slot of slots) {
      if (!current || current.name !== slot.period) {
        current = { name: slot.period, slots: [] };
        grouped.push(current);
      }
      current.slots.push(slot.time);
    }
    return grouped;
  }, []);

  const defaultOpen = { 'Madrugada': false, 'Manhã': true, 'Tarde': true, 'Noite': false };
  const [openPeriods, setOpenPeriods] = useState<Record<string, boolean>>(defaultOpen);

  function togglePeriod(name: string) {
    setOpenPeriods((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  if (loadingSlots) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-text-muted">Carregando horários...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {periods.map((period) => {
        const isOpen = openPeriods[period.name] ?? true;
        const occupiedCount = period.slots.filter((t) => occupiedSlots[t]).length;

        return (
          <div key={period.name} className="border border-accent/10 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => togglePeriod(period.name)}
              className="w-full flex items-center justify-between px-4 py-3 bg-champagne-nuvem hover:bg-champagne-nuvem/80 transition-colors"
            >
              <span className="text-sm font-semibold text-text">{period.name}</span>
              <div className="flex items-center gap-2">
                {occupiedCount > 0 && (
                  <span className="text-[10px] text-text-muted">{occupiedCount} ocupado{occupiedCount > 1 ? 's' : ''}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen && (
              <div className="grid grid-cols-4 gap-2 p-3">
                {period.slots.map((time) => {
                  const occupied = occupiedSlots[time];
                  const isSelected = value === time;

                  if (occupied) {
                    return (
                      <div
                        key={time}
                        className="p-2 rounded-lg border border-gray-200 bg-gray-100 text-center cursor-not-allowed opacity-60"
                      >
                        <p className="text-sm font-medium text-gray-400 line-through">{time}</p>
                        <p className="text-[10px] text-gray-400 truncate">{occupied.patientName}</p>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => onChange(time)}
                      disabled={disabled}
                      className={`p-2 rounded-lg border-2 transition-all text-center ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-accent/10 bg-champagne-nuvem hover:border-accent/40'
                      }`}
                    >
                      <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-text'}`}>{time}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== EditAppointmentForm ====================

interface EditAppointmentFormProps {
  appointment: Appointment;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function EditAppointmentForm({
  appointment,
  onClose,
  onSuccess,
  showToast,
}: EditAppointmentFormProps) {
  const { isSuperAdmin } = useAuth();
  const [patientId, setPatientId] = useState(appointment.patient_id);
  const [procedureId, setProcedureId] = useState(appointment.procedure_id);
  const [professionalId, setProfessionalId] = useState(appointment.professional_id);
  const [appointmentDate, setAppointmentDate] = useState(appointment.appointment_date);
  const [appointmentTime, setAppointmentTime] = useState(appointment.appointment_time.substring(0, 5));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadProfessionals();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (professionalId) {
      loadProcedures(professionalId);
    }
  }, [professionalId]);

  useEffect(() => {
    if (patientId && procedureId && professionalId && appointmentDate && appointmentTime) {
      checkConflict();
    }
  }, [patientId, procedureId, professionalId, appointmentDate, appointmentTime]);

  async function loadProcedures(profId: string) {
    try {
      const { data, error } = await supabase
        .from('professional_procedures')
        .select(`
          procedure_id,
          procedures:procedure_id (
            id,
            name,
            duration_minutes,
            default_price
          )
        `)
        .eq('professional_id', profId);

      if (error) throw error;

      const proceduresList = data
        ?.map((item: { procedures: Procedure | null }) => item.procedures)
        .filter((proc: Procedure | null): proc is Procedure => proc !== null) || [];

      setProcedures(proceduresList);
    } catch (error) {
      setProcedures([]);
    }
  }

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
    }
  }

  async function checkConflict() {
    try {
      const { data, error } = await supabase.rpc('check_appointment_conflict', {
        p_professional_id: professionalId,
        p_appointment_date: appointmentDate,
        p_appointment_time: appointmentTime,
        p_procedure_id: procedureId,
        p_appointment_id: appointment.id,
      });

      if (error) throw error;
      setConflict(data === true);
    } catch (error) {
      setConflict(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validation = validateAppointmentData({
      patientId,
      procedureId,
      professionalId,
      appointmentDate,
      appointmentTime,
    });

    if (!validation.isValid) {
      const firstError = validation.errors[0];
      showToast(firstError.type, firstError.title, firstError.description);
      setError(firstError.title);
      return;
    }

    if (conflict) {
      showToast('error', 'Conflito de horário', 'Já existe um agendamento para este profissional neste horário.');
      setError('Conflito de horário');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          patient_id: patientId,
          procedure_id: procedureId,
          professional_id: professionalId,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
        })
        .eq('id', appointment.id);

      if (updateError) throw updateError;

      showToast('success', 'Agendamento remarcado!', 'Os dados do agendamento foram atualizados com sucesso.');
      onSuccess();
    } catch (error) {
      const appError = parseSupabaseError(error);
      showToast(appError.type, appError.title, appError.description);
      setError(appError.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        Editando agendamento de <strong>{appointment.patient?.full_name}</strong>
      </div>

      {/* Professional (Super Admin only) */}
      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Profissional *
          </label>
          <select
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setProcedureId('');
            }}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
            required
            disabled={loading}
          >
            <option value="">Selecione um profissional</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Patient Autocomplete */}
      <div>
        <label className="block text-sm font-medium text-text mb-2">
          Paciente *
        </label>
        <PatientAutocomplete
          value={patientId}
          onChange={setPatientId}
          professionalId={professionalId}
          placeholder="Digite o nome do paciente..."
        />
      </div>

      {/* Procedure Grid */}
      <div>
        <label className="block text-sm font-medium text-text mb-3">
          Procedimento *
        </label>
        {!professionalId ? (
          <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
            {isSuperAdmin
              ? 'Selecione um profissional primeiro para ver os procedimentos disponíveis.'
              : 'Carregando procedimentos...'}
          </div>
        ) : procedures.length === 0 ? (
          <div className="bg-yellow-50 border-2 border-yellow-200 text-yellow-700 px-4 py-3 rounded-xl text-sm">
            <p className="font-semibold mb-1">Nenhum procedimento associado</p>
            <p className="text-xs">Este profissional ainda não tem procedimentos configurados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {procedures.map((procedure) => (
              <button
                key={procedure.id}
                type="button"
                onClick={() => setProcedureId(procedure.id)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  procedureId === procedure.id
                    ? 'border-primary bg-primary/10'
                    : 'border-accent/10 bg-champagne-nuvem hover:border-accent/40'
                }`}
              >
                <p className="font-semibold text-text text-sm mb-1 line-clamp-2">
                  {procedure.name}
                </p>
                <p className="text-xs text-text-muted">
                  {procedure.duration_minutes} min
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Data */}
      <div>
        <label className="block text-sm font-medium text-text mb-2">Data *</label>
        <input
          type="date"
          value={appointmentDate}
          onChange={(e) => setAppointmentDate(e.target.value)}
          className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
          required
          disabled={loading}
        />
      </div>

      {/* Horário - Grid Visual */}
      {professionalId && appointmentDate ? (
        <div>
          <label className="block text-sm font-medium text-text mb-3">Horário *</label>
          <TimeSlotPicker
            value={appointmentTime}
            onChange={setAppointmentTime}
            professionalId={professionalId}
            date={appointmentDate}
            excludeAppointmentId={appointment.id}
            disabled={loading}
          />
        </div>
      ) : (
        <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
          Selecione um profissional e uma data para ver os horários disponíveis.
        </div>
      )}

      {/* Conflict Warning */}
      {conflict && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Conflito de horário!</p>
            <p className="text-xs">Já existe um agendamento para este profissional neste horário.</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 btn-touch border border-accent/15 text-text hover:bg-champagne-nuvem rounded-xl transition-colors font-medium"
          disabled={loading}
        >
          Voltar
        </button>
        <button
          type="submit"
          className="flex-1 btn-touch bg-primary hover:bg-primary-hover text-white rounded-xl transition-colors disabled:opacity-50 font-semibold"
          disabled={loading || conflict || !patientId || !procedureId}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </span>
          ) : (
            'Salvar Alterações'
          )}
        </button>
      </div>
    </form>
  );
}

// ==================== CreateAppointmentForm ====================

interface CreateAppointmentFormProps {
  defaultDate: string;
  defaultProfessionalId: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function CreateAppointmentForm({
  defaultDate,
  defaultProfessionalId,
  onClose,
  onSuccess,
  showToast,
}: CreateAppointmentFormProps) {
  const { user, isSuperAdmin } = useAuth();
  const [patientId, setPatientId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId);
  const [appointmentDate, setAppointmentDate] = useState(defaultDate);
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  // Estados para calção
  const [hasDownpayment, setHasDownpayment] = useState(false);
  const [downpaymentAmount, setDownpaymentAmount] = useState(0);
  const [downpaymentMethod, setDownpaymentMethod] = useState<'dinheiro' | 'credito' | 'debito' | 'pix'>('dinheiro');
  const [downpaymentNotes, setDownpaymentNotes] = useState('');
  const [selectedProcedurePrice, setSelectedProcedurePrice] = useState(0);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadProfessionals();
    }
  }, [isSuperAdmin]);

  // Recarregar procedimentos quando o profissional mudar
  useEffect(() => {
    if (professionalId) {
      loadProcedures(professionalId);
    }
  }, [professionalId]);

  // Atualizar preço quando procedimento for selecionado
  useEffect(() => {
    if (procedureId) {
      const selected = procedures.find(p => p.id === procedureId);
      if (selected) {
        setSelectedProcedurePrice(selected.default_price);
      }
    }
  }, [procedureId, procedures]);

  useEffect(() => {
    if (patientId && procedureId && professionalId && appointmentDate && appointmentTime) {
      checkConflict();
    }
  }, [patientId, procedureId, professionalId, appointmentDate, appointmentTime]);

  async function loadProcedures(profId: string) {
    try {
      // Carregar procedimentos associados ao profissional
      const { data, error } = await supabase
        .from('professional_procedures')
        .select(`
          procedure_id,
          procedures:procedure_id (
            id,
            name,
            duration_minutes,
            default_price
          )
        `)
        .eq('professional_id', profId);

      if (error) throw error;

      // Extrair os dados dos procedimentos da resposta
      const proceduresList = data
        ?.map((item: { procedures: Procedure | null }) => item.procedures)
        .filter((proc: Procedure | null): proc is Procedure => proc !== null) || [];

      setProcedures(proceduresList);
    } catch (error) {
      // Em caso de erro, não mostrar procedimentos
      setProcedures([]);
    }
  }

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
    }
  }

  async function checkConflict() {
    try {
      const { data, error } = await supabase.rpc('check_appointment_conflict', {
        p_professional_id: professionalId,
        p_appointment_date: appointmentDate,
        p_appointment_time: appointmentTime,
        p_procedure_id: procedureId,
        p_appointment_id: null
      });

      if (error) throw error;
      setConflict(data === true);
    } catch (error) {
      setConflict(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    const validation = validateAppointmentData({
      patientId,
      procedureId,
      professionalId,
      appointmentDate,
      appointmentTime,
    });

    if (!validation.isValid) {
      // Show first validation error
      const firstError = validation.errors[0];
      showToast(firstError.type, firstError.title, firstError.description);
      setError(firstError.title);
      return;
    }

    // Check for conflicts
    if (conflict) {
      showToast('error', 'Conflito de horário', 'Já existe um agendamento para este profissional neste horário.');
      setError('Conflito de horário');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Validar calção se foi informado
      if (hasDownpayment) {
        if (downpaymentAmount <= 0) {
          showToast('error', 'Calção inválido', 'O valor do calção deve ser maior que zero.');
          setLoading(false);
          return;
        }
        if (downpaymentAmount >= selectedProcedurePrice) {
          showToast('error', 'Calção inválido', 'O calção deve ser menor que o valor total do serviço.');
          setLoading(false);
          return;
        }
      }

      const { data: newAppointment, error: insertError } = await supabase.from('appointments').insert({
        patient_id: patientId,
        procedure_id: procedureId,
        professional_id: professionalId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        status: 'scheduled',
        downpayment_amount: hasDownpayment ? downpaymentAmount : 0,
        downpayment_method: hasDownpayment ? downpaymentMethod : null,
        downpayment_notes: hasDownpayment ? downpaymentNotes : null,
        has_payment: hasDownpayment,
        created_by: user?.id,
      }).select().single();

      if (insertError) throw insertError;

      // Se houver calção, criar transação no caixa
      if (hasDownpayment && newAppointment) {
        // Buscar ou criar fechamento do dia
        const today = new Date().toISOString().split('T')[0];
        let { data: closing } = await supabase
          .from('cash_register_closings')
          .select('id')
          .eq('professional_id', professionalId)
          .eq('closing_date', today)
          .eq('is_finalized', false)
          .single();

        if (!closing) {
          const { data: newClosing, error: closingError } = await supabase
            .from('cash_register_closings')
            .insert({
              professional_id: professionalId,
              closing_date: today,
              total_amount: 0,
              is_finalized: false,
            })
            .select('id')
            .single();

          if (closingError) throw closingError;
          closing = newClosing;
        }

        if (closing) {
          const { error: transactionError } = await supabase
            .from('cash_register_transactions')
            .insert({
              closing_id: closing.id,
              appointment_id: newAppointment.id,
              amount: downpaymentAmount,
              payment_method: downpaymentMethod === 'dinheiro' ? 'Dinheiro' :
                              downpaymentMethod === 'credito' ? 'Cartão de Crédito' :
                              downpaymentMethod === 'debito' ? 'Cartão de Débito' : 'PIX',
              transaction_type: 'downpayment',
              notes: downpaymentNotes || 'Calção de agendamento',
            });

          if (transactionError) {
            // Não bloquear o agendamento se a transação falhar
          }
        }
      }

      // Success toast
      showToast('success', 'Agendamento criado!',
        hasDownpayment
          ? `O agendamento foi salvo e o calção de R$ ${downpaymentAmount.toFixed(2)} foi registrado.`
          : 'O agendamento foi salvo com sucesso.'
      );
      onSuccess();
    } catch (error) {
      // Parse and display user-friendly error
      const appError = parseSupabaseError(error);
      showToast(appError.type, appError.title, appError.description);
      setError(appError.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Professional (Super Admin only) - Primeiro para carregar procedimentos */}
      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Profissional *
          </label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
            required
            disabled={loading}
          >
            <option value="">Selecione um profissional</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Patient Autocomplete */}
      <div>
        <label className="block text-sm font-medium text-text mb-2">
          Paciente *
        </label>
        <PatientAutocomplete
          value={patientId}
          onChange={setPatientId}
          professionalId={professionalId}
          placeholder="Digite o nome do paciente..."
        />
      </div>

      {/* Procedure Grid */}
      <div>
        <label className="block text-sm font-medium text-text mb-3">
          Procedimento *
        </label>
        {!professionalId ? (
          <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
            {isSuperAdmin
              ? 'Selecione um profissional primeiro para ver os procedimentos disponíveis.'
              : 'Carregando procedimentos...'}
          </div>
        ) : procedures.length === 0 ? (
          <div className="bg-yellow-50 border-2 border-yellow-200 text-yellow-700 px-4 py-3 rounded-xl text-sm">
            <p className="font-semibold mb-1">Nenhum procedimento associado</p>
            <p className="text-xs">Este profissional ainda não tem procedimentos configurados. Entre em contato com o administrador.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {procedures.map((procedure) => (
              <button
                key={procedure.id}
                type="button"
                onClick={() => setProcedureId(procedure.id)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  procedureId === procedure.id
                    ? 'border-primary bg-primary/10'
                    : 'border-accent/10 bg-champagne-nuvem hover:border-accent/40'
                }`}
              >
                <p className="font-semibold text-text text-sm mb-1 line-clamp-2">
                  {procedure.name}
                </p>
                <p className="text-xs text-text-muted">
                  {procedure.duration_minutes} min
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Data */}
      <div>
        <label className="block text-sm font-medium text-text mb-2">Data *</label>
        <input
          type="date"
          value={appointmentDate}
          onChange={(e) => setAppointmentDate(e.target.value)}
          className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
          required
          disabled={loading}
        />
      </div>

      {/* Horário - Grid Visual */}
      {professionalId && appointmentDate ? (
        <div>
          <label className="block text-sm font-medium text-text mb-3">Horário *</label>
          <TimeSlotPicker
            value={appointmentTime}
            onChange={setAppointmentTime}
            professionalId={professionalId}
            date={appointmentDate}
            disabled={loading}
          />
        </div>
      ) : (
        <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
          Selecione um profissional e uma data para ver os horários disponíveis.
        </div>
      )}

      {/* Conflict Warning */}
      {conflict && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Conflito de horário!</p>
            <p className="text-xs">Já existe um agendamento para este profissional neste horário.</p>
          </div>
        </div>
      )}

      {/* Calção (Opcional) */}
      {selectedProcedurePrice > 0 && (
        <div className="border-t border-accent/10 pt-4 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDownpayment}
              onChange={(e) => setHasDownpayment(e.target.checked)}
              className="w-4 h-4 text-primary bg-champagne-nuvem border-accent/15 rounded focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
            <span className="text-sm font-medium text-text">
              Cliente pagou calção (entrada)
            </span>
          </label>

          {hasDownpayment && (
            <div className="mt-4 space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium">
                Valor total do serviço: R$ {selectedProcedurePrice.toFixed(2)}
              </p>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Valor do calção *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
                    R$
                  </span>
                  <input
                    type="number"
                    value={downpaymentAmount || ''}
                    onChange={(e) => setDownpaymentAmount(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-2 bg-background border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    max={selectedProcedurePrice}
                    required={hasDownpayment}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Forma de pagamento *
                </label>
                <select
                  value={downpaymentMethod}
                  onChange={(e) => setDownpaymentMethod(e.target.value as 'dinheiro' | 'credito' | 'debito' | 'pix')}
                  className="w-full px-4 py-2 bg-background border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text"
                  required={hasDownpayment}
                  disabled={loading}
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="pix">PIX</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Observações (opcional)
                </label>
                <textarea
                  value={downpaymentNotes}
                  onChange={(e) => setDownpaymentNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
                  rows={2}
                  placeholder="Ex: Cliente pagou R$ 20 de entrada..."
                  disabled={loading}
                />
              </div>

              {downpaymentAmount > 0 && (
                <p className="text-sm text-green-700">
                  Restante a pagar: R$ {(selectedProcedurePrice - downpaymentAmount).toFixed(2)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 btn-touch border border-accent/15 text-text hover:bg-champagne-nuvem rounded-xl transition-colors font-medium"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 btn-touch bg-primary hover:bg-primary-hover text-white rounded-xl transition-colors disabled:opacity-50 font-semibold"
          disabled={loading || conflict || !patientId || !procedureId}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </span>
          ) : (
            'Agendar'
          )}
        </button>
      </div>
    </form>
  );
}
