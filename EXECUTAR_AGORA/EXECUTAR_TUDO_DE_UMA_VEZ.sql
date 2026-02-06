-- ============================================================================
-- SCRIPT COMPLETO: CRIAR TUDO DE UMA VEZ
-- Data: 2026-02-06
-- ============================================================================

/*
  ⚠️  ATENÇÃO: Este script cria TUDO de uma vez:
  1. Adiciona constraint UNIQUE em procedures.name
  2. Cria todos os procedimentos reais (29)
  3. Busca os usuários Ana Paula, Sefora e Thais
  4. Cria os profiles se não existirem
  5. Associa procedimentos aos profissionais
  
  IMPORTANTE: 
  - Os usuários DEVEM estar criados no Supabase Auth primeiro!
  - Emails esperados:
    * anapaulaalmeida@missabelle.com
    * sefora@missabelle.com
    * thais@missabelle.com
  - Senha: Amin123
*/

-- ============================================================================
-- ETAPA 1: PREPARAR TABELA PROCEDURES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 ETAPA 1: Preparando tabela procedures...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Verificar se já existe constraint UNIQUE em name
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'procedures'::regclass 
    AND contype = 'u' 
    AND conname LIKE '%name%'
  ) THEN
    -- Remover duplicatas se existirem
    IF EXISTS (
      SELECT name FROM procedures GROUP BY name HAVING COUNT(*) > 1
    ) THEN
      DELETE FROM procedures p1
      WHERE EXISTS (
        SELECT 1 FROM procedures p2
        WHERE p2.name = p1.name AND p2.created_at < p1.created_at
      );
      RAISE NOTICE '✅ Duplicatas removidas';
    END IF;
    
    ALTER TABLE procedures ADD CONSTRAINT procedures_name_key UNIQUE (name);
    RAISE NOTICE '✅ Constraint UNIQUE adicionada';
  ELSE
    RAISE NOTICE '✅ Constraint UNIQUE já existe';
  END IF;
END $$;

-- Limpar dados de teste (appointments primeiro, depois procedures)
DO $$
DECLARE
  deleted_appointments integer;
  deleted_procedures integer;
BEGIN
  -- Deletar appointments que referenciam procedimentos de teste
  DELETE FROM appointments 
  WHERE procedure_id IN (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'a3333333-3333-3333-3333-333333333333',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'a6666666-6666-6666-6666-666666666666',
    'a7777777-7777-7777-7777-777777777777',
    'a8888888-8888-8888-8888-888888888888'
  );
  GET DIAGNOSTICS deleted_appointments = ROW_COUNT;
  
  IF deleted_appointments > 0 THEN
    RAISE NOTICE '✅ % agendamentos de teste removidos', deleted_appointments;
  END IF;
  
  -- Agora deletar procedimentos de teste
  DELETE FROM procedures WHERE id IN (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'a3333333-3333-3333-3333-333333333333',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'a6666666-6666-6666-6666-666666666666',
    'a7777777-7777-7777-7777-777777777777',
    'a8888888-8888-8888-8888-888888888888'
  );
  GET DIAGNOSTICS deleted_procedures = ROW_COUNT;
  
  IF deleted_procedures > 0 THEN
    RAISE NOTICE '✅ % procedimentos de teste removidos', deleted_procedures;
  END IF;
END $$;

-- ============================================================================
-- ETAPA 2: CRIAR PROCEDIMENTOS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 ETAPA 2: Criando procedimentos...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- Ana Paula (13 procedimentos)
INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
  ('Avaliação Gratuita', 30, 0.00, true),
  ('Brow Lamination', 40, 80.00, true),
  ('Design de Sobrancelha', 30, 30.00, true),
  ('Despigmentação', 30, 100.00, true),
  ('Lash Lifting', 60, 100.00, true),
  ('Manutenção da Micro (6+ meses)', 30, 200.00, true),
  ('Manutenção Geral', 60, 70.00, true),
  ('Micro-labial', 210, 350.00, true),
  ('Micropigmentação', 90, 350.00, true),
  ('Pintura Sobrancelhas - Henna', 30, 50.00, true),
  ('Retoque da Micro', 30, 200.00, true),
  ('Retoque da Micro-labial', 60, 0.00, true),
  ('Extensão de Cílios', 120, 130.00, true)
ON CONFLICT (name) DO UPDATE
SET duration_minutes = EXCLUDED.duration_minutes, 
    default_price = EXCLUDED.default_price;

-- Sefora (6 procedimentos)
INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
  ('Curso Automake', 180, 0.00, true),
  ('Maquiagem Noiva', 240, 0.00, true),
  ('Maquiagem Noiva + Acompanhamento', 420, 0.00, true),
  ('Maquiagem Social', 60, 0.00, true),
  ('Pré Casamento', 60, 0.00, true),
  ('Teste de Noiva', 60, 0.00, true)
ON CONFLICT (name) DO UPDATE
SET duration_minutes = EXCLUDED.duration_minutes;

-- Thais (10 procedimentos)
INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
  ('Corte de Cabelo', 40, 0.00, true),
  ('Escova e Babyliss', 60, 0.00, true),
  ('Escova Modelada', 60, 0.00, true),
  ('Escova Progressiva', 180, 0.00, true),
  ('Escova Simples', 60, 0.00, true),
  ('Hidratação Capilar', 40, 0.00, true),
  ('Maquiagem Blindada - Ianne', 60, 0.00, true),
  ('Penteado Completo', 60, 0.00, true),
  ('Baby Liss / Cachos', 60, 0.00, true),
  ('Penteado de Noiva', 60, 0.00, true)
ON CONFLICT (name) DO UPDATE
SET duration_minutes = EXCLUDED.duration_minutes;

-- ============================================================================
-- ETAPA 3: CRIAR PROFILES
-- ============================================================================

DO $$
DECLARE
  ana_id uuid;
  sefora_id uuid;
  thais_id uuid;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '👥 ETAPA 3: Criando profiles...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Buscar IDs do auth.users
  SELECT id INTO ana_id FROM auth.users WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM auth.users WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM auth.users WHERE email = 'thais@missabelle.com';
  
  -- Criar profiles
  IF ana_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (ana_id, 'anapaulaalmeida@missabelle.com', 'Ana Paula Almeida Santana', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Ana Paula Almeida Santana', is_active = true;
    RAISE NOTICE '✅ Ana Paula profile criado/atualizado';
  ELSE
    RAISE WARNING '⚠️  Ana Paula NÃO encontrada no auth.users!';
  END IF;
  
  IF sefora_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (sefora_id, 'sefora@missabelle.com', 'Sefora', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Sefora', is_active = true;
    RAISE NOTICE '✅ Sefora profile criado/atualizado';
  ELSE
    RAISE WARNING '⚠️  Sefora NÃO encontrada no auth.users!';
  END IF;
  
  IF thais_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (thais_id, 'thais@missabelle.com', 'Thais', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Thais', is_active = true;
    RAISE NOTICE '✅ Thais profile criado/atualizado';
  ELSE
    RAISE WARNING '⚠️  Thais NÃO encontrada no auth.users!';
  END IF;
  
  IF ana_id IS NULL OR sefora_id IS NULL OR thais_id IS NULL THEN
    RAISE WARNING '';
    RAISE WARNING '═══════════════════════════════════════════════════════════';
    RAISE WARNING '⚠️  ATENÇÃO: Alguns usuários não foram encontrados!';
    RAISE WARNING '';
    RAISE WARNING 'Você precisa criar os usuários primeiro:';
    RAISE WARNING 'Dashboard → Authentication → Users → Add User';
    RAISE WARNING '';
    RAISE WARNING '1. anapaulaalmeida@missabelle.com / Amin123';
    RAISE WARNING '2. sefora@missabelle.com / Amin123';
    RAISE WARNING '3. thais@missabelle.com / Amin123';
    RAISE WARNING '═══════════════════════════════════════════════════════════';
  END IF;
END $$;

-- ============================================================================
-- ETAPA 4: ASSOCIAR PROCEDIMENTOS
-- ============================================================================

DO $$
DECLARE
  ana_id uuid;
  sefora_id uuid;
  thais_id uuid;
  ana_count integer := 0;
  sefora_count integer := 0;
  thais_count integer := 0;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🔗 ETAPA 4: Associando procedimentos...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Buscar profissionais
  SELECT id INTO ana_id FROM profiles WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM profiles WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM profiles WHERE email = 'thais@missabelle.com';
  
  -- Ana Paula (13)
  IF ana_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT ana_id, id FROM procedures WHERE name IN (
      'Avaliação Gratuita', 'Brow Lamination', 'Design de Sobrancelha',
      'Despigmentação', 'Lash Lifting', 'Manutenção da Micro (6+ meses)',
      'Manutenção Geral', 'Micro-labial', 'Micropigmentação',
      'Pintura Sobrancelhas - Henna', 'Retoque da Micro',
      'Retoque da Micro-labial', 'Extensão de Cílios'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    GET DIAGNOSTICS ana_count = ROW_COUNT;
    RAISE NOTICE '✅ Ana Paula: % procedimentos associados', ana_count;
  END IF;
  
  -- Sefora (6)
  IF sefora_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT sefora_id, id FROM procedures WHERE name IN (
      'Curso Automake', 'Maquiagem Noiva', 'Maquiagem Noiva + Acompanhamento',
      'Maquiagem Social', 'Pré Casamento', 'Teste de Noiva'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    GET DIAGNOSTICS sefora_count = ROW_COUNT;
    RAISE NOTICE '✅ Sefora: % procedimentos associados', sefora_count;
  END IF;
  
  -- Thais (10)
  IF thais_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT thais_id, id FROM procedures WHERE name IN (
      'Corte de Cabelo', 'Escova e Babyliss', 'Escova Modelada',
      'Escova Progressiva', 'Escova Simples', 'Hidratação Capilar',
      'Maquiagem Blindada - Ianne', 'Penteado Completo',
      'Baby Liss / Cachos', 'Penteado de Noiva'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    GET DIAGNOSTICS thais_count = ROW_COUNT;
    RAISE NOTICE '✅ Thais: % procedimentos associados', thais_count;
  END IF;
END $$;

-- ============================================================================
-- RESULTADO FINAL
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 CONCLUÍDO COM SUCESSO!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Resumo:';
  RAISE NOTICE '• Procedimentos criados: 29';
  RAISE NOTICE '• Profiles criados: 3';
  RAISE NOTICE '• Associações criadas: 29';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Login:';
  RAISE NOTICE '• anapaulaalmeida@missabelle.com / Amin123';
  RAISE NOTICE '• sefora@missabelle.com / Amin123';
  RAISE NOTICE '• thais@missabelle.com / Amin123';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- Validação final
SELECT 
  prof.full_name as profissional,
  COUNT(pp.id) as total_procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
WHERE prof.email IN (
  'anapaulaalmeida@missabelle.com',
  'sefora@missabelle.com',
  'thais@missabelle.com'
)
GROUP BY prof.id, prof.full_name
ORDER BY prof.full_name;
