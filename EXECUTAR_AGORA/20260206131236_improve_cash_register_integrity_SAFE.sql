-- Migration: Improve Cash Register Integrity (SAFE VERSION)
-- Data: 2026-02-06
-- Esta versão pode ser executada múltiplas vezes sem erro

-- ============================================================================
-- 1. Remover triggers antigos se existirem
-- ============================================================================

DROP TRIGGER IF EXISTS update_closing_total_on_insert ON cash_register_transactions;
DROP TRIGGER IF EXISTS update_closing_total_on_update ON cash_register_transactions;
DROP TRIGGER IF EXISTS update_closing_total_on_delete ON cash_register_transactions;

-- ============================================================================
-- 2. Remover função antiga se existir
-- ============================================================================

DROP FUNCTION IF EXISTS recalculate_closing_total() CASCADE;

-- ============================================================================
-- 3. Criar função para recalcular total do fechamento
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_closing_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular o total do fechamento baseado nas transações
  UPDATE cash_register_closings
  SET total_amount = COALESCE((
    SELECT SUM(amount)
    FROM cash_register_transactions
    WHERE closing_id = COALESCE(NEW.closing_id, OLD.closing_id)
  ), 0)
  WHERE id = COALESCE(NEW.closing_id, OLD.closing_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Criar triggers para manter total atualizado
-- ============================================================================

-- Trigger para INSERT
CREATE TRIGGER update_closing_total_on_insert
  AFTER INSERT ON cash_register_transactions
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_closing_total();

-- Trigger para UPDATE
CREATE TRIGGER update_closing_total_on_update
  AFTER UPDATE ON cash_register_transactions
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_closing_total();

-- Trigger para DELETE
CREATE TRIGGER update_closing_total_on_delete
  AFTER DELETE ON cash_register_transactions
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_closing_total();

-- ============================================================================
-- 5. RLS: Impedir edição de transações em fechamentos finalizados
-- ============================================================================

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS "Users cannot delete finalized transactions" ON cash_register_transactions;
DROP POLICY IF EXISTS "Super admins can delete finalized transactions" ON cash_register_transactions;
DROP POLICY IF EXISTS "Users cannot update finalized transactions" ON cash_register_transactions;
DROP POLICY IF EXISTS "Super admins can update finalized transactions" ON cash_register_transactions;

-- DELETE: Usuários comuns não podem deletar transações de fechamentos finalizados
CREATE POLICY "Users cannot delete finalized transactions"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    -- Permite deletar se o fechamento NÃO está finalizado
    NOT EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE id = cash_register_transactions.closing_id
      AND is_finalized = true
    )
    -- E se é o próprio profissional do fechamento
    AND EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE id = cash_register_transactions.closing_id
      AND professional_id = auth.uid()
    )
  );

-- DELETE: Super admins podem deletar qualquer transação
CREATE POLICY "Super admins can delete finalized transactions"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- UPDATE: Usuários comuns não podem atualizar transações de fechamentos finalizados
CREATE POLICY "Users cannot update finalized transactions"
  ON cash_register_transactions FOR UPDATE
  TO authenticated
  USING (
    -- Permite atualizar se o fechamento NÃO está finalizado
    NOT EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE id = cash_register_transactions.closing_id
      AND is_finalized = true
    )
    -- E se é o próprio profissional do fechamento
    AND EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE id = cash_register_transactions.closing_id
      AND professional_id = auth.uid()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE id = cash_register_transactions.closing_id
      AND is_finalized = true
    )
  );

-- UPDATE: Super admins podem atualizar qualquer transação
CREATE POLICY "Super admins can update finalized transactions"
  ON cash_register_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================================================
-- 6. Recalcular totais existentes (correção de dados)
-- ============================================================================

UPDATE cash_register_closings
SET total_amount = COALESCE((
  SELECT SUM(amount)
  FROM cash_register_transactions
  WHERE closing_id = cash_register_closings.id
), 0);

-- ============================================================================
-- Mensagens de sucesso
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration executada com sucesso!';
  RAISE NOTICE '- Triggers criados/atualizados';
  RAISE NOTICE '- RLS policies configuradas';
  RAISE NOTICE '- Totais recalculados';
END $$;
