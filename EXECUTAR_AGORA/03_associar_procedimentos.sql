-- ============================================================================
-- ASSOCIAR PROCEDIMENTOS AOS PROFISSIONAIS
-- Data: 2026-02-06
-- ============================================================================

/*
  IMPORTANTE: Execute este script DEPOIS de criar os usuários no Supabase Auth!
  
  Se os usuários ainda não foram criados, faça assim:
  1. Vá em: Authentication → Users → Add User
  2. Crie cada usuário:
     - anapaulaalmeida@missabelle.com (senha: Amin123)
     - sefora@missabelle.com (senha: Amin123)
     - thais@missabelle.com (senha: Amin123)
  3. Depois execute este script
*/

DO $$
DECLARE
  ana_paula_id uuid;
  sefora_id uuid;
  thais_id uuid;
  ana_count integer;
  sefora_count integer;
  thais_count integer;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Buscando profissionais...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

  -- Buscar IDs dos profissionais por email
  SELECT id INTO ana_paula_id 
  FROM profiles 
  WHERE email = 'anapaulaalmeida@missabelle.com';
  
  SELECT id INTO sefora_id 
  FROM profiles 
  WHERE email = 'sefora@missabelle.com';
  
  SELECT id INTO thais_id 
  FROM profiles 
  WHERE email = 'thais@missabelle.com';

  -- Verificar quais foram encontrados
  IF ana_paula_id IS NULL THEN
    RAISE WARNING '⚠️  Ana Paula não encontrada. Crie o usuário primeiro.';
  ELSE
    RAISE NOTICE '✅ Ana Paula encontrada: %', ana_paula_id;
  END IF;
  
  IF sefora_id IS NULL THEN
    RAISE WARNING '⚠️  Sefora não encontrada. Crie o usuário primeiro.';
  ELSE
    RAISE NOTICE '✅ Sefora encontrada: %', sefora_id;
  END IF;
  
  IF thais_id IS NULL THEN
    RAISE WARNING '⚠️  Thais não encontrada. Crie o usuário primeiro.';
  ELSE
    RAISE NOTICE '✅ Thais encontrada: %', thais_id;
  END IF;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Criando associações...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

  -- ============================================================================
  -- Ana Paula Almeida Santana - Estética Facial + Cílios
  -- ============================================================================
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
      'Manutenção da Micro (6+ meses)',
      'Manutenção Geral',
      'Micro-labial',
      'Micropigmentação',
      'Pintura Sobrancelhas - Henna',
      'Retoque da Micro',
      'Retoque da Micro-labial',
      'Extensão de Cílios'
    )
    ON CONFLICT (professional_id, procedure_id) DO NOTHING;
    
    GET DIAGNOSTICS ana_count = ROW_COUNT;
    RAISE NOTICE '✅ Ana Paula: % procedimentos associados', ana_count;
  END IF;

  -- ============================================================================
  -- Sefora - Maquiagem
  -- ============================================================================
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
    
    GET DIAGNOSTICS sefora_count = ROW_COUNT;
    RAISE NOTICE '✅ Sefora: % procedimentos associados', sefora_count;
  END IF;

  -- ============================================================================
  -- Thais - Cabelo
  -- ============================================================================
  IF thais_id IS NOT NULL THEN
    INSERT INTO professional_procedures (professional_id, procedure_id)
    SELECT 
      thais_id,
      id
    FROM procedures
    WHERE name IN (
      'Corte de Cabelo',
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
    
    GET DIAGNOSTICS thais_count = ROW_COUNT;
    RAISE NOTICE '✅ Thais: % procedimentos associados', thais_count;
  END IF;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ ASSOCIAÇÕES CONCLUÍDAS!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

END $$;

-- ============================================================================
-- VALIDAÇÃO: Ver resultado final
-- ============================================================================

SELECT 
  prof.full_name as profissional,
  prof.email,
  prof.role,
  COUNT(pp.id) as total_procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
WHERE prof.is_active = true
GROUP BY prof.id, prof.full_name, prof.email, prof.role
ORDER BY prof.full_name;

-- Ver detalhes de cada profissional
SELECT 
  prof.full_name as profissional,
  proc.name as procedimento,
  proc.duration_minutes || ' min' as duracao,
  'R$ ' || proc.default_price as preco
FROM profiles prof
JOIN professional_procedures pp ON pp.professional_id = prof.id
JOIN procedures proc ON proc.id = pp.procedure_id
WHERE prof.is_active = true
ORDER BY prof.full_name, proc.name;
