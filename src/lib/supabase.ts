import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'super_admin' | 'user';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role: 'super_admin' | 'user';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: 'super_admin' | 'user';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      procedures: {
        Row: {
          id: string;
          name: string;
          duration_minutes: number;
          default_price: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          duration_minutes: number;
          default_price: number;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          duration_minutes?: number;
          default_price?: number;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      patients: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          notes: string | null;
          professional_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          email?: string | null;
          notes?: string | null;
          professional_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          email?: string | null;
          notes?: string | null;
          professional_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          patient_id: string;
          procedure_id: string;
          professional_id: string;
          appointment_date: string;
          appointment_time: string;
          status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
          cancellation_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          procedure_id: string;
          professional_id: string;
          appointment_date: string;
          appointment_time: string;
          status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
          cancellation_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          procedure_id?: string;
          professional_id?: string;
          appointment_date?: string;
          appointment_time?: string;
          status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
          cancellation_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cash_register_closings: {
        Row: {
          id: string;
          professional_id: string;
          closing_date: string;
          total_amount: number;
          notes: string | null;
          is_finalized: boolean;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          closing_date: string;
          total_amount?: number;
          notes?: string | null;
          is_finalized?: boolean;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          closing_date?: string;
          total_amount?: number;
          notes?: string | null;
          is_finalized?: boolean;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cash_register_transactions: {
        Row: {
          id: string;
          closing_id: string;
          appointment_id: string | null;
          amount: number;
          payment_method: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          closing_id: string;
          appointment_id?: string | null;
          amount: number;
          payment_method: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          closing_id?: string;
          appointment_id?: string | null;
          amount?: number;
          payment_method?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
    };
  };
};
