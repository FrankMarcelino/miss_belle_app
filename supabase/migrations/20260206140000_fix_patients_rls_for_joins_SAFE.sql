-- Migration: Fix Patients RLS for JOINs (SAFE VERSION)
-- Data: 2026-02-06
-- Esta versão pode ser executada múltiplas vezes sem erro

-- ============================================================================
-- SOLUÇÃO: Simplificar RLS de Patients
-- ============================================================================

-- Remover policies antigas restritivas
DROP POLICY IF EXISTS "Users can view own patients" ON patients;
DROP POLICY IF EXISTS "Super admins can view all patients" ON patients;
DROP POLICY IF EXISTS "Authenticated users can view all patients" ON patients;

-- Criar policy simplificada para SELECT
-- Em uma aplicação de clínica, faz sentido que todos os profissionais autenticados
-- possam ver informações básicas de todos os pacientes
CREATE POLICY "Authenticated users can view all patients"
  ON patients FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Comentários
-- ============================================================================

COMMENT ON POLICY "Authenticated users can view all patients" ON patients IS 
  'Permite que todos os usuários autenticados vejam todos os pacientes. Necessário para JOINs em agendamentos.';

-- ============================================================================
-- Mensagens de sucesso
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration executada com sucesso!';
  RAISE NOTICE '- RLS de patients simplificado';
  RAISE NOTICE '- JOINs agora funcionam corretamente';
END $$;
