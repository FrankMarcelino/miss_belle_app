-- ============================================================================
-- MIGRATION: Revisão das Categorias de Despesas
-- Data: 2026-02-18
-- Descrição: Categorias redesenhadas para refletir melhor a realidade
--            do dia a dia de um salão de beleza
--
-- Mapeamento (estado anterior → novo):
--   utilidades    → energia   (água + luz — contas fixas do imóvel)
--   higiene       → limpeza   (faxineira, dedetização, jardineiro, descartáveis)
--   infraestrutura→ obras     (reformas, reparos, melhorias)
--   hospitalidade → mimos     (café, comidas, mimos para clientes)
--   material      → insumos   (produtos usados nos atendimentos)
--   (nova)        → internet  (internet, telefone, streaming)
--   aluguel, decoracao, equipamentos, marketing, outros → sem alteração
-- ============================================================================

-- ============================================================================
-- 1. REMOVER constraint antiga para poder inserir valores novos
-- ============================================================================

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

-- ============================================================================
-- 2. MIGRAR dados existentes para os novos valores
-- ============================================================================

UPDATE expenses SET category = 'energia'  WHERE category = 'utilidades';
UPDATE expenses SET category = 'limpeza'  WHERE category = 'higiene';
UPDATE expenses SET category = 'obras'    WHERE category = 'infraestrutura';
UPDATE expenses SET category = 'mimos'    WHERE category = 'hospitalidade';
UPDATE expenses SET category = 'insumos'  WHERE category = 'material';

-- ============================================================================
-- 3. ADICIONAR novo constraint com as 11 categorias finais
-- ============================================================================

ALTER TABLE expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'aluguel',      -- aluguel do espaço e locações
    'energia',      -- água, luz, gás — contas fixas do imóvel
    'internet',     -- internet, telefone, streaming
    'insumos',      -- produtos consumidos nos atendimentos (tintas, ceras, químicas...)
    'limpeza',      -- faxineira, dedetização, jardineiro, papel, sacos, copos descartáveis
    'decoracao',    -- plantas, quadros, objetos decorativos
    'obras',        -- reformas, reparos e melhorias na infraestrutura
    'mimos',        -- café, água, comidas e mimos para os clientes
    'equipamentos', -- compra ou manutenção de equipamentos e mobiliário
    'marketing',    -- publicidade, redes sociais, impressos, brindes
    'outros'        -- despesas diversas não classificadas
  ));

-- ============================================================================
-- 4. VALIDAR — nenhuma linha pode ter categoria fora da lista
-- ============================================================================

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM expenses
  WHERE category NOT IN (
    'aluguel', 'energia', 'internet', 'insumos', 'limpeza',
    'decoracao', 'obras', 'mimos', 'equipamentos', 'marketing', 'outros'
  );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Migração falhou: % linha(s) com categoria inválida!', invalid_count;
  END IF;

  RAISE NOTICE 'Categorias migradas com sucesso.';
END $$;
