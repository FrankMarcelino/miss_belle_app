import { Appointment } from '../../../types/agenda';
import { getPaymentStatusConfig } from '../../../lib/appointmentUtils';

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  onDayClick: (day: Date) => void;
}

const statusDotColor = (s: string) =>
  ({ scheduled: '#8b7fa3', confirmed: '#c8a97e', completed: '#16a34a', cancelled: '#9ca3af' } as Record<string, string>)[s] ?? '#9ca3af';

export default function MonthView({ currentDate, appointments, onDayClick }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const totalDays = lastDayOfMonth.getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const aptsByDate: Record<string, Appointment[]> = {};
  for (const apt of appointments) {
    if (!aptsByDate[apt.appointment_date]) aptsByDate[apt.appointment_date] = [];
    aptsByDate[apt.appointment_date].push(apt);
  }

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weekDayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDayHeaders.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-text-muted py-2">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} className="min-h-[72px]" />;
          const dateStr = date.toISOString().split('T')[0];
          const dayApts = aptsByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          const visible = dayApts.slice(0, 3);
          const overflow = dayApts.length - 3;

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(date)}
              className={`min-h-[72px] rounded-lg flex flex-col items-start p-1 gap-0.5 text-sm transition-colors hover:bg-champagne-nuvem border ${
                isToday ? 'border-primary bg-primary/5 font-bold' : 'border-transparent'
              }`}
            >
              <span className={`text-xs w-full text-center mb-0.5 ${isToday ? 'text-primary' : 'text-text'}`}>
                {date.getDate()}
              </span>
              {visible.map((apt) => {
                const pc = getPaymentStatusConfig(apt.payment_status);
                return (
                  <div
                    key={apt.id}
                    className="w-full flex items-center gap-1 rounded text-[10px] px-1 py-0.5 bg-white overflow-hidden"
                    style={{ borderLeft: `3px solid ${statusDotColor(apt.status)}` }}
                  >
                    <span className="truncate flex-1 min-w-0">
                      {apt.patient?.full_name?.split(' ')[0] ?? '—'}
                    </span>
                    {pc && <pc.Icon className={`w-2.5 h-2.5 flex-shrink-0 ${pc.color}`} />}
                  </div>
                );
              })}
              {overflow > 0 && <span className="text-[9px] text-text-muted pl-1">+{overflow}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
