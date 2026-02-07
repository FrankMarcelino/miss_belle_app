-- ============================================================================
-- LIMPEZA: Remover Policies Antigas de Profiles
-- Data: 2026-02-06
-- Descrição: Remove policies antigas que estão conflitando
-- ============================================================================

/*
  Este script remove as policies antigas que foram criadas anteriormente
  e mantém apenas as 6 novas policies de segurança.
*/

-- ============================================================================
-- REMOVER POLICIES ANTIGAS
-- ============================================================================

DROP POLICY IF EXISTS "Enable insert during signup" ON profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable update for own profile" ON profiles;

-- ============================================================================
-- VALIDAÇÃO
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Policies antigas removidas com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policies ativas agora:';
  RAISE NOTICE '1. Super admins can view all profiles';
  RAISE NOTICE '2. Users can view own profile';
  RAISE NOTICE '3. Only super admins can insert profiles';
  RAISE NOTICE '4. Super admins can update any profile';
  RAISE NOTICE '5. Users can update own profile';
  RAISE NOTICE '6. Only super admins can delete profiles';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Apenas 6 policies devem estar ativas!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- VERIFICAR POLICIES RESTANTES
-- ============================================================================

SELECT 
  policyname,
  cmd,
  CASE 
    WHEN policyname IN (
      'Super admins can view all profiles',
      'Users can view own profile',
      'Only super admins can insert profiles',
      'Super admins can update any profile',
      'Users can update own profile',
      'Only super admins can delete profiles'
    ) THEN '✅ Correta'
    ELSE '⚠️  Antiga (remover manualmente)'
  END as status
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
