-- ============================================================================
-- CRIAÇÃO DE PROCEDIMENTOS REAIS - MISS BELLE APP
-- Data: 2026-02-06
-- ============================================================================

/*
  Este script cria os procedimentos reais baseados nos dados fornecidos.
  Pode ser executado independente de ter ou não os usuários criados.
  
  As associações profissional-procedimento serão feitas depois que os
  usuários forem criados.
*/

-- ============================================================================
-- VERIFICAR SE TABELA TEM CONSTRAINT UNIQUE EM NAME
-- ============================================================================

-- Se a tabela procedures NÃO tem unique constraint em name, adicionar:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'procedures_name_key'
  ) THEN
    ALTER TABLE procedures ADD CONSTRAINT procedures_name_key UNIQUE (name);
    RAISE NOTICE '✅ Constraint UNIQUE adicionada em procedures.name';
  ELSE
    RAISE NOTICE '✅ Constraint UNIQUE já existe em procedures.name';
  END IF;
END $$;

-- ============================================================================
-- LIMPAR DADOS DE TESTE ANTIGOS
-- ============================================================================

-- Remover procedimentos de teste (IDs fixos do seed de teste)
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
-- PROCEDIMENTOS: ANA PAULA ALMEIDA SANTANA (Estética Facial)
-- ============================================================================

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

-- ============================================================================
-- PROCEDIMENTOS: SEFORA (Maquiagem)
-- ============================================================================

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

-- ============================================================================
-- PROCEDIMENTOS: THAIS (Cabelo)
-- ============================================================================

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
-- MENSAGEM FINAL
-- ============================================================================

DO $$
DECLARE
  total_procs integer;
BEGIN
  SELECT COUNT(*) INTO total_procs FROM procedures WHERE is_active = true;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Procedimentos criados com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'Total de procedimentos ativos: %', total_procs;
  RAISE NOTICE '';
  RAISE NOTICE '📋 Distribuição por categoria:';
  RAISE NOTICE '• Ana Paula: 13 procedimentos (Estética Facial)';
  RAISE NOTICE '• Sefora: 6 procedimentos (Maquiagem)';
  RAISE NOTICE '• Thais: 10 procedimentos (Cabelo)';
  RAISE NOTICE '';
  RAISE NOTICE '🔄 PRÓXIMO PASSO:';
  RAISE NOTICE '1. Crie os 3 usuários no Supabase Auth:';
  RAISE NOTICE '   - anapaulaalmeida@missabelle.com';
  RAISE NOTICE '   - sefora@missabelle.com';
  RAISE NOTICE '   - thais@missabelle.com';
  RAISE NOTICE '   Senha: Amin123';
  RAISE NOTICE '';
  RAISE NOTICE '2. Depois execute: 03_associar_procedimentos.sql';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
