-- ============================================================================
-- MIGRATION: Sistema de Assinaturas (Stripe)
-- Data: 2026-03-22
-- Descrição:
--   1. Adiciona stripe_customer_id na tabela tenants
--   2. Cria tabela subscriptions com RLS
--   3. Trigger: nova tenant sempre começa no plano Starter
-- ============================================================================

-- ============================================================================
-- ETAPA 1: stripe_customer_id na tabela tenants
-- ============================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id varchar UNIQUE;

-- ============================================================================
-- ETAPA 2: Tabela subscriptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_id  varchar     UNIQUE,
  stripe_customer_id      varchar,
  plan_id                 varchar     NOT NULL DEFAULT 'starter'
                            CHECK (plan_id IN ('starter', 'pro', 'clinic')),
  status                  varchar     NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  trial_ends_at           timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  canceled_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions (stripe_subscription_id);

-- ============================================================================
-- ETAPA 3: RLS
-- ============================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Todos os usuários do tenant podem ver a assinatura
CREATE POLICY "subscriptions_tenant_select"
  ON subscriptions FOR SELECT
  USING (tenant_id = auth_tenant_id());

-- Somente service_role (webhooks Stripe) pode inserir/atualizar
CREATE POLICY "subscriptions_service_role_all"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- ETAPA 4: Trigger updated_at (reutiliza função já existente)
-- ============================================================================
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ETAPA 5: Trigger — toda nova tenant começa no Starter
-- ============================================================================
CREATE OR REPLACE FUNCTION create_initial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscriptions (tenant_id, plan_id, status)
  VALUES (NEW.id, 'starter', 'active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_create_subscription ON tenants;
CREATE TRIGGER tenants_create_subscription
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION create_initial_subscription();

-- ============================================================================
-- ETAPA 6: Backfill — criar registro Starter para tenants já existentes
-- ============================================================================
INSERT INTO subscriptions (tenant_id, plan_id, status)
SELECT id, 'starter', 'active'
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM subscriptions)
ON CONFLICT DO NOTHING;
