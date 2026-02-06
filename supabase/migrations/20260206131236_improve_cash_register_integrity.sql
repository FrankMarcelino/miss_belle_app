/*
  # Improve Cash Register Integrity

  1. Changes
    - Add trigger to automatically recalculate cash_register_closings.total_amount
    - Add RLS policies to prevent modifications to transactions in finalized closings
    - Ensure data consistency for concurrent operations

  2. Security
    - Users cannot delete transactions from finalized closings
    - Users cannot update transactions from finalized closings
    - Total amount is always accurate (calculated by database)
*/

-- Function to recalculate closing total amount
CREATE OR REPLACE FUNCTION recalculate_closing_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the total_amount for the affected closing
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

-- Trigger on INSERT
CREATE TRIGGER update_closing_total_on_insert
AFTER INSERT ON cash_register_transactions
FOR EACH ROW
EXECUTE FUNCTION recalculate_closing_total();

-- Trigger on UPDATE (if amount changes)
CREATE TRIGGER update_closing_total_on_update
AFTER UPDATE OF amount ON cash_register_transactions
FOR EACH ROW
WHEN (OLD.amount IS DISTINCT FROM NEW.amount)
EXECUTE FUNCTION recalculate_closing_total();

-- Trigger on DELETE
CREATE TRIGGER update_closing_total_on_delete
AFTER DELETE ON cash_register_transactions
FOR EACH ROW
EXECUTE FUNCTION recalculate_closing_total();

-- RLS Policy: Prevent DELETE on transactions from finalized closings
CREATE POLICY "Users cannot delete transactions from finalized closings"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE cash_register_closings.id = closing_id
      AND cash_register_closings.professional_id = auth.uid()
      AND cash_register_closings.is_finalized = false
    )
  );

-- RLS Policy: Super admins can delete any transaction (even from finalized)
CREATE POLICY "Super admins can delete any transaction"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policy: Prevent UPDATE on transactions from finalized closings
CREATE POLICY "Users cannot update transactions from finalized closings"
  ON cash_register_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE cash_register_closings.id = closing_id
      AND cash_register_closings.professional_id = auth.uid()
      AND cash_register_closings.is_finalized = false
    )
  );

-- RLS Policy: Super admins can update any transaction
CREATE POLICY "Super admins can update any transaction"
  ON cash_register_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Recalculate totals for all existing closings to ensure consistency
UPDATE cash_register_closings
SET total_amount = COALESCE((
  SELECT SUM(amount)
  FROM cash_register_transactions
  WHERE closing_id = cash_register_closings.id
), 0);
