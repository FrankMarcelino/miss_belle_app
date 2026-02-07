-- ============================================================================
-- MIGRATION: CORRIGIR RLS POLICIES - Remover recursão infinita
-- Data: 2026-02-06
-- Descrição: Corrigir policies que causam recursão infinita
-- ============================================================================

/*
  PROBLEMA:
  As policies fazem SELECT na própria tabela profiles dentro das regras,
  causando recursão infinita.
  
  SOLUÇÃO:
  Usar auth.jwt() -> 'user_metadata' ->> 'role' ou criar função helper
  que usa SECURITY DEFINER para bypassar RLS.
*/

-- ============================================================================
-- CRIAR FUNÇÃO HELPER (SECURITY DEFINER)
-- ============================================================================

-- Função para verificar se usuário é super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com permissões do dono (bypass RLS)
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  user_active BOOLEAN;
BEGIN
  -- Buscar role e is_active do usuário atual
  SELECT role, is_active
  INTO user_role, user_active
  FROM profiles
  WHERE id = auth.uid();
  
  -- Retornar true se for super_admin ativo
  RETURN user_role = 'super_admin' AND user_active = true;
END;
$$;

-- ============================================================================
-- DROPAR POLICIES ANTIGAS
-- ============================================================================

DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Only super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Only super admins can delete profiles" ON profiles;

-- ============================================================================
-- RECRIAR POLICIES SEM RECURSÃO
-- ============================================================================

-- Policy 1: Super admins podem ver todos os profiles
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Policy 2: Users podem ver apenas seu próprio profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 3: Apenas super admins podem inserir novos profiles
CREATE POLICY "Only super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

-- Policy 4: Super admins podem atualizar qualquer profile
CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Policy 5: Users podem atualizar apenas seu próprio profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Garantir que não está mudando o próprio role
    AND role = (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Policy 6: Apenas super admins podem deletar profiles
-- IMPORTANTE: Super admin NÃO pode deletar a si mesmo
CREATE POLICY "Only super admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    id != auth.uid()
    AND is_super_admin()
  );

-- ============================================================================
-- GRANT EXECUTE NA FUNÇÃO
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================================================
-- VALIDAÇÕES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ RLS Policies CORRIGIDAS com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Mudanças:';
  RAISE NOTICE '1. Criada função is_super_admin() com SECURITY DEFINER';
  RAISE NOTICE '2. Policies recriadas usando a função (sem recursão)';
  RAISE NOTICE '3. Recursão infinita CORRIGIDA ✅';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policies ativas:';
  RAISE NOTICE '1. Super admins podem ver todos os profiles';
  RAISE NOTICE '2. Users podem ver apenas seu próprio profile';
  RAISE NOTICE '3. Apenas super admins podem inserir profiles';
  RAISE NOTICE '4. Super admins podem atualizar qualquer profile';
  RAISE NOTICE '5. Users podem atualizar apenas seu profile';
  RAISE NOTICE '6. Apenas super admins podem deletar profiles';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Row Level Security ATIVO em profiles';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;
