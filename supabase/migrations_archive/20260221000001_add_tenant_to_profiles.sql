-- ============================================================================
-- MIGRATION: Adicionar tenant_id a profiles
-- Data: 2026-02-21
-- Descrição: Cada tenant tem seu(s) super_admin. O sistema de roles existente
--            (super_admin / usuário regular) é mantido sem alteração.
--            tenant_id apenas isola os dados entre clínicas diferentes.
-- ============================================================================

-- ── 1. Criar tenant padrão ───────────────────────────────────────────────────

INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Miss Belle', 'miss-belle')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Adicionar tenant_id ───────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- ── 3. Backfill ──────────────────────────────────────────────────────────────

UPDATE profiles
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- ── 4. Tornar obrigatório ────────────────────────────────────────────────────

ALTER TABLE profiles
  ALTER COLUMN tenant_id SET NOT NULL;

-- ── 5. Índice ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles (tenant_id);

-- ── Verificação ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_super_admins integer;
  v_regular      integer;
BEGIN
  SELECT COUNT(*) INTO v_super_admins FROM profiles WHERE role = 'super_admin';
  SELECT COUNT(*) INTO v_regular      FROM profiles WHERE role IS DISTINCT FROM 'super_admin';

  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 001: tenant_id adicionado a profiles';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Perfis migrados:';
  RAISE NOTICE '   super_admin:  %  (roles mantidos sem alteração)', v_super_admins;
  RAISE NOTICE '   usuários:     %', v_regular;
  RAISE NOTICE '';
  RAISE NOTICE '🏢 Tenant padrão: Miss Belle (00000000-0000-0000-0000-000000000001)';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
