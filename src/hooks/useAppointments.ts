import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, ViewMode } from '../types/agenda';

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

interface UseAppointmentsOptions {
  currentDate: Date;
  viewMode: ViewMode;
  professionalId?: string;
  isSuperAdmin: boolean;
  userId: string | undefined;
}

export function useAppointments({
  currentDate,
  viewMode,
  professionalId,
  isSuperAdmin,
  userId,
}: UseAppointmentsOptions) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAppointments = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('appointments')
        .select(`
          *,
          patient:patients(full_name, phone),
          procedure:procedures(name, duration_minutes, default_price, is_variable_price, min_price),
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

      if (!isSuperAdmin && userId) {
        query = query.eq('professional_id', userId);
      } else if (professionalId) {
        query = query.eq('professional_id', professionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAppointments(data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode, professionalId, isSuperAdmin, userId]);

  return { appointments, loading, loadAppointments };
}

export { getStartOfWeek, getEndOfWeek };
