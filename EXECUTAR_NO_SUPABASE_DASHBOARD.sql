-- ============================================================================
-- SCRIPT CONSOLIDADO PARA EXECUTAR NO SUPABASE DASHBOARD
-- ============================================================================
--
-- INSTRUÇÕES:
-- 1. Acesse: https://supabase.com/dashboard/project/otzaauwiziyoxlvttgsb/sql/new
-- 2. Cole TODO este script no editor SQL
-- 3. Clique em "RUN" (ou pressione Ctrl+Enter)
-- 4. Aguarde a mensagem de sucesso
--
-- ============================================================================

-- ============================================================================
-- ETAPA 1: CRIAR FUNÇÃO HELPER (is_super_admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com permissões do dono (bypass RLS)
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  user_active BOOLEAN;
BEGIN
  -- Buscar role e is_active do usuário atual
  SELECT role, is_active
  INTO user_role, user_active
  FROM profiles
  WHERE id = auth.uid();
  
  -- Retornar true se for super_admin ativo
  RETURN user_role = 'super_admin' AND user_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================================================
-- ETAPA 2: LIMPAR TODAS AS POLICIES DE TODAS AS TABELAS
-- ============================================================================

-- PROFILES
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', policy_record.policyname);
  END LOOP;
END $$;

-- PATIENTS
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON patients', policy_record.policyname);
  END LOOP;
END $$;

-- APPOINTMENTS
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appointments', policy_record.policyname);
  END LOOP;
END $$;

-- PROFESSIONAL_PROCEDURES
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'professional_procedures'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON professional_procedures', policy_record.policyname);
  END LOOP;
END $$;

-- CASH_REGISTER_CLOSINGS
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cash_register_closings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cash_register_closings', policy_record.policyname);
  END LOOP;
END $$;

-- CASH_REGISTER_TRANSACTIONS
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cash_register_transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cash_register_transactions', policy_record.policyname);
  END LOOP;
END $$;

-- ============================================================================
-- ETAPA 3: CRIAR POLICIES PARA PROFILES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- INSERT
CREATE POLICY "Super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can create own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE
CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- DELETE
CREATE POLICY "Only super admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    id != auth.uid()
    AND is_super_admin()
  );

-- ============================================================================
-- ETAPA 4: CRIAR POLICIES PARA PATIENTS
-- ============================================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all patients"
  ON patients FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own patients"
  ON patients FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can insert patients"
  ON patients FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own patients"
  ON patients FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any patient"
  ON patients FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own patients"
  ON patients FOR UPDATE TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can delete any patient"
  ON patients FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own patients"
  ON patients FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- ETAPA 5: CRIAR POLICIES PARA APPOINTMENTS
-- ============================================================================

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all appointments"
  ON appointments FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own appointments"
  ON appointments FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can insert appointments"
  ON appointments FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own appointments"
  ON appointments FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any appointment"
  ON appointments FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own appointments"
  ON appointments FOR UPDATE TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can delete any appointment"
  ON appointments FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own appointments"
  ON appointments FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- ETAPA 6: CRIAR POLICIES PARA PROFESSIONAL_PROCEDURES
-- ============================================================================

ALTER TABLE professional_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all prof procedures"
  ON professional_procedures FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own prof procedures"
  ON professional_procedures FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can insert prof procedures"
  ON professional_procedures FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own prof procedures"
  ON professional_procedures FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any prof procedure"
  ON professional_procedures FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own prof procedures"
  ON professional_procedures FOR UPDATE TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can delete any prof procedure"
  ON professional_procedures FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own prof procedures"
  ON professional_procedures FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- ETAPA 7: CRIAR POLICIES PARA CASH_REGISTER_CLOSINGS
-- ============================================================================

ALTER TABLE cash_register_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all closings"
  ON cash_register_closings FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own closings"
  ON cash_register_closings FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can insert closings"
  ON cash_register_closings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own closings"
  ON cash_register_closings FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any closing"
  ON cash_register_closings FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own closings"
  ON cash_register_closings FOR UPDATE TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can delete any closing"
  ON cash_register_closings FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own closings"
  ON cash_register_closings FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- ETAPA 8: CRIAR POLICIES PARA CASH_REGISTER_TRANSACTIONS
-- ============================================================================

ALTER TABLE cash_register_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all transactions"
  ON cash_register_transactions FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own transactions"
  ON cash_register_transactions FOR SELECT TO authenticated
  USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE professional_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can insert transactions"
  ON cash_register_transactions FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own transactions"
  ON cash_register_transactions FOR INSERT TO authenticated
  WITH CHECK (
    appointment_id IN (
      SELECT id FROM appointments WHERE professional_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can update any transaction"
  ON cash_register_transactions FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own transactions"
  ON cash_register_transactions FOR UPDATE TO authenticated
  USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE professional_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can delete any transaction"
  ON cash_register_transactions FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own transactions"
  ON cash_register_transactions FOR DELETE TO authenticated
  USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE professional_id = auth.uid()
    )
  );

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================

DO $$
DECLARE
  profiles_count INT;
  patients_count INT;
  appointments_count INT;
  prof_proc_count INT;
  closings_count INT;
  transactions_count INT;
BEGIN
  SELECT COUNT(*) INTO profiles_count FROM pg_policies WHERE tablename = 'profiles';
  SELECT COUNT(*) INTO patients_count FROM pg_policies WHERE tablename = 'patients';
  SELECT COUNT(*) INTO appointments_count FROM pg_policies WHERE tablename = 'appointments';
  SELECT COUNT(*) INTO prof_proc_count FROM pg_policies WHERE tablename = 'professional_procedures';
  SELECT COUNT(*) INTO closings_count FROM pg_policies WHERE tablename = 'cash_register_closings';
  SELECT COUNT(*) INTO transactions_count FROM pg_policies WHERE tablename = 'cash_register_transactions';

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ RLS POLICIES CONFIGURADAS COM SUCESSO!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Policies criadas:';
  RAISE NOTICE '   - profiles: % policies', profiles_count;
  RAISE NOTICE '   - patients: % policies', patients_count;
  RAISE NOTICE '   - appointments: % policies', appointments_count;
  RAISE NOTICE '   - professional_procedures: % policies', prof_proc_count;
  RAISE NOTICE '   - cash_register_closings: % policies', closings_count;
  RAISE NOTICE '   - cash_register_transactions: % policies', transactions_count;
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Row Level Security ATIVO em todas as tabelas';
  RAISE NOTICE '🔑 Função is_super_admin() disponível';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Deploy completo! Sistema pronto para uso.';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
