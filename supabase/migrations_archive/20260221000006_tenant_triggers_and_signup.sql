-- ============================================================================
-- MIGRATION: Trigger auto_set_tenant_id + função de registro de usuário
-- Data: 2026-02-21
-- Descrição:
--   1. Trigger BEFORE INSERT que preenche tenant_id automaticamente em todas
--      as tabelas — o frontend NÃO precisa enviar tenant_id nos INSERTs.
--   2. Trigger especial para cash_register_transactions que também preenche
--      professional_id a partir do appointment.
--   3. Função register_user_profile para criação segura de perfis
--      (lida com o problema de bootstrap: primeiro usuário cria o tenant).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Trigger genérico: auto_set_tenant_id
--    Preenche tenant_id = auth_tenant_id() quando omitido no INSERT.
--    RLS WITH CHECK ainda verifica a posteriori — não há brecha de segurança.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END $$;

-- Aplicar em todas as tabelas de negócio (exceto profiles e tenants)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients', 'procedures', 'professional_procedures',
    'appointments', 'cash_register_closings',
    'expenses', 'expense_assignments', 'expense_splits'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_auto_tenant_id ON %I;
      CREATE TRIGGER trg_auto_tenant_id
        BEFORE INSERT ON %I
        FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();
    ', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Trigger especial para cash_register_transactions
--    Além de tenant_id, preenche professional_id a partir do appointment.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_set_transaction_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- tenant_id
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid());
  END IF;
  -- professional_id: pega do appointment se não informado
  IF NEW.professional_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
    NEW.professional_id := (SELECT professional_id FROM appointments WHERE id = NEW.appointment_id);
  END IF;
  -- fallback: usuário logado é o profissional
  IF NEW.professional_id IS NULL THEN
    NEW.professional_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_transaction_fields ON cash_register_transactions;
CREATE TRIGGER trg_auto_transaction_fields
  BEFORE INSERT ON cash_register_transactions
  FOR EACH ROW EXECUTE FUNCTION auto_set_transaction_fields();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. register_user_profile
--    Chamada pelo frontend no signup. Roda como SECURITY DEFINER para
--    resolver o bootstrap: antes do perfil existir, auth_tenant_id() = NULL,
--    então a criação direta via INSERT falharia no NOT NULL de tenant_id.
--
--    Lógica:
--    • Nenhum perfil no sistema → cria tenant + perfil super_admin
--    • Existe apenas 1 tenant   → entra nele como usuário regular
--      (onboarding manual: admin convida via dashboard Supabase)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION register_user_profile(
  p_full_name text,
  p_email     text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      varchar := 'user';
  v_count     integer;
BEGIN
  -- Já tem perfil? Não faz nada (idempotente)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count FROM profiles WHERE is_active = true;

  IF v_count = 0 THEN
    -- Primeiro usuário do sistema: cria tenant + super_admin
    INSERT INTO tenants (name, slug)
    VALUES (p_full_name || ' - Clínica', lower(regexp_replace(p_full_name, '[^a-zA-Z0-9]', '-', 'g')))
    RETURNING id INTO v_tenant_id;

    v_role := 'super_admin';
  ELSE
    -- Pega o único tenant ativo (onboarding manual de usuário adicional)
    SELECT id INTO v_tenant_id
    FROM tenants
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO profiles (id, email, full_name, role, is_active, tenant_id)
  VALUES (auth.uid(), p_email, p_full_name, v_role, true, v_tenant_id);
END $$;

GRANT EXECUTE ON FUNCTION register_user_profile(text, text) TO authenticated;

-- ── Verificação ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 006: Triggers de tenant + register_user_profile';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Triggers BEFORE INSERT:';
  RAISE NOTICE '   trg_auto_tenant_id → 8 tabelas (preenche tenant_id)';
  RAISE NOTICE '   trg_auto_transaction_fields → cash_register_transactions';
  RAISE NOTICE '     (preenche tenant_id + professional_id via appointment)';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Impacto no frontend:';
  RAISE NOTICE '   INSERTs não precisam enviar tenant_id — trigger preenche.';
  RAISE NOTICE '   Apenas AuthContext.signUp muda: chama register_user_profile().';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
