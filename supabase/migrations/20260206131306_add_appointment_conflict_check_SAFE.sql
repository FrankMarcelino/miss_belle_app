-- Migration: Add Appointment Conflict Check (SAFE VERSION)
-- Data: 2026-02-06
-- Esta versão pode ser executada múltiplas vezes sem erro

-- ============================================================================
-- Remover função antiga se existir
-- ============================================================================

DROP FUNCTION IF EXISTS check_appointment_conflict(uuid, date, time, uuid, uuid) CASCADE;

-- ============================================================================
-- Criar função RPC para verificar conflitos de agendamento
-- ============================================================================

CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_professional_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_procedure_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  new_start_time time;
  new_end_time time;
  new_duration integer;
  conflict_count integer;
BEGIN
  -- Obter duração do procedimento
  SELECT duration_minutes INTO new_duration
  FROM procedures
  WHERE id = p_procedure_id;
  
  IF new_duration IS NULL THEN
    RAISE EXCEPTION 'Procedure not found';
  END IF;
  
  -- Calcular horários de início e fim
  new_start_time := p_appointment_time;
  new_end_time := p_appointment_time + (new_duration || ' minutes')::interval;
  
  -- Verificar conflitos com outros agendamentos do mesmo profissional na mesma data
  SELECT COUNT(*) INTO conflict_count
  FROM appointments a
  JOIN procedures proc ON a.procedure_id = proc.id
  WHERE a.professional_id = p_professional_id
    AND a.appointment_date = p_appointment_date
    AND a.status != 'cancelled'
    AND (p_appointment_id IS NULL OR a.id != p_appointment_id)
    AND (
      -- Novo agendamento começa durante um existente
      (new_start_time >= a.appointment_time 
       AND new_start_time < a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
      OR
      -- Novo agendamento termina durante um existente
      (new_end_time > a.appointment_time 
       AND new_end_time <= a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
      OR
      -- Novo agendamento engloba completamente um existente
      (new_start_time <= a.appointment_time 
       AND new_end_time >= a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
    );
  
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute para usuários autenticados
GRANT EXECUTE ON FUNCTION check_appointment_conflict(uuid, date, time, uuid, uuid) TO authenticated;

-- ============================================================================
-- Comentários
-- ============================================================================

COMMENT ON FUNCTION check_appointment_conflict(uuid, date, time, uuid, uuid) IS 
  'Verifica se há conflito de horário para um agendamento. Retorna true se houver conflito.';

-- ============================================================================
-- Mensagens de sucesso
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration executada com sucesso!';
  RAISE NOTICE '- Função check_appointment_conflict criada/atualizada';
  RAISE NOTICE '- Permissions concedidas';
END $$;
