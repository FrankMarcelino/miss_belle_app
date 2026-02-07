-- ============================================================================
-- MIGRATION: Adicionar RLS DELETE policies para deleção em cascata
-- Data: 2026-02-06
-- Descrição: Permitir super admins deletarem dados de outros usuários
-- ============================================================================

/*
  PROBLEMA:
  Super admins não conseguem deletar pacientes/dados de outros profissionais
  porque não existem policies de DELETE apropriadas.
  
  SOLUÇÃO:
  Adicionar policies de DELETE que permitem:
  - Users deletarem seus próprios dados
  - Super admins deletarem qualquer dado
*/

-- ============================================================================
-- PATIENTS: Adicionar policies de DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own patients" ON patients;
DROP POLICY IF EXISTS "Super admins can delete any patient" ON patients;

-- Policy: Users podem deletar seus próprios pacientes
CREATE POLICY "Users can delete own patients"
  ON patients FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Policy: Super admins podem deletar qualquer paciente
CREATE POLICY "Super admins can delete any patient"
  ON patients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- ============================================================================
-- APPOINTMENTS: Verificar/adicionar policies de DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own appointments" ON appointments;
DROP POLICY IF EXISTS "Super admins can delete any appointment" ON appointments;

-- Policy: Users podem deletar seus próprios agendamentos
CREATE POLICY "Users can delete own appointments"
  ON appointments FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Policy: Super admins podem deletar qualquer agendamento
CREATE POLICY "Super admins can delete any appointment"
  ON appointments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- ============================================================================
-- PROFESSIONAL_PROCEDURES: Adicionar policies de DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own procedure associations" ON professional_procedures;
DROP POLICY IF EXISTS "Super admins can delete any procedure association" ON professional_procedures;

-- Policy: Users podem deletar suas próprias associações
CREATE POLICY "Users can delete own procedure associations"
  ON professional_procedures FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Policy: Super admins podem deletar qualquer associação
CREATE POLICY "Super admins can delete any procedure association"
  ON professional_procedures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- ============================================================================
-- CASH_REGISTER_CLOSINGS: Adicionar policies de DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own closings" ON cash_register_closings;
DROP POLICY IF EXISTS "Super admins can delete any closing" ON cash_register_closings;

-- Policy: Users podem deletar seus próprios fechamentos
CREATE POLICY "Users can delete own closings"
  ON cash_register_closings FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Policy: Super admins podem deletar qualquer fechamento
CREATE POLICY "Super admins can delete any closing"
  ON cash_register_closings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- ============================================================================
-- CASH_REGISTER_TRANSACTIONS: Adicionar policies de DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own transactions" ON cash_register_transactions;
DROP POLICY IF EXISTS "Super admins can delete any transaction" ON cash_register_transactions;

-- Policy: Users podem deletar suas próprias transações
CREATE POLICY "Users can delete own transactions"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    closing_id IN (
      SELECT id FROM cash_register_closings
      WHERE professional_id = auth.uid()
    )
  );

-- Policy: Super admins podem deletar qualquer transação
CREATE POLICY "Super admins can delete any transaction"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- ============================================================================
-- VALIDAÇÕES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ DELETE policies criadas com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policies adicionadas:';
  RAISE NOTICE '• patients: 2 policies (user own + super admin all)';
  RAISE NOTICE '• appointments: 2 policies (user own + super admin all)';
  RAISE NOTICE '• professional_procedures: 2 policies (user own + super admin all)';
  RAISE NOTICE '• cash_register_closings: 2 policies (user own + super admin all)';
  RAISE NOTICE '• cash_register_transactions: 2 policies (user own + super admin all)';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Super admins agora podem deletar usuários em cascata!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
