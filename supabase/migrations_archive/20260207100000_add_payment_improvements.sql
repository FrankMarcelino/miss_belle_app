-- ============================================================================
-- MIGRATION: Melhorias no Sistema de Pagamento
-- Data: 2026-02-07
-- Descrição: Adicionar suporte para calção e múltiplas formas de pagamento
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR CAMPOS NA TABELA APPOINTMENTS
-- ============================================================================

-- Campos para gerenciar calção (entrada)
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS downpayment_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downpayment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS downpayment_notes TEXT,
  ADD COLUMN IF NOT EXISTS has_payment BOOLEAN DEFAULT false;

-- ============================================================================
-- 2. ADICIONAR CAMPOS NA TABELA CASH_REGISTER_TRANSACTIONS
-- ============================================================================

-- Campos para gerenciar múltiplas formas de pagamento e tipo de transação
ALTER TABLE cash_register_transactions
  ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'full_payment';

-- Adicionar constraint para validar transaction_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cash_register_transactions_transaction_type_check'
  ) THEN
    ALTER TABLE cash_register_transactions
      ADD CONSTRAINT cash_register_transactions_transaction_type_check
      CHECK (transaction_type IN ('downpayment', 'remaining_payment', 'full_payment'));
  END IF;
END $$;

-- Adicionar constraint para validar downpayment_method
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'appointments_downpayment_method_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_downpayment_method_check
      CHECK (downpayment_method IN ('dinheiro', 'credito', 'debito', 'pix') OR downpayment_method IS NULL);
  END IF;
END $$;

-- ============================================================================
-- 3. FUNÇÃO PARA ATUALIZAR STATUS DE PAGAMENTO
-- ============================================================================

CREATE OR REPLACE FUNCTION update_appointment_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Se houver calção, marcar has_payment = true
  IF NEW.downpayment_amount > 0 THEN
    NEW.has_payment := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. TRIGGER PARA ATUALIZAR has_payment AUTOMATICAMENTE
-- ============================================================================

DROP TRIGGER IF EXISTS check_appointment_payment ON appointments;

CREATE TRIGGER check_appointment_payment
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION update_appointment_payment_status();

-- ============================================================================
-- 5. CRIAR ÍNDICES PARA MELHOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointments_has_payment 
  ON appointments(has_payment) 
  WHERE has_payment = true;

CREATE INDEX IF NOT EXISTS idx_transactions_type 
  ON cash_register_transactions(transaction_type);

CREATE INDEX IF NOT EXISTS idx_transactions_appointment 
  ON cash_register_transactions(appointment_id) 
  WHERE appointment_id IS NOT NULL;

-- ============================================================================
-- 6. ATUALIZAR REGISTROS EXISTENTES
-- ============================================================================

-- Marcar agendamentos completados que já têm transações como tendo pagamento
UPDATE appointments a
SET has_payment = true
WHERE a.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM cash_register_transactions t
    WHERE t.appointment_id = a.id
  );

-- ============================================================================
-- 7. COMENTÁRIOS NAS COLUNAS
-- ============================================================================

COMMENT ON COLUMN appointments.downpayment_amount IS 'Valor do calção pago no momento do agendamento';
COMMENT ON COLUMN appointments.downpayment_method IS 'Forma de pagamento do calção: dinheiro, credito, debito, pix';
COMMENT ON COLUMN appointments.downpayment_notes IS 'Observações sobre o calção';
COMMENT ON COLUMN appointments.has_payment IS 'Indica se o agendamento tem algum pagamento registrado';

COMMENT ON COLUMN cash_register_transactions.transaction_type IS 'Tipo da transação: downpayment (calção), remaining_payment (restante), full_payment (total)';

-- ============================================================================
-- VALIDAÇÕES E MENSAGENS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRATION: Melhorias de Pagamento APLICADA!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Mudanças:';
  RAISE NOTICE '1. Campos de calção adicionados em appointments';
  RAISE NOTICE '2. Campo transaction_type adicionado em cash_register_transactions';
  RAISE NOTICE '3. Trigger para atualizar has_payment automaticamente';
  RAISE NOTICE '4. Índices criados para melhor performance';
  RAISE NOTICE '5. Registros existentes atualizados';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Novos campos em appointments:';
  RAISE NOTICE '   - downpayment_amount (NUMERIC)';
  RAISE NOTICE '   - downpayment_method (VARCHAR)';
  RAISE NOTICE '   - downpayment_notes (TEXT)';
  RAISE NOTICE '   - has_payment (BOOLEAN)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Novos campos em cash_register_transactions:';
  RAISE NOTICE '   - transaction_type (VARCHAR)';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Sistema pronto para múltiplas formas de pagamento!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
