import { useState } from 'react';
import { Appointment, ShowToastFn } from '../../../types/agenda';
import { getPaymentStatusConfig } from '../../../lib/appointmentUtils';
import BottomSheet from '../../mobile/BottomSheet';
import AppointmentDetailsSheet from '../AppointmentDetailsSheet';

interface WeekViewProps {
  weekDays: Date[];
  groupedAppointments: Record<string, Appointment[]>;
  onRefresh: () => void;
  showToast: ShowToastFn;
}

export default function WeekView({ weekDays, groupedAppointments, onRefresh, showToast }: WeekViewProps) {
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
              className={`bg-champagne-nuvem rounded-lg p-4 border ${isToday ? 'border-primary' : 'border-accent/10'}`}
            >
              <div className="mb-3">
                <div className={`text-sm font-medium ${isToday ? 'text-primary' : 'text-text-muted'}`}>
                  {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                </div>
                <div className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-text'}`}>
                  {day.getDate()}
                </div>
              </div>

              {dayAppointments.length === 0 ? (
                <p className="text-xs text-text-muted">Sem agendamentos</p>
              ) : (
                <div className="space-y-2">
                  {dayAppointments.map((apt) => {
                    const pc = getPaymentStatusConfig(apt.payment_status);
                    return (
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
                        <div className="text-text-muted truncate">{apt.patient?.full_name}</div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <div
                            className={`inline-block px-2 py-0.5 rounded-full text-xs border ${
                              apt.status === 'scheduled' ? 'bg-accent/10 text-accent border-accent/10' :
                              apt.status === 'confirmed' ? 'bg-primary/10 text-primary border-primary/20' :
                              apt.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                              'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {apt.status === 'scheduled' ? 'Marcado' : apt.status === 'confirmed' ? 'Confirmado' :
                             apt.status === 'completed' ? 'Realizado' : 'Cancelado'}
                          </div>
                          {pc && <pc.Icon className={`w-3 h-3 mt-0.5 ${pc.color}`} />}
                        </div>
                      </div>
                    );
                  })}
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
          <AppointmentDetailsSheet
            appointment={selectedAppointment}
            onClose={() => setSelectedAppointment(null)}
            onRefresh={() => { setSelectedAppointment(null); onRefresh(); }}
            showToast={showToast}
          />
        </BottomSheet>
      )}
    </>
  );
}
