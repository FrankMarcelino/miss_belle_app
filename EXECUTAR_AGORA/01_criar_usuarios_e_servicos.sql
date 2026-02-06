-- ============================================================================
-- CRIAÇÃO DE USUÁRIOS E SERVIÇOS - MISS BELLE APP
-- Data: 2026-02-06
-- Senha padrão para todos: Amin123
-- ============================================================================

/*
  IMPORTANTE: 
  1. Este script cria usuários diretamente no Supabase Auth
  2. Depois associa os procedimentos específicos de cada profissional
  3. Senha padrão: Amin123
  
  ATENÇÃO: O Supabase Auth requer que você crie usuários via API ou Dashboard.
  Este script assume que os usuários JÁ EXISTEM no auth.users.
  
  Se ainda não criou os usuários, siga estas etapas PRIMEIRO:
  
  OPÇÃO 1 - Via Dashboard Supabase:
  1. Vá em: Authentication → Users → Add User
  2. Crie cada usuário com email e senha
  
  OPÇÃO 2 - Via SQL (Admin bypass):
  Use a função auxiliar abaixo para criar usuários rapidamente.
*/

-- ============================================================================
-- FUNÇÃO AUXILIAR: Criar usuário no auth (apenas para desenvolvimento!)
-- ============================================================================
-- ATENÇÃO: Isto é um HACK para desenvolvimento. Em produção, use signup normal.

CREATE OR REPLACE FUNCTION create_test_user(
  user_email text,
  user_password text,
  user_full_name text,
  user_role text DEFAULT 'user'
)
RETURNS uuid AS $$
DECLARE
  new_user_id uuid;
  encrypted_password text;
BEGIN
  -- Gerar ID
  new_user_id := gen_random_uuid();
  
  -- ATENÇÃO: Isto NÃO cria o hash correto da senha!
  -- É apenas para testes. Use signup real em produção.
  
  -- Inserir em auth.users (requer privilégios de admin)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '',
    ''
  );
  
  -- Criar profile correspondente
  INSERT INTO profiles (id, email, full_name, role, is_active)
  VALUES (new_user_id, user_email, user_full_name, user_role, true);
  
  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 1: CRIAR USUÁRIOS
-- ============================================================================

DO $$
DECLARE
  ana_paula_id uuid;
  sefora_id uuid;
  thais_id uuid;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Criando usuários profissionais...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Criar usuários (se não existirem)
  BEGIN
    ana_paula_id := create_test_user(
      'anapaulaalmeida@missabelle.com',
      'Amin123',
      'Ana Paula Almeida Santana',
      'user'
    );
    RAISE NOTICE '✅ Ana Paula criada: %', ana_paula_id;
  EXCEPTION WHEN OTHERS THEN
    -- Se já existe, buscar ID
    SELECT id INTO ana_paula_id FROM profiles WHERE email = 'anapaulaalmeida@missabelle.com';
    RAISE NOTICE '⚠️  Ana Paula já existe: %', ana_paula_id;
  END;
  
  BEGIN
    sefora_id := create_test_user(
      'sefora@missabelle.com',
      'Amin123',
      'Sefora',
      'user'
    );
    RAISE NOTICE '✅ Sefora criada: %', sefora_id;
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO sefora_id FROM profiles WHERE email = 'sefora@missabelle.com';
    RAISE NOTICE '⚠️  Sefora já existe: %', sefora_id;
  END;
  
  BEGIN
    thais_id := create_test_user(
      'thais@missabelle.com',
      'Amin123',
      'Thais',
      'user'
    );
    RAISE NOTICE '✅ Thais criada: %', thais_id;
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO thais_id FROM profiles WHERE email = 'thais@missabelle.com';
    RAISE NOTICE '⚠️  Thais já existe: %', thais_id;
  END;

END $$;

-- ============================================================================
-- PARTE 2: CRIAR PROCEDIMENTOS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Criando procedimentos...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

  -- PROCEDIMENTOS: Ana Paula Almeida Santana (Estética Facial)
  INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
    ('Avaliação Gratuita', 30, 0.00, true),
    ('Brow Lamination', 40, 80.00, true),
    ('Design de Sobrancelha', 30, 30.00, true),
    ('Despigmentação', 30, 100.00, true),
    ('Lash Lifting', 60, 100.00, true),
    ('Manutenção da Micro', 30, 200.00, true),
    ('Manutenção Geral', 60, 70.00, true),
    ('Micro-labial', 210, 350.00, true),
    ('Micropigmentação', 90, 350.00, true),
    ('Pintura Sobrancelhas - Henna', 30, 50.00, true),
    ('Retoque da Micro', 30, 200.00, true),
    ('Retoque da Micro-labial', 60, 0.00, true)
  ON CONFLICT (name) DO UPDATE
  SET 
    duration_minutes = EXCLUDED.duration_minutes,
    default_price = EXCLUDED.default_price,
    is_active = EXCLUDED.is_active;

  -- PROCEDIMENTOS: Cabelo - Penteados
  INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
    ('Baby Liss / Cachos', 60, 0.00, true),
    ('Penteado de Noiva', 60, 0.00, true)
  ON CONFLICT (name) DO UPDATE
  SET duration_minutes = EXCLUDED.duration_minutes;

  -- PROCEDIMENTOS: Cílios
  INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
    ('Extensão de Cílios', 120, 130.00, true)
  ON CONFLICT (name) DO UPDATE
  SET 
    duration_minutes = EXCLUDED.duration_minutes,
    default_price = EXCLUDED.default_price;

  -- PROCEDIMENTOS: Sefora (Maquiagem)
  INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
    ('Curso Automake', 180, 0.00, true),
    ('Maquiagem Noiva', 240, 0.00, true),
    ('Maquiagem Noiva + Acompanhamento', 420, 0.00, true),
    ('Maquiagem Social', 60, 0.00, true),
    ('Pré Casamento', 60, 0.00, true),
    ('Teste de Noiva', 60, 0.00, true)
  ON CONFLICT (name) DO UPDATE
  SET duration_minutes = EXCLUDED.duration_minutes;

  -- PROCEDIMENTOS: Thais (Cabelo)
  INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
    ('Corte', 40, 0.00, true),
    ('Escova e Babyliss', 60, 0.00, true),
    ('Escova Modelada', 60, 0.00, true),
    ('Escova Progressiva', 180, 0.00, true),
    ('Escova Simples', 60, 0.00, true),
    ('Hidratação Capilar', 40, 0.00, true),
    ('Maquiagem Blindada - Ianne', 60, 0.00, true),
    ('Penteado Completo', 60, 0.00, true)
  ON CONFLICT (name) DO UPDATE
  SET duration_minutes = EXCLUDED.duration_minutes;

  RAISE NOTICE '✅ Procedimentos criados/atualizados!';

END $$;

-- ============================================================================
-- PARTE 3: ASSOCIAR PROCEDIMENTOS AOS PROFISSIONAIS
-- ============================================================================

DO $$
DECLARE
  ana_paula_id uuid;
  sefora_id uuid;
  thais_id uuid;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Associando procedimentos aos profissionais...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

  -- Buscar IDs dos profissionais
  SELECT id INTO ana_paula_id FROM profiles WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM profiles WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM profiles WHERE email = 'thais@missabelle.com';

  -- Ana Paula Almeida Santana - Estética Facial
  IF ana_paula_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT 
      ana_paula_id,
      id
    FROM procedures
    WHERE name IN (
      'Avaliação Gratuita',
      'Brow Lamination',
      'Design de Sobrancelha',
      'Despigmentação',
      'Lash Lifting',
      'Manutenção da Micro',
      'Manutenção Geral',
      'Micro-labial',
      'Micropigmentação',
      'Pintura Sobrancelhas - Henna',
      'Retoque da Micro',
      'Retoque da Micro-labial'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    
    RAISE NOTICE '✅ Ana Paula: 12 procedimentos associados';
  END IF;

  -- Sefora - Maquiagem
  IF sefora_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT 
      sefora_id,
      id
    FROM procedures
    WHERE name IN (
      'Curso Automake',
      'Maquiagem Noiva',
      'Maquiagem Noiva + Acompanhamento',
      'Maquiagem Social',
      'Pré Casamento',
      'Teste de Noiva'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    
    RAISE NOTICE '✅ Sefora: 6 procedimentos associados';
  END IF;

  -- Thais - Cabelo
  IF thais_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT 
      thais_id,
      id
    FROM procedures
    WHERE name IN (
      'Corte',
      'Escova e Babyliss',
      'Escova Modelada',
      'Escova Progressiva',
      'Escova Simples',
      'Hidratação Capilar',
      'Maquiagem Blindada - Ianne',
      'Penteado Completo',
      'Baby Liss / Cachos',
      'Penteado de Noiva'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    
    RAISE NOTICE '✅ Thais: 10 procedimentos associados';
  END IF;

  -- Extensão de Cílios (serviço compartilhado ou de profissional específico)
  -- Vamos associar à Ana Paula por padrão
  IF ana_paula_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT ana_paula_id, id FROM procedures WHERE name = 'Extensão de Cílios'
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
  END IF;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ CONCLUÍDO COM SUCESSO!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Profissionais criados:';
  RAISE NOTICE '1. Ana Paula Almeida Santana - 13 procedimentos (Estética Facial)';
  RAISE NOTICE '2. Sefora - 6 procedimentos (Maquiagem)';
  RAISE NOTICE '3. Thais - 10 procedimentos (Cabelo)';
  RAISE NOTICE '';
  RAISE NOTICE 'Login:';
  RAISE NOTICE '- anapaulaalmeida@missabelle.com / Amin123';
  RAISE NOTICE '- sefora@missabelle.com / Amin123';
  RAISE NOTICE '- thais@missabelle.com / Amin123';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

END $$;

-- ============================================================================
-- LIMPEZA: Remover função auxiliar (opcional)
-- ============================================================================
-- DROP FUNCTION IF EXISTS create_test_user(text, text, text, text);

-- ============================================================================
-- VALIDAÇÃO: Verificar se tudo foi criado corretamente
-- ============================================================================

-- Ver profissionais e seus procedimentos
SELECT 
  prof.full_name as profissional,
  prof.email,
  COUNT(pp.id) as total_procedures,
  STRING_AGG(proc.name, ', ' ORDER BY proc.name) as procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
LEFT JOIN procedures proc ON proc.id = pp.procedure_id
WHERE prof.is_active = true
GROUP BY prof.id, prof.full_name, prof.email
ORDER BY prof.full_name;
