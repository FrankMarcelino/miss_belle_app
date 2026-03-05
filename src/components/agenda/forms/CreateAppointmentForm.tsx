import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import PatientAutocomplete from '../../mobile/PatientAutocomplete';
import TimeSlotPicker from './TimeSlotPicker';
import { validateAppointmentData } from '../../../lib/errorHandling';
import { parseSupabaseError } from '../../../lib/errorHandling';
import { Procedure, Professional, ShowToastFn } from '../../../types/agenda';
import { AlertCircle, Loader2 } from 'lucide-react';

interface CreateAppointmentFormProps {
  defaultDate: string;
  defaultProfessionalId: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: ShowToastFn;
}

export default function CreateAppointmentForm({
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

  const [hasDownpayment, setHasDownpayment] = useState(false);
  const [downpaymentAmount, setDownpaymentAmount] = useState(0);
  const [downpaymentMethod, setDownpaymentMethod] = useState<'dinheiro' | 'credito' | 'debito' | 'pix'>('dinheiro');
  const [downpaymentNotes, setDownpaymentNotes] = useState('');
  const [selectedProcedurePrice, setSelectedProcedurePrice] = useState(0);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  useEffect(() => {
    if (isSuperAdmin) loadProfessionals();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (professionalId) loadProcedures(professionalId);
  }, [professionalId]);

  useEffect(() => {
    if (procedureId) {
      const selected = procedures.find((p) => p.id === procedureId);
      if (selected) {
        setSelectedProcedure(selected);
        setSelectedProcedurePrice(selected.is_variable_price ? 0 : selected.default_price);
      }
    } else {
      setSelectedProcedure(null);
    }
  }, [procedureId, procedures]);

  useEffect(() => {
    if (patientId && procedureId && professionalId && appointmentDate && appointmentTime) {
      checkConflict();
    }
  }, [patientId, procedureId, professionalId, appointmentDate, appointmentTime]);

  async function loadProcedures(profId: string) {
    try {
      const { data, error } = await supabase
        .from('professional_procedures')
        .select('procedure_id, procedures:procedure_id (id, name, duration_minutes, default_price, is_variable_price, min_price)')
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
        p_appointment_id: null,
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

    const effectivePrice = selectedProcedure?.is_variable_price
      ? null
      : selectedProcedurePrice;

    if (hasDownpayment) {
      if (downpaymentAmount <= 0) {
        showToast('error', 'Calção inválido', 'O valor do calção deve ser maior que zero.');
        return;
      }
      if (effectivePrice != null && downpaymentAmount >= effectivePrice) {
        showToast('error', 'Calção inválido', 'O calção deve ser menor que o valor total do serviço.');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      const { data: newAppointment, error: insertError } = await supabase
        .from('appointments')
        .insert({
          patient_id: patientId,
          procedure_id: procedureId,
          professional_id: professionalId,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: 'scheduled',
          final_price: effectivePrice,
          downpayment_amount: hasDownpayment ? downpaymentAmount : 0,
          downpayment_method: hasDownpayment ? downpaymentMethod : null,
          downpayment_notes: hasDownpayment ? downpaymentNotes : null,
          has_payment: hasDownpayment,
          created_by: user?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (hasDownpayment && newAppointment) {
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
            .insert({ professional_id: professionalId, closing_date: today, total_amount: 0, is_finalized: false })
            .select('id')
            .single();
          if (closingError) throw closingError;
          closing = newClosing;
        }

        if (closing) {
          await supabase.from('cash_register_transactions').insert({
            closing_id: closing.id,
            appointment_id: newAppointment.id,
            amount: downpaymentAmount,
            payment_method: downpaymentMethod,
            transaction_type: 'downpayment',
            notes: downpaymentNotes || 'Calção de agendamento',
          });
        }
      }

      showToast(
        'success',
        'Agendamento criado!',
        hasDownpayment
          ? `O agendamento foi salvo e o calção de R$ ${downpaymentAmount.toFixed(2)} foi registrado.`
          : 'O agendamento foi salvo com sucesso.'
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
      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">Profissional *</label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
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

      {/* Info for variable price */}
      {selectedProcedure?.is_variable_price && procedureId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800 font-medium">Serviço com valor variável</p>
          <p className="text-xs text-amber-600 mt-1">
            O valor será definido na hora do pagamento, após o atendimento.
            {selectedProcedure.min_price != null && selectedProcedure.min_price > 0 && (
              <> Mínimo: R$ {selectedProcedure.min_price.toFixed(2)}</>
            )}
          </p>
        </div>
      )}

      {(selectedProcedurePrice > 0 || selectedProcedure?.is_variable_price) && procedureId && (
        <div className="border-t border-accent/10 pt-4 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDownpayment}
              onChange={(e) => setHasDownpayment(e.target.checked)}
              className="w-4 h-4 text-primary bg-champagne-nuvem border-accent/15 rounded focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
            <span className="text-sm font-medium text-text">Cliente pagou calção (entrada)</span>
          </label>

          {hasDownpayment && (
            <div className="mt-4 space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
              {selectedProcedurePrice > 0 && (
                <p className="text-sm text-green-800 font-medium">
                  Valor total do serviço: R$ {selectedProcedurePrice.toFixed(2)}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-text mb-2">Valor do calção *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
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
                <label className="block text-sm font-medium text-text mb-2">Forma de pagamento *</label>
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
                <label className="block text-sm font-medium text-text mb-2">Observações (opcional)</label>
                <textarea
                  value={downpaymentNotes}
                  onChange={(e) => setDownpaymentNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text resize-none"
                  rows={2}
                  placeholder="Ex: Cliente pagou R$ 20 de entrada..."
                  disabled={loading}
                />
              </div>
              {downpaymentAmount > 0 && selectedProcedurePrice > 0 && (
                <p className="text-sm text-green-700">
                  Restante a pagar: R$ {(selectedProcedurePrice - downpaymentAmount).toFixed(2)}
                </p>
              )}
            </div>
          )}
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
