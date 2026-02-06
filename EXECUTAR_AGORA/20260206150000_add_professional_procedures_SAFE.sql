-- Migration: Add Professional-Procedure Association (SAFE VERSION)
-- Data: 2026-02-06
-- Esta versão pode ser executada múltiplas vezes sem erro

-- ============================================================================
-- 1. Criar tabela de relacionamento N:N
-- ============================================================================

CREATE TABLE IF NOT EXISTS professional_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Adicionar constraint única se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'professional_procedures_unique'
  ) THEN
    ALTER TABLE professional_procedures 
      ADD CONSTRAINT professional_procedures_unique 
      UNIQUE (professional_id, procedure_id);
  END IF;
END $$;

-- ============================================================================
-- 2. Criar índices para melhorar performance
-- ============================================================================

DROP INDEX IF EXISTS idx_professional_procedures_professional;
DROP INDEX IF EXISTS idx_professional_procedures_procedure;

CREATE INDEX idx_professional_procedures_professional 
  ON professional_procedures(professional_id);
  
CREATE INDEX idx_professional_procedures_procedure 
  ON professional_procedures(procedure_id);

-- ============================================================================
-- 3. Row Level Security (RLS)
-- ============================================================================

ALTER TABLE professional_procedures ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas
DROP POLICY IF EXISTS "Authenticated users can view professional procedures" ON professional_procedures;
DROP POLICY IF EXISTS "Super admins can create professional procedures" ON professional_procedures;
DROP POLICY IF EXISTS "Super admins can delete professional procedures" ON professional_procedures;

-- Criar policies
CREATE POLICY "Authenticated users can view professional procedures"
  ON professional_procedures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can create professional procedures"
  ON professional_procedures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can delete professional procedures"
  ON professional_procedures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================================================
-- 4. Função helper
-- ============================================================================

DROP FUNCTION IF EXISTS get_professional_procedures(uuid);

CREATE OR REPLACE FUNCTION get_professional_procedures(p_professional_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  duration_minutes integer,
  default_price numeric,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pr.id,
    pr.name,
    pr.duration_minutes,
    pr.default_price,
    pr.is_active
  FROM procedures pr
  INNER JOIN professional_procedures pp ON pp.procedure_id = pr.id
  WHERE pp.professional_id = p_professional_id
  AND pr.is_active = true
  ORDER BY pr.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_professional_procedures(uuid) TO authenticated;

-- ============================================================================
-- 5. Comentários
-- ============================================================================

COMMENT ON TABLE professional_procedures IS 
  'Tabela de relacionamento N:N entre profissionais e procedimentos. Define quais procedimentos cada profissional pode realizar.';

COMMENT ON COLUMN professional_procedures.professional_id IS 
  'ID do profissional que pode realizar o procedimento';

COMMENT ON COLUMN professional_procedures.procedure_id IS 
  'ID do procedimento que o profissional pode realizar';

COMMENT ON FUNCTION get_professional_procedures(uuid) IS 
  'Retorna lista de procedimentos que um profissional específico pode realizar';

-- ============================================================================
-- Mensagens de sucesso
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration executada com sucesso!';
  RAISE NOTICE '- Tabela professional_procedures criada/verificada';
  RAISE NOTICE '- Índices criados';
  RAISE NOTICE '- RLS policies configuradas';
  RAISE NOTICE '- Função helper criada';
END $$;
