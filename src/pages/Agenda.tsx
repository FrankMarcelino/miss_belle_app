import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BottomSheet from '../components/mobile/BottomSheet';
import PatientAutocomplete from '../components/mobile/PatientAutocomplete';
import { Plus, Loader2, ChevronLeft, ChevronRight, AlertCircle, Clock, Search } from 'lucide-react';

interface Appointment {
  id: string;
  patient_id: string;
  procedure_id: string;
  professional_id: string;
  appointment_date: string;
  appointment_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  cancellation_reason: string | null;
  patient?: { full_name: string };
  procedure?: { name: string; duration_minutes: number };
  professional?: { full_name: string };
}

interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Professional {
  id: string;
  full_name: string;
}

type ViewMode = 'day' | 'week';

export default function Agenda() {
  const { user, isSuperAdmin } = useAuth();
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
      console.error('Error loading professionals:', error);
    }
  }

  async function loadAppointments() {
    try {
      setLoading(true);
      let query = supabase
        .from('appointments')
        .select(`
          *,
          patient:patients(full_name),
          procedure:procedures(name, duration_minutes),
          professional:profiles(full_name)
        `)
        .order('appointment_time');

      const dateStr = currentDate.toISOString().split('T')[0];

      if (viewMode === 'day') {
        query = query.eq('appointment_date', dateStr);
      } else {
        const startOfWeek = getStartOfWeek(currentDate);
        const endOfWeek = getEndOfWeek(currentDate);
        query = query
          .gte('appointment_date', startOfWeek.toISOString().split('T')[0])
          .lte('appointment_date', endOfWeek.toISOString().split('T')[0]);
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
      console.error('Error loading appointments:', error);
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
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(newDate);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-accent/10 text-accent border-accent/20';
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

  // Filter appointments based on search and status
  const filteredAppointments = appointments.filter((apt) => {
    // Status filter
    if (statusFilter !== 'all' && apt.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const patientName = apt.patient?.full_name?.toLowerCase() || '';
      const procedureName = apt.procedure?.name?.toLowerCase() || '';
      return patientName.includes(query) || procedureName.includes(query);
    }

    return true;
  });

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
            className="w-full pl-12 pr-4 py-3 bg-background-card border border-accent/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base shadow-soft"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scroll-hidden">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'scheduled', label: 'Marcados' },
            { value: 'confirmed', label: 'Confirmados' },
            { value: 'completed', label: 'Realizados' },
            { value: 'cancelled', label: 'Cancelados' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                statusFilter === filter.value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background-card text-text border-accent/20 hover:bg-champagne-nuvem'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-background-card rounded-xl border border-accent/20 shadow-card">
        <div className="p-6 border-b border-accent/20 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 bg-champagne-nuvem rounded-lg p-1 border border-accent/20">
              <button
                onClick={() => setViewMode('day')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'day'
                    ? 'bg-primary text-white'
                    : 'text-text hover:bg-background-card'
                }`}
              >
                Dia
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'week'
                    ? 'bg-primary text-white'
                    : 'text-text hover:bg-background-card'
                }`}
              >
                Semana
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-text" />
              </button>
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={() => navigateDate('next')}
                className="p-2 hover:bg-champagne-nuvem rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-text" />
              </button>
            </div>

            <div className="text-text font-semibold">
              {viewMode === 'day'
                ? currentDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })
                : `${getStartOfWeek(currentDate).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })} - ${getEndOfWeek(currentDate).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}`}
            </div>
          </div>

          {isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Filtrar por Profissional
              </label>
              <select
                value={selectedProfessional}
                onChange={(e) => setSelectedProfessional(e.target.value)}
                className="w-full sm:w-64 px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            {viewMode === 'day' ? (
              <DayView
                appointments={appointments}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onRefresh={loadAppointments}
              />
            ) : (
              <WeekView
                weekDays={weekDays}
                groupedAppointments={groupedAppointments}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onRefresh={loadAppointments}
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
        />
      </BottomSheet>
    </div>
  );
}

interface DayViewProps {
  appointments: Appointment[];
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
}

function DayView({ appointments, getStatusColor, getStatusLabel, onRefresh }: DayViewProps) {
  if (appointments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Nenhum agendamento para este dia</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((apt) => (
        <AppointmentCard
          key={apt.id}
          appointment={apt}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

interface WeekViewProps {
  weekDays: Date[];
  groupedAppointments: Record<string, Appointment[]>;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
}

function WeekView({ weekDays, groupedAppointments, getStatusColor, getStatusLabel }: WeekViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
      {weekDays.map((day) => {
        const dateStr = day.toISOString().split('T')[0];
        const dayAppointments = groupedAppointments[dateStr] || [];
        const isToday = dateStr === new Date().toISOString().split('T')[0];

        return (
          <div
            key={dateStr}
            className={`bg-champagne-nuvem rounded-lg p-4 border ${
              isToday ? 'border-primary' : 'border-accent/20'
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
                    className="bg-background rounded-lg p-2 border border-accent/20 text-xs"
                  >
                    <div className="font-medium text-text truncate">
                      {apt.appointment_time.substring(0, 5)}
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
  );
}

interface AppointmentCardProps {
  appointment: Appointment;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onRefresh: () => void;
}

function AppointmentCard({ appointment, getStatusColor, getStatusLabel, onRefresh }: AppointmentCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        className="bg-champagne-nuvem rounded-xl p-5 border border-accent/20 hover:shadow-soft transition-all cursor-pointer active:scale-[0.98] min-h-[80px] md:min-h-[72px]"
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
            </div>
            <h4 className="text-text font-semibold text-base mb-1.5 truncate">{appointment.patient?.full_name}</h4>
            <p className="text-text-muted text-sm mb-1 truncate">{appointment.procedure?.name}</p>
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
        />
      </BottomSheet>
    </>
  );
}

interface AppointmentDetailsContentProps {
  appointment: Appointment;
  onClose: () => void;
  onRefresh: () => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
}

function AppointmentDetailsContent({
  appointment,
  onClose,
  onRefresh,
  getStatusColor,
  getStatusLabel,
}: AppointmentDetailsContentProps) {
  const [updating, setUpdating] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  async function updateStatus(newStatus: 'scheduled' | 'confirmed' | 'completed' | 'cancelled') {
    if (newStatus === 'cancelled' && !showCancelReason) {
      setShowCancelReason(true);
      return;
    }

    setUpdating(true);
    try {
      const updateData: any = { status: newStatus };
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
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
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

          <div>
            <label className="text-sm text-text-muted">Procedimento</label>
            <p className="text-text font-medium">{appointment.procedure?.name}</p>
          </div>

          <div>
            <label className="text-sm text-text-muted">Data e Hora</label>
            <p className="text-text font-medium">
              {new Date(appointment.appointment_date).toLocaleDateString('pt-BR')} às{' '}
              {appointment.appointment_time.substring(0, 5)}
            </p>
          </div>

          {appointment.professional && (
            <div>
              <label className="text-sm text-text-muted">Profissional</label>
              <p className="text-text font-medium">{appointment.professional.full_name}</p>
            </div>
          )}

          {appointment.status === 'cancelled' && appointment.cancellation_reason && (
            <div>
              <label className="text-sm text-text-muted">Motivo do Cancelamento</label>
              <p className="text-text font-medium">{appointment.cancellation_reason}</p>
            </div>
          )}

          {showCancelReason && (
            <div className="pt-4 border-t border-accent/20">
              <label className="block text-sm font-medium text-text mb-2">
                Motivo do Cancelamento (opcional)
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
                rows={3}
                placeholder="Por que este agendamento foi cancelado?"
                disabled={updating}
              />
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowCancelReason(false)}
                  className="flex-1 px-4 py-2 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
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
            <div className="pt-4 border-t border-accent/20">
              <label className="text-sm font-medium text-text mb-3 block">Alterar Status</label>
              <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}

interface CreateAppointmentFormProps {
  defaultDate: string;
  defaultProfessionalId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateAppointmentForm({
  defaultDate,
  defaultProfessionalId,
  onClose,
  onSuccess,
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

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  useEffect(() => {
    loadProcedures();
    if (isSuperAdmin) {
      loadProfessionals();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (patientId && procedureId && professionalId && appointmentDate && appointmentTime) {
      checkConflict();
    }
  }, [patientId, procedureId, professionalId, appointmentDate, appointmentTime]);

  async function loadProcedures() {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('id, name, duration_minutes')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProcedures(data || []);
    } catch (error) {
      console.error('Error loading procedures:', error);
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
      console.error('Error loading professionals:', error);
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
      console.error('Error checking conflict:', error);
      setConflict(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (conflict) {
      setError('Já existe um agendamento para este horário. Escolha outro horário.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: insertError } = await supabase.from('appointments').insert({
        patient_id: patientId,
        procedure_id: procedureId,
        professional_id: professionalId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        status: 'scheduled',
        created_by: user?.id,
      });

      if (insertError) throw insertError;

      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao criar agendamento');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <div className="grid grid-cols-2 gap-3">
          {procedures.map((procedure) => (
            <button
              key={procedure.id}
              type="button"
              onClick={() => setProcedureId(procedure.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                procedureId === procedure.id
                  ? 'border-primary bg-primary/10'
                  : 'border-accent/20 bg-champagne-nuvem hover:border-accent/40'
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
      </div>

      {/* Professional (Super Admin only) */}
      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Profissional *
          </label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
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

      {/* Date and Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text mb-2">Data *</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-2">Horário *</label>
          <input
            type="time"
            value={appointmentTime}
            onChange={(e) => setAppointmentTime(e.target.value)}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
            required
            disabled={loading}
          />
        </div>
      </div>

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
          className="flex-1 btn-touch border border-accent/30 text-text hover:bg-champagne-nuvem rounded-xl transition-colors font-medium"
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
