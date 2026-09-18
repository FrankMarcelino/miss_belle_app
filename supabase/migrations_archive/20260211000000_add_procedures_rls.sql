-- ============================================================================
-- MIGRATION: RLS para tabela PROCEDURES
-- Data: 2026-02-11
-- Descrição: Habilitar RLS na tabela procedures para permitir que profissionais
--            gerenciem seus próprios serviços
-- ============================================================================

-- Limpar policies existentes (idempotente)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'procedures'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON procedures', policy_record.policyname);
  END LOOP;
END $$;

-- Habilitar RLS
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT: super_admin vê tudo; user vê created_by = auth.uid() + associados
-- ============================================================================

CREATE POLICY "Super admins can view all procedures"
  ON procedures FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own and associated procedures"
  ON procedures FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT procedure_id FROM professional_procedures
      WHERE professional_id = auth.uid()
    )
  );

-- ============================================================================
-- INSERT: super_admin qualquer; user com created_by = auth.uid()
-- ============================================================================

CREATE POLICY "Super admins can insert procedures"
  ON procedures FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own procedures"
  ON procedures FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- ============================================================================
-- UPDATE: super_admin qualquer; user onde created_by OU associado
-- ============================================================================

CREATE POLICY "Super admins can update any procedure"
  ON procedures FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own or associated procedures"
  ON procedures FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT procedure_id FROM professional_procedures
      WHERE professional_id = auth.uid()
    )
  );

-- ============================================================================
-- DELETE: super_admin qualquer; user onde created_by = auth.uid()
-- ============================================================================

CREATE POLICY "Super admins can delete any procedure"
  ON procedures FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own procedures"
  ON procedures FOR DELETE TO authenticated
  USING (created_by = auth.uid());
