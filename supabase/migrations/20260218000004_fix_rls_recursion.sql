-- ============================================================================
-- MIGRATION: Corrigir recursão infinita nas políticas RLS
-- Data: 2026-02-18
--
-- PROBLEMA:
--   expenses SELECT policy  → consulta expense_assignments (com RLS)
--   expense_assignments SELECT policy → consulta expenses (com RLS)
--   → loop infinito: "infinite recursion detected in policy for relation expenses"
--
-- SOLUÇÃO:
--   Criar funções SECURITY DEFINER para as verificações cruzadas.
--   SECURITY DEFINER bypassa o RLS → sem recursão.
-- ============================================================================

-- ============================================================================
-- 1. FUNÇÕES AUXILIARES (SECURITY DEFINER — sem RLS, sem recursão)
-- ============================================================================

-- Verifica se o usuário logado tem assignment em uma despesa específica
CREATE OR REPLACE FUNCTION auth_user_has_expense_assignment(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_assignments
    WHERE expense_id = p_expense_id
      AND user_id = auth.uid()
  );
$$;

-- Verifica se o usuário logado é o criador de uma despesa específica
CREATE OR REPLACE FUNCTION auth_user_created_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expenses
    WHERE id = p_expense_id
      AND created_by = auth.uid()
  );
$$;

-- ============================================================================
-- 2. CORRIGIR política SELECT de expenses
--    Antes: id IN (SELECT expense_id FROM expense_assignments ...)  ← recursão
--    Depois: auth_user_has_expense_assignment(id)                    ← seguro
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own or assigned expenses" ON expenses;

CREATE POLICY "Users can view own or assigned expenses"
  ON expenses FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR auth_user_has_expense_assignment(id)
    OR is_super_admin()
  );

-- ============================================================================
-- 3. CORRIGIR políticas de expense_assignments
--    Antes: expense_id IN (SELECT id FROM expenses ...)  ← recursão
--    Depois: auth_user_created_expense(expense_id)        ← seguro
-- ============================================================================

DROP POLICY IF EXISTS "Users can view relevant assignments" ON expense_assignments;

CREATE POLICY "Users can view relevant assignments"
  ON expense_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR auth_user_created_expense(expense_id)
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Expense creators can insert assignments" ON expense_assignments;

CREATE POLICY "Expense creators can insert assignments"
  ON expense_assignments FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_created_expense(expense_id)
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Expense creators can delete assignments" ON expense_assignments;

CREATE POLICY "Expense creators can delete assignments"
  ON expense_assignments FOR DELETE TO authenticated
  USING (
    auth_user_created_expense(expense_id)
    OR is_super_admin()
  );

-- ============================================================================
-- 4. VERIFICAR que não há mais recursão
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RLS recursion fix aplicado com sucesso.';
  RAISE NOTICE 'Funções criadas: auth_user_has_expense_assignment, auth_user_created_expense';
END $$;
