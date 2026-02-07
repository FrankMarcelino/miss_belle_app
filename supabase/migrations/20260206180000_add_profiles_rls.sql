-- ============================================================================
-- MIGRATION: RLS POLICIES PARA PROFILES
-- Data: 2026-02-06
-- Descrição: Adicionar Row Level Security para tabela profiles
-- ============================================================================

/*
  Este migration cria policies para controlar acesso à tabela profiles:
  
  REGRAS:
  1. Super admins podem ver todos os profiles
  2. Users podem ver apenas seu próprio profile
  3. Apenas super admins podem inserir novos profiles
  4. Super admins podem atualizar qualquer profile
  5. Users podem atualizar apenas seu próprio profile (sem mudar role)
  6. Apenas super admins podem deletar profiles
  7. Super admins NÃO podem deletar a si mesmos
*/

-- ============================================================================
-- HABILITAR RLS
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- LIMPAR POLICIES EXISTENTES (se houver)
-- ============================================================================

DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Only super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Only super admins can delete profiles" ON profiles;

-- ============================================================================
-- POLICIES: SELECT (Visualização)
-- ============================================================================

-- Policy 1: Super admins podem ver todos os profiles
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = true
    )
  );

-- Policy 2: Users podem ver apenas seu próprio profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================================================
-- POLICIES: INSERT (Criação)
-- ============================================================================

-- Policy 3: Apenas super admins podem inserir novos profiles
CREATE POLICY "Only super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = true
    )
  );

-- ============================================================================
-- POLICIES: UPDATE (Atualização)
-- ============================================================================

-- Policy 4: Super admins podem atualizar qualquer profile
CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = true
    )
  );

-- Policy 5: Users podem atualizar apenas seu próprio profile
-- (mas não podem mudar o role)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Garantir que não está mudando o próprio role
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- POLICIES: DELETE (Deleção)
-- ============================================================================

-- Policy 6: Apenas super admins podem deletar profiles
-- IMPORTANTE: Super admin NÃO pode deletar a si mesmo
CREATE POLICY "Only super admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    -- Não pode deletar a si mesmo
    id != auth.uid()
    -- Apenas se for super admin ativo
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = true
    )
  );

-- ============================================================================
-- VALIDAÇÕES E MENSAGENS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ RLS Policies criadas com sucesso para profiles!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policies ativas:';
  RAISE NOTICE '1. Super admins podem ver todos os profiles';
  RAISE NOTICE '2. Users podem ver apenas seu próprio profile';
  RAISE NOTICE '3. Apenas super admins podem inserir profiles';
  RAISE NOTICE '4. Super admins podem atualizar qualquer profile';
  RAISE NOTICE '5. Users podem atualizar apenas seu profile (sem mudar role)';
  RAISE NOTICE '6. Apenas super admins podem deletar profiles';
  RAISE NOTICE '   ⚠️  Super admins NÃO podem se deletar';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Row Level Security HABILITADO em profiles';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- VERIFICAÇÃO: Contar policies criadas
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
