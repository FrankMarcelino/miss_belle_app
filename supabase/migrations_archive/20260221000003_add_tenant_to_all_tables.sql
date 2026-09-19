-- ============================================================================
-- MIGRATION: Adicionar tenant_id a todas as tabelas de negócio
-- Data: 2026-02-21
-- Descrição: Todas as tabelas recebem tenant_id com NOT NULL.
--            Dados existentes são associados ao tenant padrão Miss Belle.
--            cash_register_transactions recebe professional_id para
--            simplificar RLS (elimina JOIN para verificar propriedade).
-- ============================================================================

DO $$
DECLARE v_tenant_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ── 1. patients ──────────────────────────────────────────────────────────────

ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE patients SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE patients ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_tenant_id ON patients (tenant_id);

-- ── 2. procedures ────────────────────────────────────────────────────────────

ALTER TABLE procedures ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE procedures SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE procedures ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedures_tenant_id ON procedures (tenant_id);

-- ── 3. professional_procedures ──────────────────────────────────────────────

ALTER TABLE professional_procedures ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE professional_procedures SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE professional_procedures ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prof_procs_tenant_id ON professional_procedures (tenant_id);

-- ── 4. appointments ──────────────────────────────────────────────────────────

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE appointments SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE appointments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments (tenant_id);

-- ── 5. cash_register_closings ────────────────────────────────────────────────

ALTER TABLE cash_register_closings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE cash_register_closings SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE cash_register_closings ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crc_tenant_id ON cash_register_closings (tenant_id);

-- ── 6. cash_register_transactions ────────────────────────────────────────────
-- Adicionamos professional_id para simplificar RLS (evita JOIN em appointments).
-- Backfill via appointments; transações manuais (sem appointment) ficam NULL.

ALTER TABLE cash_register_transactions
  ADD COLUMN IF NOT EXISTS tenant_id       uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES profiles(id);

UPDATE cash_register_transactions t
SET
  tenant_id       = v_tenant_id,
  professional_id = a.professional_id
FROM appointments a
WHERE t.appointment_id = a.id;

-- Transações sem appointment: só tenant
UPDATE cash_register_transactions
SET tenant_id = v_tenant_id
WHERE tenant_id IS NULL;

ALTER TABLE cash_register_transactions ALTER COLUMN tenant_id SET NOT NULL;
-- professional_id permanece nullable (transações manuais sem appointment)

CREATE INDEX IF NOT EXISTS idx_crt_tenant_id       ON cash_register_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crt_professional_id ON cash_register_transactions (professional_id);

-- ── 7. expenses ───────────────────────────────────────────────────────────────

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE expenses SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE expenses ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses (tenant_id);

-- ── 8. expense_assignments ───────────────────────────────────────────────────

ALTER TABLE expense_assignments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE expense_assignments SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE expense_assignments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_assign_tenant_id ON expense_assignments (tenant_id);

-- ── 9. expense_splits ────────────────────────────────────────────────────────

ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE expense_splits SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
ALTER TABLE expense_splits ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_splits_tenant_id ON expense_splits (tenant_id);

RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
RAISE NOTICE '✅  MIGRATION 003: tenant_id adicionado a todas as tabelas';
RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
RAISE NOTICE '';
RAISE NOTICE '📋 Tabelas atualizadas:';
RAISE NOTICE '   patients, procedures, professional_procedures';
RAISE NOTICE '   appointments, cash_register_closings';
RAISE NOTICE '   cash_register_transactions (+professional_id)';
RAISE NOTICE '   expenses, expense_assignments, expense_splits';
RAISE NOTICE '══════════════════════════════════════════════════════════════════════';

END $$;
