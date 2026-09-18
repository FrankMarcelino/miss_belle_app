-- ============================================================================
-- MIGRATION: Corrigir conflito de agendamento + constraint UNIQUE
-- Data: 2026-03-03
-- Descrição: 
--   1. Dropar constraint UNIQUE que bloqueia reutilização de horário cancelado
--   2. Criar índice UNIQUE parcial (exclui cancelled)
--   3. Recriar check_appointment_conflict excluindo cancelled
-- ============================================================================

-- ============================================================================
-- ETAPA 1: Remover UNIQUE constraint que impede reagendamento em horário cancelado
-- ============================================================================
-- Tenta dropar todas as variantes possíveis do nome da constraint/index
-- Dropar a constraint UNIQUE (que automaticamente remove o index vinculado)
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_appointment_date_appointment_t_key;

-- ============================================================================
-- ETAPA 2: Criar UNIQUE parcial — apenas para agendamentos NÃO cancelados
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_active_slot
  ON appointments (professional_id, appointment_date, appointment_time)
  WHERE status != 'cancelled';

-- ============================================================================
-- ETAPA 3: Recriar RPC de conflito
-- ============================================================================
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_professional_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_procedure_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration integer;
  v_new_start integer;
  v_new_end integer;
  v_conflict boolean;
BEGIN
  SELECT duration_minutes INTO v_duration
  FROM procedures
  WHERE id = p_procedure_id;

  IF v_duration IS NULL THEN
    v_duration := 30;
  END IF;

  v_new_start := EXTRACT(HOUR FROM p_appointment_time) * 60
               + EXTRACT(MINUTE FROM p_appointment_time);
  v_new_end   := v_new_start + v_duration;

  SELECT EXISTS (
    SELECT 1
    FROM appointments a
    JOIN procedures p ON p.id = a.procedure_id
    WHERE a.professional_id = p_professional_id
      AND a.appointment_date = p_appointment_date
      AND a.status NOT IN ('cancelled')
      AND (p_appointment_id IS NULL OR a.id != p_appointment_id)
      AND (
        v_new_start < (EXTRACT(HOUR FROM a.appointment_time) * 60
                     + EXTRACT(MINUTE FROM a.appointment_time)
                     + COALESCE(p.duration_minutes, 30))
        AND
        v_new_end > (EXTRACT(HOUR FROM a.appointment_time) * 60
                   + EXTRACT(MINUTE FROM a.appointment_time))
      )
  ) INTO v_conflict;

  RETURN v_conflict;
END;
$$;
