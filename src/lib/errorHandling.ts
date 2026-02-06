/**
 * Error handling utilities for the Miss Belle application
 * Provides user-friendly error messages for common Supabase/Postgres errors
 */

export interface AppError {
  title: string;
  description?: string;
  type: 'error' | 'warning';
}

/**
 * Parse Supabase/Postgres error and return user-friendly message
 */
export function parseSupabaseError(error: unknown): AppError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      title: 'Erro de conexão',
      description: 'Verifique sua internet e tente novamente.',
      type: 'error',
    };
  }

  // Supabase error object
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const supabaseError = error as { code?: string; message?: string; details?: string };

    // Foreign key violation (referencing non-existent record)
    if (supabaseError.code === '23503') {
      if (supabaseError.message?.includes('patient_id')) {
        return {
          title: 'Paciente não encontrado',
          description: 'Selecione um paciente válido da lista.',
          type: 'error',
        };
      }
      if (supabaseError.message?.includes('procedure_id')) {
        return {
          title: 'Procedimento não encontrado',
          description: 'Selecione um procedimento válido.',
          type: 'error',
        };
      }
      if (supabaseError.message?.includes('professional_id')) {
        return {
          title: 'Profissional não encontrado',
          description: 'Selecione um profissional válido.',
          type: 'error',
        };
      }
      return {
        title: 'Dados inválidos',
        description: 'Um dos campos possui referência inválida.',
        type: 'error',
      };
    }

    // Unique constraint violation
    if (supabaseError.code === '23505') {
      return {
        title: 'Registro duplicado',
        description: 'Já existe um registro com esses dados.',
        type: 'error',
      };
    }

    // Check constraint violation (e.g., invalid status)
    if (supabaseError.code === '23514') {
      if (supabaseError.message?.includes('status')) {
        return {
          title: 'Status inválido',
          description: 'O status selecionado não é permitido.',
          type: 'error',
        };
      }
      return {
        title: 'Dados inválidos',
        description: 'Um dos campos contém valor não permitido.',
        type: 'error',
      };
    }

    // Not null violation
    if (supabaseError.code === '23502') {
      return {
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos obrigatórios.',
        type: 'error',
      };
    }

    // RLS policy violation (permission denied)
    if (supabaseError.code === '42501' || supabaseError.message?.includes('policy')) {
      return {
        title: 'Permissão negada',
        description: 'Você não tem permissão para realizar esta ação.',
        type: 'error',
      };
    }

    // Timeout
    if (supabaseError.code === '57014') {
      return {
        title: 'Operação demorou muito',
        description: 'Tente novamente em alguns instantes.',
        type: 'error',
      };
    }

    // Generic Supabase error with message
    if (supabaseError.message) {
      return {
        title: 'Erro ao salvar',
        description: supabaseError.message,
        type: 'error',
      };
    }
  }

  // JavaScript Error object
  if (error instanceof Error) {
    return {
      title: 'Erro inesperado',
      description: error.message,
      type: 'error',
    };
  }

  // Unknown error
  return {
    title: 'Erro desconhecido',
    description: 'Ocorreu um erro inesperado. Tente novamente.',
    type: 'error',
  };
}

/**
 * Validate appointment data before submitting
 */
export interface AppointmentValidation {
  isValid: boolean;
  errors: AppError[];
}

export function validateAppointmentData(data: {
  patientId: string | null;
  procedureId: string | null;
  professionalId: string | null;
  appointmentDate: string;
  appointmentTime: string;
}): AppointmentValidation {
  const errors: AppError[] = [];

  // Required fields
  if (!data.patientId) {
    errors.push({
      title: 'Paciente obrigatório',
      description: 'Selecione ou cadastre um paciente.',
      type: 'warning',
    });
  }

  if (!data.procedureId) {
    errors.push({
      title: 'Procedimento obrigatório',
      description: 'Selecione o procedimento a ser realizado.',
      type: 'warning',
    });
  }

  if (!data.professionalId) {
    errors.push({
      title: 'Profissional obrigatório',
      description: 'Selecione o profissional responsável.',
      type: 'warning',
    });
  }

  if (!data.appointmentDate) {
    errors.push({
      title: 'Data obrigatória',
      description: 'Informe a data do agendamento.',
      type: 'warning',
    });
  }

  if (!data.appointmentTime) {
    errors.push({
      title: 'Horário obrigatório',
      description: 'Informe o horário do agendamento.',
      type: 'warning',
    });
  }

  // Date/time logic validation
  if (data.appointmentDate && data.appointmentTime) {
    const appointmentDateTime = new Date(`${data.appointmentDate}T${data.appointmentTime}`);
    const now = new Date();

    // Check if date is in the past (with 5 minute tolerance)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    if (appointmentDateTime < fiveMinutesAgo) {
      errors.push({
        title: 'Data/hora no passado',
        description: 'O agendamento não pode ser feito para uma data/hora anterior.',
        type: 'warning',
      });
    }

    // Check if date is too far in the future (1 year)
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    if (appointmentDateTime > oneYearFromNow) {
      errors.push({
        title: 'Data muito distante',
        description: 'Agendamentos só podem ser feitos para até 1 ano à frente.',
        type: 'warning',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
