export interface Appointment {
  id: string;
  patient_id: string;
  procedure_id: string;
  professional_id: string;
  appointment_date: string;
  appointment_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  cancellation_reason: string | null;
  downpayment_amount?: number;
  downpayment_method?: 'dinheiro' | 'credito' | 'debito' | 'pix' | null;
  downpayment_notes?: string | null;
  has_payment?: boolean;
  payment_status?: 'none' | 'partial' | 'paid' | 'reopened' | 'reversed' | 'credited' | 'legacy';
  payment_paid_at?: string | null;
  rescheduled_from_date?: string | null;
  rescheduled_from_time?: string | null;
  reschedule_count?: number;
  final_price?: number | null;
  patient?: { full_name: string; phone?: string };
  procedure?: { name: string; duration_minutes: number; default_price?: number; is_variable_price?: boolean; min_price?: number | null };
  professional?: { full_name: string };
}

export interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
  is_variable_price?: boolean;
  min_price?: number | null;
}

export interface Professional {
  id: string;
  full_name: string;
}

export type ViewMode = 'day' | 'week' | 'month';

export type ShowToastFn = (
  type: 'success' | 'error' | 'warning' | 'info',
  message: string,
  description?: string
) => void;
