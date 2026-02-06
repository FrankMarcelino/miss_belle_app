-- ============================================================================
-- CRIAÇÃO DE PROCEDIMENTOS REAIS - MISS BELLE APP (VERSÃO SAFE)
-- Data: 2026-02-06
-- ============================================================================

/*
  Este script cria os procedimentos reais baseados nos dados fornecidos.
  Versão SAFE: não requer constraint UNIQUE prévia.
*/

-- ============================================================================
-- PARTE 1: ADICIONAR CONSTRAINT UNIQUE (se não existir)
-- ============================================================================

DO $$
BEGIN
  -- Verificar se já existe constraint UNIQUE em name
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'procedures'::regclass 
    AND contype = 'u' 
    AND conname LIKE '%name%'
  ) THEN
    -- Verificar se há duplicatas antes de adicionar constraint
    IF EXISTS (
      SELECT name, COUNT(*) 
      FROM procedures 
      GROUP BY name 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE WARNING '⚠️  Existem nomes duplicados em procedures. Limpando...';
      
      -- Manter apenas o primeiro de cada nome
      DELETE FROM procedures p1
      WHERE EXISTS (
        SELECT 1 FROM procedures p2
        WHERE p2.name = p1.name
        AND p2.created_at < p1.created_at
      );
      
      RAISE NOTICE '✅ Duplicatas removidas';
    END IF;
    
    -- Adicionar constraint UNIQUE
    ALTER TABLE procedures ADD CONSTRAINT procedures_name_key UNIQUE (name);
    RAISE NOTICE '✅ Constraint UNIQUE adicionada em procedures.name';
  ELSE
    RAISE NOTICE '✅ Constraint UNIQUE já existe em procedures.name';
  END IF;
END $$;

-- ============================================================================
-- PARTE 2: LIMPAR DADOS DE TESTE ANTIGOS
-- ============================================================================

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

-- ============================================================================
-- PARTE 3: CRIAR/ATUALIZAR PROCEDIMENTOS
-- ============================================================================

-- PROCEDIMENTOS: Ana Paula Almeida Santana (Estética Facial)
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
SET 
  duration_minutes = EXCLUDED.duration_minutes,
  default_price = EXCLUDED.default_price,
  is_active = EXCLUDED.is_active;

-- PROCEDIMENTOS: Sefora (Maquiagem)
INSERT INTO procedures (name, duration_minutes, default_price, is_active) VALUES
  ('Curso Automake', 180, 0.00, true),
  ('Maquiagem Noiva', 240, 0.00, true),
  ('Maquiagem Noiva + Acompanhamento', 420, 0.00, true),
  ('Maquiagem Social', 60, 0.00, true),
  ('Pré Casamento', 60, 0.00, true),
  ('Teste de Noiva', 60, 0.00, true)
ON CONFLICT (name) DO UPDATE
SET 
  duration_minutes = EXCLUDED.duration_minutes,
  default_price = EXCLUDED.default_price;

-- PROCEDIMENTOS: Thais (Cabelo)
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
SET 
  duration_minutes = EXCLUDED.duration_minutes,
  default_price = EXCLUDED.default_price;

-- ============================================================================
-- PARTE 4: MENSAGEM FINAL
-- ============================================================================

DO $$
DECLARE
  total_procs integer;
  ana_count integer;
  sefora_count integer;
  thais_count integer;
BEGIN
  SELECT COUNT(*) INTO total_procs FROM procedures WHERE is_active = true;
  
  -- Contar por categoria (aproximado)
  SELECT COUNT(*) INTO ana_count FROM procedures WHERE name IN (
    'Avaliação Gratuita', 'Brow Lamination', 'Design de Sobrancelha', 
    'Despigmentação', 'Lash Lifting', 'Manutenção da Micro (6+ meses)', 
    'Manutenção Geral', 'Micro-labial', 'Micropigmentação', 
    'Pintura Sobrancelhas - Henna', 'Retoque da Micro', 
    'Retoque da Micro-labial', 'Extensão de Cílios'
  );
  
  SELECT COUNT(*) INTO sefora_count FROM procedures WHERE name IN (
    'Curso Automake', 'Maquiagem Noiva', 'Maquiagem Noiva + Acompanhamento',
    'Maquiagem Social', 'Pré Casamento', 'Teste de Noiva'
  );
  
  SELECT COUNT(*) INTO thais_count FROM procedures WHERE name IN (
    'Corte de Cabelo', 'Escova e Babyliss', 'Escova Modelada', 
    'Escova Progressiva', 'Escova Simples', 'Hidratação Capilar', 
    'Maquiagem Blindada - Ianne', 'Penteado Completo', 
    'Baby Liss / Cachos', 'Penteado de Noiva'
  );
  
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Procedimentos criados/atualizados com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Total de procedimentos ativos: %', total_procs;
  RAISE NOTICE '';
  RAISE NOTICE '📋 Distribuição por profissional:';
  RAISE NOTICE '• Ana Paula: % procedimentos (Estética Facial + Cílios)', ana_count;
  RAISE NOTICE '• Sefora: % procedimentos (Maquiagem)', sefora_count;
  RAISE NOTICE '• Thais: % procedimentos (Cabelo)', thais_count;
  RAISE NOTICE '';
  RAISE NOTICE '🔄 PRÓXIMOS PASSOS:';
  RAISE NOTICE '1. Crie os 3 usuários no Supabase Auth';
  RAISE NOTICE '2. Execute o script de criação de profiles';
  RAISE NOTICE '3. Execute: 03_associar_procedimentos.sql';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
