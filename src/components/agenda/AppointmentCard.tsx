import { useState } from 'react';
import { Appointment, ShowToastFn } from '../../types/agenda';
import { getPaymentStatusConfig, getStatusColor, getStatusLabel } from '../../lib/appointmentUtils';
import BottomSheet from '../mobile/BottomSheet';
import AppointmentDetailsSheet from './AppointmentDetailsSheet';
import { Clock } from 'lucide-react';

interface AppointmentCardProps {
  appointment: Appointment;
  onRefresh: () => void;
  showToast: ShowToastFn;
  isNext?: boolean;
}

export default function AppointmentCard({ appointment, onRefresh, showToast, isNext }: AppointmentCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const pc = getPaymentStatusConfig(appointment.payment_status);

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
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${getStatusColor(appointment.status)}`}
              >
                {getStatusLabel(appointment.status)}
              </span>
              {pc && (
                <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${pc.bg} ${pc.color}`}>
                  <pc.Icon className="w-3 h-3" />
                  {pc.label}
                </span>
              )}
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
              <p className="text-text-muted text-sm truncate">Profissional: {appointment.professional.full_name}</p>
            )}
          </div>
        </div>
      </div>

      <BottomSheet isOpen={showDetails} onClose={() => setShowDetails(false)} title="Detalhes do Agendamento">
        <AppointmentDetailsSheet
          appointment={appointment}
          onClose={() => setShowDetails(false)}
          onRefresh={onRefresh}
          showToast={showToast}
        />
      </BottomSheet>
    </>
  );
}
