-- ============================================================================
-- MIGRATION: Triggers auto_tenant_id para patient_credits e patient_credit_uses
-- Data: 2026-02-26
-- Complemento da migration 20260226000000
-- ============================================================================

-- Adicionar trigger de tenant_id nas novas tabelas de crédito
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_credits', 'patient_credit_uses'] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_auto_tenant_id ON %I;
      CREATE TRIGGER trg_auto_tenant_id
        BEFORE INSERT ON %I
        FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();
    ', t, t);
  END LOOP;
END $$;

DO $$
BEGIN
  RAISE NOTICE '✅  Triggers auto_tenant_id adicionados: patient_credits, patient_credit_uses';
END $$;
