import { useEffect, useState, useMemo, Fragment } from 'react';
import { Appointment, ShowToastFn } from '../../../types/agenda';
import AppointmentCard from '../AppointmentCard';
import { CalendarClock, Plus } from 'lucide-react';

interface DayViewProps {
  appointments: Appointment[];
  currentDate: Date;
  onRefresh: () => void;
  showToast: ShowToastFn;
  onCreateNew: () => void;
}

export default function DayView({ appointments, currentDate, onRefresh, showToast, onCreateNew }: DayViewProps) {
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
      (apt) => apt.appointment_time >= nowTimeStr && (apt.status === 'scheduled' || apt.status === 'confirmed')
    );
    return upcoming.length > 0 ? upcoming[0].id : null;
  }, [appointments, viewingToday, nowTimeStr]);

  const timeIndicatorIndex = useMemo(() => {
    if (!viewingToday) return -1;
    const idx = appointments.findIndex((apt) => apt.appointment_time.substring(0, 5) > nowTimeStr);
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
