-- ============================================================================
-- MIGRATION: Criar tabela tenants (base do multi-tenancy)
-- Data: 2026-02-21
-- ============================================================================

CREATE TABLE tenants (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(255) NOT NULL,
  slug       varchar(100) UNIQUE,
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now()
);

-- RLS: usuário vê apenas seu próprio tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- A policy é criada APÓS auth_tenant_id() existir (migration 002).
-- Por enquanto, acesso via service_role (dashboard Supabase) apenas.

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 000: Tabela tenants criada';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
