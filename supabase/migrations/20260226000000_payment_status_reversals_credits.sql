-- ============================================================================
-- MIGRATION: Fase 1 — Status de Pagamento, Estornos e Créditos de Clientes
-- Data: 2026-02-26
-- ============================================================================
--
-- INSTRUÇÕES:
-- 1. Acesse: https://supabase.com/dashboard/project/otzaauwiziyoxlvttgsb/sql/new
-- 2. Cole TODO este script no editor SQL
-- 3. Clique em "RUN" (ou pressione Ctrl+Enter)
-- 4. Aguarde a mensagem de sucesso
--
-- O que este script faz:
--   1. Adiciona payment_status e payment_paid_at em appointments
--   2. Adiciona campos de estorno em cash_register_transactions
--   3. Cria tabelas patient_credits e patient_credit_uses
--   4. Atualiza RLS de transactions para usar professional_id diretamente
--   5. Aplica RLS nas novas tabelas
--   6. Migra dados históricos (legacy/paid)
-- ============================================================================

BEGIN;

-- ============================================================================
-- ETAPA 1: appointments — payment_status e payment_paid_at
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none'
    CONSTRAINT appointments_payment_status_check
    CHECK (payment_status IN ('none','partial','paid','reopened','reversed','credited','legacy')),
  ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz;

COMMENT ON COLUMN appointments.payment_status IS
  'Estado do pagamento: none=sem pagamento, partial=sinal pago, paid=pago integralmente, '
  'reopened=reaberto p/ correção, reversed=estornado, credited=virou crédito, legacy=anterior ao sistema';
COMMENT ON COLUMN appointments.payment_paid_at IS
  'Data/hora do pagamento efetivo (primeira transação vinculada)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status
  ON appointments(tenant_id, payment_status);

-- ──────────────────────────────────────────────────────────────────────────────
-- MIGRAÇÃO DE DADOS: marcar existentes
-- ──────────────────────────────────────────────────────────────────────────────

-- Passo 1: Tudo que é 'none' vira 'legacy' (dados antes do sistema)
UPDATE appointments
SET payment_status = 'legacy'
WHERE payment_status = 'none';

-- Passo 2: Appointments completed COM transações → paid + payment_paid_at
UPDATE appointments a
SET
  payment_status  = 'paid',
  payment_paid_at = (
    SELECT MIN(t.created_at)
    FROM cash_register_transactions t
    WHERE t.appointment_id = a.id
  )
WHERE a.status = 'completed'
  AND a.payment_status = 'legacy'
  AND EXISTS (
    SELECT 1 FROM cash_register_transactions t
    WHERE t.appointment_id = a.id
  );

-- ============================================================================
-- ETAPA 2: cash_register_transactions — campos de estorno
-- ============================================================================

-- type: natureza da transação (payment = entrada, reversal = estorno, adjustment = ajuste manual)
ALTER TABLE cash_register_transactions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'payment'
    CONSTRAINT cash_register_transactions_type_check
    CHECK (type IN ('payment', 'reversal', 'adjustment'));

-- Campos de estorno (preenchidos apenas quando type = 'reversal')
ALTER TABLE cash_register_transactions
  ADD COLUMN IF NOT EXISTS reversal_reason   text,
  ADD COLUMN IF NOT EXISTS reversal_method   text,
  ADD COLUMN IF NOT EXISTS reversal_at       timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by       uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reversal_of       uuid REFERENCES cash_register_transactions(id),
  ADD COLUMN IF NOT EXISTS reversal_protocol text;

-- Constraint: campos obrigatórios quando type = 'reversal'
ALTER TABLE cash_register_transactions
  DROP CONSTRAINT IF EXISTS crt_reversal_fields_required;
ALTER TABLE cash_register_transactions
  ADD CONSTRAINT crt_reversal_fields_required CHECK (
    type != 'reversal' OR (
      reversal_reason IS NOT NULL AND
      reversal_method IS NOT NULL AND
      reversal_of     IS NOT NULL
    )
  );

-- Reversals sempre têm amount > 0 (direção indicada pelo type, não pelo sinal)
-- A constraint amount >= 0 já cobre isso.

COMMENT ON COLUMN cash_register_transactions.type IS
  'Natureza: payment=pagamento, reversal=estorno, adjustment=ajuste manual';
COMMENT ON COLUMN cash_register_transactions.reversal_of IS
  'FK para a transação original que está sendo estornada';
COMMENT ON COLUMN cash_register_transactions.reversal_protocol IS
  'Número de protocolo do estorno, ex: EST-20260226-0001';

CREATE INDEX IF NOT EXISTS idx_crt_type
  ON cash_register_transactions(type);
CREATE INDEX IF NOT EXISTS idx_crt_reversal_of
  ON cash_register_transactions(reversal_of)
  WHERE reversal_of IS NOT NULL;

-- ============================================================================
-- ETAPA 3: tabela patient_credits
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_credits (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id),
  patient_id            uuid        NOT NULL REFERENCES patients(id),
  professional_id       uuid        NOT NULL REFERENCES profiles(id),

  amount_original       numeric(10,2) NOT NULL CHECK (amount_original > 0),
  amount_remaining      numeric(10,2) NOT NULL CHECK (amount_remaining >= 0),

  origin                text        NOT NULL
    CHECK (origin IN ('reversal','cancellation','downpayment','manual')),

  origin_appointment_id uuid        REFERENCES appointments(id),
  origin_transaction_id uuid        REFERENCES cash_register_transactions(id),

  notes                 text,
  expires_at            date,       -- NULL = sem prazo de validade

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES profiles(id),

  CONSTRAINT patient_credits_remaining_lte_original
    CHECK (amount_remaining <= amount_original)
);

COMMENT ON TABLE patient_credits IS
  'Créditos de clientes com um profissional específico. Uso parcial permitido. Imutável após criação.';
COMMENT ON COLUMN patient_credits.expires_at IS
  'Data de expiração do crédito. NULL = sem prazo.';
COMMENT ON COLUMN patient_credits.amount_remaining IS
  'Saldo restante do crédito (decrementado a cada uso em patient_credit_uses).';

CREATE INDEX IF NOT EXISTS idx_patient_credits_tenant      ON patient_credits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_credits_patient     ON patient_credits(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_credits_professional ON patient_credits(professional_id);
CREATE INDEX IF NOT EXISTS idx_patient_credits_active
  ON patient_credits(professional_id, patient_id)
  WHERE amount_remaining > 0;

-- ============================================================================
-- ETAPA 4: tabela patient_credit_uses
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_credit_uses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  credit_id      uuid        NOT NULL REFERENCES patient_credits(id),
  appointment_id uuid        REFERENCES appointments(id),
  amount_used    numeric(10,2) NOT NULL CHECK (amount_used > 0),
  used_at        timestamptz NOT NULL DEFAULT now(),
  used_by        uuid        REFERENCES profiles(id)
);

COMMENT ON TABLE patient_credit_uses IS
  'Histórico de uso (parcial ou total) dos créditos de clientes. Imutável.';

CREATE INDEX IF NOT EXISTS idx_credit_uses_credit     ON patient_credit_uses(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_uses_tenant     ON patient_credit_uses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_uses_appointment ON patient_credit_uses(appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ============================================================================
-- ETAPA 5: atualizar RLS de cash_register_transactions
--   A migration anterior adicionou professional_id na tabela.
--   Agora substituímos o JOIN custoso por professional_id = auth.uid().
-- ============================================================================

-- Limpar policies antigas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'cash_register_transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cash_register_transactions', r.policyname);
  END LOOP;
END $$;

-- SELECT
CREATE POLICY "Super admins can view all transactions"
  ON cash_register_transactions FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own transactions"
  ON cash_register_transactions FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

-- INSERT
CREATE POLICY "Super admins can insert transactions"
  ON cash_register_transactions FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own transactions"
  ON cash_register_transactions FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

-- UPDATE
CREATE POLICY "Super admins can update any transaction"
  ON cash_register_transactions FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own transactions"
  ON cash_register_transactions FOR UPDATE TO authenticated
  USING (professional_id = auth.uid());

-- DELETE
CREATE POLICY "Super admins can delete any transaction"
  ON cash_register_transactions FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can delete own transactions"
  ON cash_register_transactions FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

-- ============================================================================
-- ETAPA 6: RLS para patient_credits
-- ============================================================================

ALTER TABLE patient_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all patient credits"
  ON patient_credits FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own patient credits"
  ON patient_credits FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can insert patient credits"
  ON patient_credits FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own patient credits"
  ON patient_credits FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any patient credit"
  ON patient_credits FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can update own patient credits"
  ON patient_credits FOR UPDATE TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

-- Deletar crédito é operação irreversível — apenas super admin
CREATE POLICY "Only super admins can delete patient credits"
  ON patient_credits FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- ETAPA 7: RLS para patient_credit_uses
-- ============================================================================

ALTER TABLE patient_credit_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all credit uses"
  ON patient_credit_uses FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Users can view own credit uses"
  ON patient_credit_uses FOR SELECT TO authenticated
  USING (
    credit_id IN (
      SELECT id FROM patient_credits WHERE professional_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can insert credit uses"
  ON patient_credit_uses FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can insert own credit uses"
  ON patient_credit_uses FOR INSERT TO authenticated
  WITH CHECK (
    credit_id IN (
      SELECT id FROM patient_credits WHERE professional_id = auth.uid()
    )
  );

-- Uso de crédito é imutável — sem UPDATE ou DELETE para usuários comuns
CREATE POLICY "Only super admins can delete credit uses"
  ON patient_credit_uses FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================

DO $$
DECLARE
  v_total_appointments       bigint;
  v_legacy_appointments      bigint;
  v_paid_appointments        bigint;
  v_other_appointments       bigint;
  v_transaction_cols         bigint;
  v_credits_table_exists     boolean;
  v_credit_uses_table_exists boolean;
  v_transactions_policies    bigint;
  v_credits_policies         bigint;
BEGIN
  SELECT COUNT(*) INTO v_total_appointments FROM appointments;
  SELECT COUNT(*) INTO v_legacy_appointments FROM appointments WHERE payment_status = 'legacy';
  SELECT COUNT(*) INTO v_paid_appointments   FROM appointments WHERE payment_status = 'paid';
  SELECT COUNT(*) INTO v_other_appointments  FROM appointments WHERE payment_status NOT IN ('legacy','paid');

  SELECT COUNT(*) INTO v_transaction_cols
  FROM information_schema.columns
  WHERE table_name = 'cash_register_transactions'
    AND column_name IN ('type','reversal_reason','reversal_method','reversal_at','reversed_by','reversal_of','reversal_protocol');

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_credits'
  ) INTO v_credits_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_credit_uses'
  ) INTO v_credit_uses_table_exists;

  SELECT COUNT(*) INTO v_transactions_policies
  FROM pg_policies WHERE tablename = 'cash_register_transactions';

  SELECT COUNT(*) INTO v_credits_policies
  FROM pg_policies WHERE tablename = 'patient_credits';

  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION: Payment Status + Reversals + Credits — CONCLUÍDA!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 appointments.payment_status:';
  RAISE NOTICE '   Total de agendamentos : %', v_total_appointments;
  RAISE NOTICE '   → legacy              : %', v_legacy_appointments;
  RAISE NOTICE '   → paid                : %', v_paid_appointments;
  RAISE NOTICE '   → outros              : %', v_other_appointments;
  RAISE NOTICE '';
  RAISE NOTICE '📋 cash_register_transactions:';
  RAISE NOTICE '   Novas colunas de estorno: % de 7 esperadas', v_transaction_cols;
  RAISE NOTICE '   Policies ativas        : %', v_transactions_policies;
  RAISE NOTICE '';
  RAISE NOTICE '📋 Novas tabelas:';
  RAISE NOTICE '   patient_credits    : %', CASE WHEN v_credits_table_exists     THEN '✅ criada' ELSE '❌ ERRO' END;
  RAISE NOTICE '   patient_credit_uses: %', CASE WHEN v_credit_uses_table_exists THEN '✅ criada' ELSE '❌ ERRO' END;
  RAISE NOTICE '   patient_credits RLS: % policies', v_credits_policies;
  RAISE NOTICE '';
  RAISE NOTICE '🔒 RLS ativo em todas as novas tabelas';
  RAISE NOTICE '⚡ Índices criados para performance';
  RAISE NOTICE '';
  RAISE NOTICE '📌 PRÓXIMOS PASSOS (no código):';
  RAISE NOTICE '   1. PaymentModal: setar payment_status=paid + payment_paid_at';
  RAISE NOTICE '   2. Implementar Reabertura de Pagamento (sem alterar appointment.status)';
  RAISE NOTICE '   3. Implementar formulário de Estorno';
  RAISE NOTICE '   4. Implementar gestão de Créditos do cliente';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
END $$;

COMMIT;
