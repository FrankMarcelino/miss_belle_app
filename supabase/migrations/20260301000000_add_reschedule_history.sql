-- Add reschedule history columns to appointments table
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from_date date,
  ADD COLUMN IF NOT EXISTS rescheduled_from_time time,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN appointments.rescheduled_from_date IS 'Original appointment date before the last reschedule';
COMMENT ON COLUMN appointments.rescheduled_from_time IS 'Original appointment time before the last reschedule';
COMMENT ON COLUMN appointments.reschedule_count IS 'Number of times this appointment has been rescheduled';
