-- ============================================================================
-- MIGRATION: Corrigir register_user_profile para multi-tenant público
-- Bug: usuários novos entravam no primeiro tenant do sistema em vez de
--      criar o seu próprio tenant.
-- Fix: todo signup público cria um novo tenant independente.
--      A adição de usuários a um tenant existente é feita apenas pelo
--      super_admin via Edge Function create-user (que passa tenant_id explícito).
-- ============================================================================

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
BEGIN
  -- Idempotente: não faz nada se perfil já existe
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RETURN;
  END IF;

  -- Todo signup público cria seu próprio tenant como super_admin
  INSERT INTO tenants (name, slug)
  VALUES (
    p_full_name || ' - Clínica',
    lower(regexp_replace(p_full_name, '[^a-zA-Z0-9]', '-', 'g'))
         || '-' || floor(extract(epoch FROM now()))::text
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO profiles (id, email, full_name, role, is_active, tenant_id)
  VALUES (auth.uid(), p_email, p_full_name, 'super_admin', true, v_tenant_id);
END $$;

GRANT EXECUTE ON FUNCTION register_user_profile(text, text) TO authenticated;
