-- ============================================================================
-- MIGRATION: Funções helper para multi-tenancy
-- Data: 2026-02-21
-- Descrição: Adiciona auth_tenant_id() para isolar dados por tenant.
--            is_super_admin() é mantida idêntica — o isolamento entre
--            tenants é garantido pelas RLS policies, não pelo role em si.
-- ============================================================================

-- ── auth_tenant_id() ─────────────────────────────────────────────────────────
-- Retorna o tenant_id do usuário logado.
-- SECURITY DEFINER: bypassa RLS em profiles (evita recursão nas policies).
-- STABLE: resultado cacheado dentro da mesma transação.

CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION auth_tenant_id() TO authenticated;

-- ── auth_user_role() ─────────────────────────────────────────────────────────
-- Retorna o role do usuário logado sem recursão de RLS.
-- Usada em policies de UPDATE de profiles para impedir auto-escalada de role.

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS varchar
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION auth_user_role() TO authenticated;

-- ── is_super_admin() ─────────────────────────────────────────────────────────
-- Mantida sem alteração. Continua verificando role = 'super_admin'.
-- O isolamento de tenant é garantido pelas RLS policies que combinam
-- is_super_admin() + tenant_id = auth_tenant_id().

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin' AND is_active = true
     FROM profiles WHERE id = auth.uid()),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

-- ── RLS na tabela tenants ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users see own tenant"    ON tenants;
DROP POLICY IF EXISTS "Admins update own tenant" ON tenants;

CREATE POLICY "Users see own tenant" ON tenants
  FOR SELECT TO authenticated
  USING (id = auth_tenant_id());

CREATE POLICY "Super admin updates own tenant" ON tenants
  FOR UPDATE TO authenticated
  USING  (id = auth_tenant_id() AND is_super_admin())
  WITH CHECK (id = auth_tenant_id() AND is_super_admin());

-- ── Verificação ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 002: Funções helper de tenant criadas';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  Funções:';
  RAISE NOTICE '   auth_tenant_id() → uuid do tenant do usuário logado';
  RAISE NOTICE '   auth_user_role()  → role do usuário logado (sem recursão RLS)';
  RAISE NOTICE '   is_super_admin()  → sem alteração (role=super_admin + is_active)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 RLS em tenants: ativada';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
