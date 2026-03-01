import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import PatientAutocomplete from '../../mobile/PatientAutocomplete';
import TimeSlotPicker from './TimeSlotPicker';
import { validateAppointmentData, parseSupabaseError } from '../../../lib/errorHandling';
import { Appointment, Procedure, Professional, ShowToastFn } from '../../../types/agenda';
import { AlertCircle, Loader2 } from 'lucide-react';

interface EditAppointmentFormProps {
  appointment: Appointment;
  onClose: () => void;
  onSuccess: () => void;
  showToast: ShowToastFn;
}

export default function EditAppointmentForm({
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
    if (isSuperAdmin) loadProfessionals();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (professionalId) loadProcedures(professionalId);
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
        .select('procedure_id, procedures:procedure_id (id, name, duration_minutes, default_price)')
        .eq('professional_id', profId);
      if (error) throw error;
      const list = data
        ?.map((item: { procedures: Procedure | null }) => item.procedures)
        .filter((p: Procedure | null): p is Procedure => p !== null) || [];
      setProcedures(list);
    } catch {
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
    } catch {
      // silently fail
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
    } catch {
      setConflict(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validation = validateAppointmentData({ patientId, procedureId, professionalId, appointmentDate, appointmentTime });
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
      // Detect if date/time changed → save reschedule history
      const dateChanged = appointmentDate !== appointment.appointment_date;
      const timeChanged = appointmentTime !== appointment.appointment_time.substring(0, 5);
      const isReschedule = dateChanged || timeChanged;

      const updatePayload: Record<string, unknown> = {
        patient_id: patientId,
        procedure_id: procedureId,
        professional_id: professionalId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      };

      if (isReschedule) {
        updatePayload.rescheduled_from_date = appointment.appointment_date;
        updatePayload.rescheduled_from_time = appointment.appointment_time.substring(0, 5);
        updatePayload.reschedule_count = (appointment.reschedule_count ?? 0) + 1;
      }

      const { error: updateError } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appointment.id);

      if (updateError) throw updateError;

      showToast(
        'success',
        isReschedule ? 'Agendamento remarcado!' : 'Agendamento atualizado!',
        'Os dados do agendamento foram atualizados com sucesso.'
      );
      onSuccess();
    } catch (err) {
      const appError = parseSupabaseError(err);
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

      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">Profissional *</label>
          <select
            value={professionalId}
            onChange={(e) => { setProfessionalId(e.target.value); setProcedureId(''); }}
            className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
            required
            disabled={loading}
          >
            <option value="">Selecione um profissional</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>{prof.full_name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-text mb-2">Paciente *</label>
        <PatientAutocomplete
          value={patientId}
          onChange={setPatientId}
          professionalId={professionalId}
          placeholder="Digite o nome do paciente..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-3">Procedimento *</label>
        {!professionalId ? (
          <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
            {isSuperAdmin ? 'Selecione um profissional primeiro.' : 'Carregando procedimentos...'}
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
                <p className="font-semibold text-text text-sm mb-1 line-clamp-2">{procedure.name}</p>
                <p className="text-xs text-text-muted">{procedure.duration_minutes} min</p>
              </button>
            ))}
          </div>
        )}
      </div>

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

      {conflict && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Conflito de horário!</p>
            <p className="text-xs">Já existe um agendamento para este profissional neste horário.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

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
