-- Migration: Add Professional-Procedure Association
-- Data: 2026-02-06
-- Objetivo: Criar relacionamento N:N entre profissionais e procedimentos
--           Cada profissional pode realizar múltiplos procedimentos
--           Cada procedimento pode ser realizado por múltiplos profissionais

-- ============================================================================
-- Criar tabela de relacionamento N:N
-- ============================================================================

CREATE TABLE IF NOT EXISTS professional_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  
  -- Constraint única: um profissional não pode ter o mesmo procedimento duplicado
  CONSTRAINT professional_procedures_unique UNIQUE (professional_id, procedure_id)
);

-- Criar índices para melhorar performance de queries
CREATE INDEX idx_professional_procedures_professional 
  ON professional_procedures(professional_id);
  
CREATE INDEX idx_professional_procedures_procedure 
  ON professional_procedures(procedure_id);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE professional_procedures ENABLE ROW LEVEL SECURITY;

-- Política: Todos os usuários autenticados podem ver as associações
-- (necessário para filtrar procedimentos ao criar agendamento)
CREATE POLICY "Authenticated users can view professional procedures"
  ON professional_procedures FOR SELECT
  TO authenticated
  USING (true);

-- Política: Apenas super_admin pode criar associações
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

-- Política: Apenas super_admin pode deletar associações
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
-- Função helper: Obter procedimentos de um profissional
-- ============================================================================

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

-- Grant execute para usuários autenticados
GRANT EXECUTE ON FUNCTION get_professional_procedures(uuid) TO authenticated;

-- ============================================================================
-- Comentários
-- ============================================================================

COMMENT ON TABLE professional_procedures IS 
  'Tabela de relacionamento N:N entre profissionais e procedimentos. Define quais procedimentos cada profissional pode realizar.';

COMMENT ON COLUMN professional_procedures.professional_id IS 
  'ID do profissional que pode realizar o procedimento';

COMMENT ON COLUMN professional_procedures.procedure_id IS 
  'ID do procedimento que o profissional pode realizar';

COMMENT ON FUNCTION get_professional_procedures(uuid) IS 
  'Retorna lista de procedimentos que um profissional específico pode realizar';
