/*
  # Miss Belle - Initial Database Schema

  ## Overview
  Complete database schema for Miss Belle aesthetic clinic management system with role-based access control.

  ## New Tables
  
  ### 1. profiles
  - `id` (uuid, FK to auth.users)
  - `email` (text)
  - `full_name` (text)
  - `role` (text: 'super_admin' or 'user')
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. procedures
  - `id` (uuid, PK)
  - `name` (text)
  - `duration_minutes` (integer)
  - `default_price` (numeric)
  - `is_active` (boolean)
  - `created_by` (uuid, FK to profiles)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. patients
  - `id` (uuid, PK)
  - `full_name` (text)
  - `phone` (text)
  - `email` (text, optional)
  - `notes` (text, optional)
  - `professional_id` (uuid, FK to profiles)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. appointments
  - `id` (uuid, PK)
  - `patient_id` (uuid, FK to patients)
  - `procedure_id` (uuid, FK to procedures)
  - `professional_id` (uuid, FK to profiles)
  - `appointment_date` (date)
  - `appointment_time` (time)
  - `status` (text: 'scheduled', 'confirmed', 'completed', 'cancelled')
  - `cancellation_reason` (text, optional)
  - `created_by` (uuid, FK to profiles)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 5. cash_register_closings
  - `id` (uuid, PK)
  - `professional_id` (uuid, FK to profiles)
  - `closing_date` (date)
  - `total_amount` (numeric)
  - `notes` (text, optional)
  - `is_finalized` (boolean)
  - `finalized_at` (timestamptz, optional)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 6. cash_register_transactions
  - `id` (uuid, PK)
  - `closing_id` (uuid, FK to cash_register_closings)
  - `appointment_id` (uuid, FK to appointments, optional)
  - `amount` (numeric)
  - `payment_method` (text)
  - `notes` (text, optional)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Policies for super_admin: full access to all data
  - Policies for user: access only to their own data
  - Public cannot access any data without authentication

  ## Notes
  - All tables use UUIDs for primary keys
  - Timestamps track creation and modification
  - Soft deletes via is_active flags where applicable
  - Foreign keys ensure referential integrity
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'user')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create procedures table
CREATE TABLE IF NOT EXISTS procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  default_price numeric(10, 2) NOT NULL CHECK (default_price >= 0),
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  notes text,
  professional_id uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) NOT NULL,
  procedure_id uuid REFERENCES procedures(id) NOT NULL,
  professional_id uuid REFERENCES profiles(id) NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  cancellation_reason text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (professional_id, appointment_date, appointment_time)
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create cash_register_closings table
CREATE TABLE IF NOT EXISTS cash_register_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES profiles(id) NOT NULL,
  closing_date date NOT NULL,
  total_amount numeric(10, 2) DEFAULT 0,
  notes text,
  is_finalized boolean DEFAULT false,
  finalized_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (professional_id, closing_date)
);

ALTER TABLE cash_register_closings ENABLE ROW LEVEL SECURITY;

-- Create cash_register_transactions table
CREATE TABLE IF NOT EXISTS cash_register_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid REFERENCES cash_register_closings(id) ON DELETE CASCADE NOT NULL,
  appointment_id uuid REFERENCES appointments(id),
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_register_transactions ENABLE ROW LEVEL SECURITY;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_professional ON patients(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_cash_closings_professional ON cash_register_closings(professional_id);
CREATE INDEX IF NOT EXISTS idx_cash_closings_date ON cash_register_closings(closing_date);

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for procedures
CREATE POLICY "Authenticated users can view active procedures"
  ON procedures FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can manage procedures"
  ON procedures FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policies for patients
CREATE POLICY "Users can view own patients"
  ON patients FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can view all patients"
  ON patients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create own patients"
  ON patients FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can create any patient"
  ON patients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can update own patients"
  ON patients FOR UPDATE
  TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any patient"
  ON patients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policies for appointments
CREATE POLICY "Users can view own appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can view all appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create own appointments"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = auth.uid() AND created_by = auth.uid());

CREATE POLICY "Super admins can create any appointment"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can update own appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any appointment"
  ON appointments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policies for cash_register_closings
CREATE POLICY "Users can view own closings"
  ON cash_register_closings FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Super admins can view all closings"
  ON cash_register_closings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create own closings"
  ON cash_register_closings FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Users can update own non-finalized closings"
  ON cash_register_closings FOR UPDATE
  TO authenticated
  USING (professional_id = auth.uid() AND is_finalized = false)
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Super admins can update any closing"
  ON cash_register_closings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policies for cash_register_transactions
CREATE POLICY "Users can view own transactions"
  ON cash_register_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE cash_register_closings.id = closing_id
      AND cash_register_closings.professional_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can view all transactions"
  ON cash_register_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create own transactions"
  ON cash_register_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cash_register_closings
      WHERE cash_register_closings.id = closing_id
      AND cash_register_closings.professional_id = auth.uid()
      AND cash_register_closings.is_finalized = false
    )
  );

CREATE POLICY "Super admins can create any transaction"
  ON cash_register_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_procedures_updated_at BEFORE UPDATE ON procedures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cash_register_closings_updated_at BEFORE UPDATE ON cash_register_closings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();