-- ============================================================================
-- MIGRATION: Reescrever todas as RLS policies com isolamento de tenant
-- Data: 2026-02-21
-- Padrão aplicado em todas as tabelas:
--   Super admin:    tenant_id = auth_tenant_id()          (vê tudo do tenant)
--   Usuário comum:  tenant_id = auth_tenant_id() + restrição própria
--   Entre tenants:  NUNCA há acesso cruzado
-- ============================================================================

-- ── Função utilitária: dropar todas as policies de uma tabela ────────────────

CREATE OR REPLACE FUNCTION _drop_all_policies(p_table text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = p_table AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, p_table);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. profiles
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('profiles');

-- Qualquer usuário vê todos os perfis do mesmo tenant
-- (necessário para mostrar nomes em despesas, agenda, etc.)
CREATE POLICY "View profiles in same tenant" ON profiles
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

-- Usuário cria apenas o próprio perfil (no primeiro login)
CREATE POLICY "User creates own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Usuário atualiza o próprio perfil mas não pode mudar o próprio role
CREATE POLICY "User updates own profile" ON profiles
  FOR UPDATE TO authenticated
  USING  (id = auth.uid() AND tenant_id = auth_tenant_id())
  WITH CHECK (
    id = auth.uid()
    AND role = auth_user_role()   -- não pode escalar o próprio role
  );

-- Super admin gerencia qualquer perfil do mesmo tenant
CREATE POLICY "Super admin manages profiles" ON profiles
  FOR ALL TO authenticated
  USING  (is_super_admin() AND tenant_id = auth_tenant_id())
  WITH CHECK (is_super_admin() AND tenant_id = auth_tenant_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 2. patients
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('patients');

-- Pacientes são da clínica (tenant): todos os usuários autenticados do tenant podem gerenciar
CREATE POLICY "Tenant users manage patients" ON patients
  FOR ALL TO authenticated
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. procedures
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('procedures');

-- Todos os usuários do tenant podem ver os procedimentos (para selecionar nos agendamentos)
CREATE POLICY "View procedures in tenant" ON procedures
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY "User manages own procedures" ON procedures
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND created_by = auth.uid());

CREATE POLICY "User updates own procedures" ON procedures
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()));

CREATE POLICY "User deletes own procedures" ON procedures
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. professional_procedures
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('professional_procedures');

-- Todos podem ver (necessário para mostrar procedimentos dos profissionais)
CREATE POLICY "View professional_procedures in tenant" ON professional_procedures
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY "User manages own professional_procedures" ON professional_procedures
  FOR ALL TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. appointments
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('appointments');

-- Usuário vê/gerencia apenas seus próprios agendamentos
-- Super admin vê todos do tenant
CREATE POLICY "User views own appointments" ON appointments
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "User inserts own appointments" ON appointments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "User updates own appointments" ON appointments
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "User deletes own appointments" ON appointments
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

-- ════════════════════════════════════════════════════════════════════════════
-- 6. cash_register_closings
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('cash_register_closings');

-- Usuário: vê/abre/fecha apenas o próprio caixa
-- Super admin: vê e gerencia todos os caixas do tenant
CREATE POLICY "User views own cash register" ON cash_register_closings
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "User opens own cash register" ON cash_register_closings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND professional_id = auth.uid());

CREATE POLICY "User or admin updates cash register" ON cash_register_closings
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "Admin deletes cash register" ON cash_register_closings
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. cash_register_transactions
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('cash_register_transactions');

-- professional_id adicionado na migration 003 — simplifica RLS enormemente
CREATE POLICY "User views own transactions" ON cash_register_transactions
  FOR SELECT TO authenticated
  USING (
    tenant_id = auth_tenant_id()
    AND (professional_id = auth.uid() OR is_super_admin())
  );

CREATE POLICY "User inserts own transactions" ON cash_register_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = auth_tenant_id()
    AND (professional_id = auth.uid() OR is_super_admin())
  );

CREATE POLICY "User updates own transactions" ON cash_register_transactions
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin()));

CREATE POLICY "Admin deletes transactions" ON cash_register_transactions
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 8. expenses
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('expenses');

-- Super admin: vê todas as despesas do tenant
-- Usuário: vê as que criou OU as que está atribuído
CREATE POLICY "View expenses in tenant" ON expenses
  FOR SELECT TO authenticated
  USING (
    tenant_id = auth_tenant_id()
    AND (
      is_super_admin()
      OR created_by = auth.uid()
      OR auth_user_has_expense_assignment(id)
    )
  );

CREATE POLICY "Authenticated user creates expense" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND created_by = auth.uid());

CREATE POLICY "Creator or admin updates expense" ON expenses
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()));

CREATE POLICY "Creator or admin deletes expense" ON expenses
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND (created_by = auth.uid() OR is_super_admin()));

-- ════════════════════════════════════════════════════════════════════════════
-- 9. expense_assignments
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('expense_assignments');

CREATE POLICY "View expense assignments in tenant" ON expense_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = auth_tenant_id()
    AND (
      is_super_admin()
      OR user_id = auth.uid()
      OR auth_user_created_expense(expense_id)
    )
  );

CREATE POLICY "Creator or admin inserts assignment" ON expense_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = auth_tenant_id()
    AND (auth_user_created_expense(expense_id) OR is_super_admin())
  );

CREATE POLICY "Creator or admin deletes assignment" ON expense_assignments
  FOR DELETE TO authenticated
  USING (
    tenant_id = auth_tenant_id()
    AND (auth_user_created_expense(expense_id) OR is_super_admin())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 10. expense_splits
-- ════════════════════════════════════════════════════════════════════════════

SELECT _drop_all_policies('expense_splits');

CREATE POLICY "View expense splits in tenant" ON expense_splits
  FOR SELECT TO authenticated
  USING (
    tenant_id = auth_tenant_id()
    AND (
      is_super_admin()
      OR user_id = auth.uid()
      OR auth_user_created_expense(expense_id)
    )
  );

-- Splits só são inseridos via funções SECURITY DEFINER
CREATE POLICY "Super admin inserts splits" ON expense_splits
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND is_super_admin());

CREATE POLICY "User updates own split" ON expense_splits
  FOR UPDATE TO authenticated
  USING  (tenant_id = auth_tenant_id() AND (user_id = auth.uid() OR is_super_admin()))
  WITH CHECK (tenant_id = auth_tenant_id() AND (user_id = auth.uid() OR is_super_admin()));

CREATE POLICY "Admin deletes splits" ON expense_splits
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id() AND is_super_admin());

-- ── Limpeza ──────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS _drop_all_policies(text);

-- ── Verificação ──────────────────────────────────────────────────────────────

DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies WHERE schemaname = 'public';

  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 004: Todas as RLS policies atualizadas com tenant_id';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Total de policies ativas: %', v_count;
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Modelo de acesso:';
  RAISE NOTICE '   super_admin → vê/gerencia tudo dentro do próprio tenant';
  RAISE NOTICE '   usuário     → vê apenas seus dados dentro do tenant';
  RAISE NOTICE '   cross-tenant → bloqueado em todas as tabelas';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
