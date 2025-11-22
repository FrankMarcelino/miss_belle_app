/*
  # Fix RLS Policies - Remove Infinite Recursion

  1. Changes
    - Drop existing problematic policies on profiles table
    - Create new policies that don't cause recursion
    - Allow users to read their own profile
    - Allow profile creation during signup (anon role)
    - Use direct checks instead of subqueries on same table

  2. Security
    - Users can view their own profile
    - All authenticated users can view all profiles (needed for app functionality)
    - Profile creation allowed for new signups
    - Profile updates restricted to own profile
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new policies without recursion
CREATE POLICY "Enable read access for authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert during signup"
  ON profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
