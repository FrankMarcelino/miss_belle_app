-- ============================================================================
-- MIGRATION: Ajustar RLS INSERT em profiles para permitir signup
-- Data: 2026-02-06
-- Descrição: Permitir que novos usuários criem seu próprio profile
-- ============================================================================

/*
  PROBLEMA:
  Super admin tenta criar novo usuário via frontend usando signUp()
  mas a policy "Only super admins can insert profiles" impede o próprio
  usuário recém-criado de inserir seu profile.
  
  SOLUÇÃO:
  Adicionar policy que permite ao usuário criar seu próprio profile
  durante o signup (auth.uid() = novo profile id).
*/

-- ============================================================================
-- Dropar policy existente
-- ============================================================================

DROP POLICY IF EXISTS "Only super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile during signup" ON profiles;

-- ============================================================================
-- Recriar policies de INSERT
-- ============================================================================

-- Policy 1: Usuário pode criar seu próprio profile (durante signup)
CREATE POLICY "Users can insert own profile during signup"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Policy 2: Super admins podem inserir qualquer profile
CREATE POLICY "Super admins can insert any profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

-- ============================================================================
-- VALIDAÇÕES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ RLS INSERT policies ajustadas!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policies ativas:';
  RAISE NOTICE '1. Users can insert own profile during signup';
  RAISE NOTICE '2. Super admins can insert any profile';
  RAISE NOTICE '';
  RAISE NOTICE '🔓 Agora super admins podem criar usuários via frontend!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
