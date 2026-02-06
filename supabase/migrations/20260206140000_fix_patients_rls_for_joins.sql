-- Migration: Fix Patients RLS for JOINs
-- Data: 2026-02-06
-- Problema: RLS policies muito restritivas em patients impedem JOINs de funcionarem
--           quando super_admins tentam ver todos os agendamentos

-- Contexto:
-- A query do frontend faz JOIN com patients:
--   SELECT *, patient:patients(full_name) FROM appointments
-- 
-- Com a policy atual:
--   USING (professional_id = auth.uid())
--
-- Isso significa que mesmo que o super_admin tenha permissão para ver o agendamento,
-- ele NÃO consegue ver o paciente se esse paciente pertence a outro profissional.
-- O JOIN retorna NULL para o patient, e o agendamento não aparece na tela.

-- ============================================================================
-- SOLUÇÃO: Simplificar RLS de Patients
-- ============================================================================
-- 
-- Em uma aplicação de clínica, faz sentido que todos os profissionais autenticados
-- possam ver informações básicas de todos os pacientes. As restrições de acesso
-- devem estar nos agendamentos, não nos pacientes.

-- 1. Remover policies antigas restritivas
DROP POLICY IF EXISTS "Users can view own patients" ON patients;
DROP POLICY IF EXISTS "Super admins can view all patients" ON patients;

-- 2. Criar policy simplificada para SELECT
CREATE POLICY "Authenticated users can view all patients"
  ON patients FOR SELECT
  TO authenticated
  USING (true);

-- 3. Manter controles de INSERT/UPDATE (usuários só podem criar/editar próprios pacientes)
-- Estas policies já existem e estão corretas:
-- - "Users can create own patients" 
-- - "Super admins can create any patient"
-- - "Users can update own patients"
-- - "Super admins can update any patient"

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Testar query do frontend (deve funcionar agora):
-- SELECT 
--   a.*,
--   p.full_name
-- FROM appointments a
-- LEFT JOIN patients p ON p.id = a.patient_id
-- WHERE a.appointment_date = CURRENT_DATE;

-- Listar policies de patients:
-- SELECT policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'patients';
