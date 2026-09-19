-- ============================================================================
-- MIGRATION: Atualização das Categorias de Despesas
-- Data: 2026-02-18
-- Descrição: Substituição das categorias genéricas por categorias específicas
--            ao contexto de um salão de beleza
--
-- Mapeamento de categorias antigas → novas:
--   alimentacao  → hospitalidade   (comidas/bebidas para clientes)
--   limpeza      → higiene         (passou a cobrir descartáveis + serviços)
--   (mantidas)   → aluguel, utilidades, material, equipamentos, marketing, outros
--   (novas)      → decoracao, infraestrutura, servicos_terceiros
-- ============================================================================

-- ============================================================================
-- 1. MIGRAR DADOS EXISTENTES antes de alterar o constraint
-- ============================================================================

-- alimentacao → hospitalidade
UPDATE expenses
SET category = 'hospitalidade'
WHERE category = 'alimentacao';

-- limpeza → higiene (agora cobre mais coisas)
UPDATE expenses
SET category = 'higiene'
WHERE category = 'limpeza';

-- ============================================================================
-- 2. ATUALIZAR O CHECK CONSTRAINT da coluna category
-- ============================================================================

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'aluguel',          -- aluguel do espaço e locações
    'utilidades',       -- luz, água, internet, telefone, gás
    'higiene',          -- faxineira, dedetização, jardineiro, papel higiênico,
                        -- papel toalha, sacos de lixo, copos descartáveis, etc.
    'decoracao',        -- itens decorativos, plantas, flores, quadros
    'infraestrutura',   -- reformas, melhorias, reparos, pintura, carpintaria
    'hospitalidade',    -- café, água, comidas e bebidas para clientes
    'material',         -- insumos e produtos profissionais do salão
    'equipamentos',     -- compra ou manutenção de equipamentos e mobiliário
    'marketing',        -- publicidade, redes sociais, impressos, eventos
    'outros'            -- despesas diversas não classificadas
  ));

-- ============================================================================
-- 3. ATUALIZAR DEFAULT para categoria mais genérica
-- ============================================================================

ALTER TABLE expenses
  ALTER COLUMN category SET DEFAULT 'outros';

-- ============================================================================
-- 4. VERIFICAR resultado
-- ============================================================================

-- Garante que não sobrou nenhum valor inválido
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM expenses
  WHERE category NOT IN (
    'aluguel', 'utilidades', 'higiene', 'decoracao', 'infraestrutura',
    'hospitalidade', 'material', 'equipamentos', 'marketing', 'outros'
  );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Ainda existem % linha(s) com categoria inválida!', invalid_count;
  END IF;

  RAISE NOTICE 'Migração de categorias concluída com sucesso.';
END $$;
