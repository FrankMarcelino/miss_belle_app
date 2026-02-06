-- ============================================================================
-- RESETAR SENHAS DOS USUÁRIOS
-- Data: 2026-02-06
-- ============================================================================

/*
  Este script gera o hash correto da senha "Amin123" e atualiza
  os 3 usuários criados anteriormente.
  
  ⚠️  IMPORTANTE:
  Se este script não funcionar, use o Dashboard:
  Authentication → Users → (3 pontinhos) → Reset Password
*/

-- ============================================================================
-- ATIVAR EXTENSÃO PGCRYPTO
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- GERAR HASH DA SENHA
-- ============================================================================

DO $$
DECLARE
  hashed_password text;
  updated_count integer;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🔐 Resetando senhas...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Gerar hash bcrypt da senha "Amin123"
  hashed_password := crypt('Amin123', gen_salt('bf', 10));
  
  RAISE NOTICE 'Hash gerado: %', hashed_password;
  
  -- Atualizar senhas dos 3 usuários
  UPDATE auth.users 
  SET 
    encrypted_password = hashed_password,
    updated_at = NOW()
  WHERE email IN (
    'anapaulaalmeida@missabelle.com',
    'sefora@missabelle.com',
    'thais@missabelle.com'
  );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RAISE NOTICE '✅ % usuários atualizados', updated_count;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 Senhas resetadas com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Credenciais de Login:';
  RAISE NOTICE '• anapaulaalmeida@missabelle.com / Amin123';
  RAISE NOTICE '• sefora@missabelle.com / Amin123';
  RAISE NOTICE '• thais@missabelle.com / Amin123';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Agora tente fazer login na aplicação!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- VERIFICAR USUÁRIOS
-- ============================================================================

SELECT 
  email,
  created_at,
  updated_at,
  email_confirmed_at,
  CASE 
    WHEN email_confirmed_at IS NOT NULL THEN '✅ Confirmado'
    ELSE '⚠️  Não confirmado'
  END as status
FROM auth.users 
WHERE email LIKE '%missabelle.com'
ORDER BY email;
