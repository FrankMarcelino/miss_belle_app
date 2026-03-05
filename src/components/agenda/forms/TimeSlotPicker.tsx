import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { Loader2, ChevronDown } from 'lucide-react';

interface OccupiedSlot {
  patientName: string;
}

interface TimeSlotPickerProps {
  value: string;
  onChange: (time: string) => void;
  professionalId: string;
  date: string;
  excludeAppointmentId?: string;
  disabled?: boolean;
}

export default function TimeSlotPicker({
  value,
  onChange,
  professionalId,
  date,
  excludeAppointmentId,
  disabled,
}: TimeSlotPickerProps) {
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
        .neq('status', 'cancelled')
        .order('appointment_time');

      if (excludeAppointmentId) {
        query = query.neq('id', excludeAppointmentId);
      }

      const { data: aptsData, error } = await query;
      if (error) throw error;

      const occupied: Record<string, OccupiedSlot> = {};
      for (const apt of aptsData || []) {
        const patient = apt.patient as { full_name: string } | null;
        const procedure = apt.procedure as { duration_minutes: number } | null;
        const startTime = apt.appointment_time.substring(0, 5);
        const duration = procedure?.duration_minutes || 30;
        const patientName = patient?.full_name || '';

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
    } catch {
      // silently fail
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

  const defaultOpen = { Madrugada: false, Manhã: true, Tarde: true, Noite: false };
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
                  <span className="text-[10px] text-text-muted">
                    {occupiedCount} ocupado{occupiedCount > 1 ? 's' : ''}
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
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
