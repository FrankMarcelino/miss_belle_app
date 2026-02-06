/*
  # Add Appointment Conflict Check Function

  1. Changes
    - Add RPC function to check for appointment time conflicts considering procedure duration
    - Prevents scheduling overlapping appointments for the same professional

  2. Function
    - check_appointment_conflict(professional_id, date, time, procedure_id, optional appointment_id to exclude)
    - Returns true if there is a conflict, false otherwise
    - Considers procedure duration to detect overlaps
*/

-- Function to check for appointment time conflicts with overlapping
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_professional_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_procedure_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  new_start_time time;
  new_end_time time;
  new_duration integer;
  conflict_count integer;
BEGIN
  -- Get the duration of the new appointment
  SELECT duration_minutes INTO new_duration
  FROM procedures
  WHERE id = p_procedure_id;
  
  IF new_duration IS NULL THEN
    RAISE EXCEPTION 'Procedure not found';
  END IF;
  
  -- Calculate start and end times
  new_start_time := p_appointment_time;
  new_end_time := p_appointment_time + (new_duration || ' minutes')::interval;
  
  -- Check for conflicts with existing appointments
  -- Two appointments conflict if:
  -- 1. They are for the same professional
  -- 2. They are on the same date
  -- 3. They are not cancelled
  -- 4. Their time ranges overlap
  SELECT COUNT(*) INTO conflict_count
  FROM appointments a
  JOIN procedures proc ON a.procedure_id = proc.id
  WHERE a.professional_id = p_professional_id
    AND a.appointment_date = p_appointment_date
    AND a.status != 'cancelled'
    AND (p_appointment_id IS NULL OR a.id != p_appointment_id)
    AND (
      -- New appointment starts during existing appointment
      (new_start_time >= a.appointment_time 
       AND new_start_time < a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
      OR
      -- New appointment ends during existing appointment
      (new_end_time > a.appointment_time 
       AND new_end_time <= a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
      OR
      -- New appointment completely contains existing appointment
      (new_start_time <= a.appointment_time 
       AND new_end_time >= a.appointment_time + (proc.duration_minutes || ' minutes')::interval)
    );
  
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_appointment_conflict(uuid, date, time, uuid, uuid) TO authenticated;
