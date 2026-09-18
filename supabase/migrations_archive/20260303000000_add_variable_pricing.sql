-- Add variable pricing support to procedures
ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS is_variable_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_price numeric DEFAULT NULL;

COMMENT ON COLUMN procedures.is_variable_price IS 'Whether this procedure has a variable price (set per appointment)';
COMMENT ON COLUMN procedures.min_price IS 'Minimum allowed price for variable-price procedures';

-- Add final_price to appointments (the actual price charged for this specific appointment)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS final_price numeric DEFAULT NULL;

COMMENT ON COLUMN appointments.final_price IS 'Actual price charged for this appointment. Falls back to procedure default_price when NULL';
