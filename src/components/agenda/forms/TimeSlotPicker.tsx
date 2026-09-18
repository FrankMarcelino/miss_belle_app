import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { buildTimeGrid, type OccupiedInput } from '../../../lib/timeGrid';
import { Loader2, ChevronDown, AlertCircle } from 'lucide-react';

interface TimeSlotPickerProps {
  value: string;
  onChange: (time: string) => void;
  professionalId: string;
  procedureId: string;
  date: string;
  excludeAppointmentId?: string;
  disabled?: boolean;
}

/**
 * O supabase-js tipa o join `patient:patients(...)` como lista (o repo não tem
 * os tipos gerados do banco), mas para relação muitos-para-um o PostgREST
 * devolve um objeto. Aceita os dois em vez de mentir com um cast.
 */
function patientNameOf(patient: unknown): string {
  const row = Array.isArray(patient) ? patient[0] : patient;
  return (row as { full_name?: string } | null | undefined)?.full_name ?? '';
}

/**
 * Horários vêm do motor (get_available_slots): expediente, exceções, duração do
 * procedimento e agendamentos já considerados. A consulta de agendamentos aqui
 * serve só para mostrar QUEM ocupa cada horário.
 */
export default function TimeSlotPicker({
  value,
  onChange,
  professionalId,
  procedureId,
  date,
  excludeAppointmentId,
  disabled,
}: TimeSlotPickerProps) {
  const [free, setFree] = useState<string[]>([]);
  const [occupied, setOccupied] = useState<OccupiedInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!professionalId || !procedureId || !date) return;

    // Troca rápida de data/procedimento: a resposta antiga não pode pintar a grade nova.
    let stale = false;

    async function load() {
      setLoading(true);
      setError(null);

      let occupiedQuery = supabase
        .from('appointments')
        .select('id, appointment_time, patient:patients(full_name)')
        .eq('professional_id', professionalId)
        .eq('appointment_date', date)
        .neq('status', 'cancelled')
        .order('appointment_time');
      if (excludeAppointmentId) occupiedQuery = occupiedQuery.neq('id', excludeAppointmentId);

      const [slotsRes, occupiedRes] = await Promise.all([
        supabase.rpc('get_available_slots', {
          p_professional_id: professionalId,
          p_procedure_id: procedureId,
          p_start_date: date,
          p_days: 1,
          p_exclude_appointment_id: excludeAppointmentId ?? null,
        }),
        occupiedQuery,
      ]);
      if (stale) return;

      // Falhar em silêncio aqui mostraria grade vazia — que parece "sem horário".
      if (slotsRes.error || occupiedRes.error) {
        setError('Não foi possível carregar os horários. Tente novamente.');
        setFree([]);
        setOccupied([]);
      } else {
        setFree(
          ((slotsRes.data ?? []) as { slot_date: string; slot_time: string }[])
            .filter((s) => s.slot_date === date)
            .map((s) => s.slot_time.slice(0, 5)),
        );
        setOccupied(
          (occupiedRes.data ?? []).map((apt) => ({
            time: apt.appointment_time.slice(0, 5),
            patientName: patientNameOf(apt.patient),
          })),
        );
      }
      setLoading(false);
    }

    load();
    return () => {
      stale = true;
    };
  }, [professionalId, procedureId, date, excludeAppointmentId]);

  const periods = useMemo(() => buildTimeGrid(free, occupied), [free, occupied]);
  const valueVisible = periods.some((p) => p.cells.some((c) => c.time === value));

  function togglePeriod(name: string, currentlyOpen: boolean) {
    setOpenOverride((prev) => ({ ...prev, [name]: !currentlyOpen }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-text-muted">Carregando horários...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="bg-champagne-nuvem border border-accent/15 text-text-muted px-4 py-3 rounded-xl text-sm">
        Nenhum horário disponível neste dia para este procedimento.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {value && !valueVisible && (
        <p className="text-xs text-text-muted">
          Horário atual: <strong>{value}</strong> (fora do expediente ou sem espaço para este procedimento)
        </p>
      )}
      {periods.map((period) => {
        const isOpen = openOverride[period.name] ?? period.hasFree;

        return (
          <div key={period.name} className="border border-accent/10 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => togglePeriod(period.name, isOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-champagne-nuvem hover:bg-champagne-nuvem/80 transition-colors"
            >
              <span className="text-sm font-semibold text-text">{period.name}</span>
              <div className="flex items-center gap-2">
                {period.occupiedCount > 0 && (
                  <span className="text-[10px] text-text-muted">
                    {period.occupiedCount} ocupado{period.occupiedCount > 1 ? 's' : ''}
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>
            {isOpen && (
              <div className="grid grid-cols-4 gap-2 p-3">
                {period.cells.map((cell) => {
                  if (cell.kind === 'occupied') {
                    return (
                      <div
                        key={cell.time}
                        className="p-2 rounded-lg border border-gray-200 bg-gray-100 text-center cursor-not-allowed opacity-60"
                      >
                        <p className="text-sm font-medium text-gray-400 line-through">{cell.time}</p>
                        <p className="text-[10px] text-gray-400 truncate">{cell.patientName}</p>
                      </div>
                    );
                  }

                  const isSelected = value === cell.time;
                  return (
                    <button
                      key={cell.time}
                      type="button"
                      onClick={() => onChange(cell.time)}
                      disabled={disabled}
                      className={`p-2 rounded-lg border-2 transition-all text-center ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-accent/10 bg-champagne-nuvem hover:border-accent/40'
                      }`}
                    >
                      <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-text'}`}>{cell.time}</p>
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
