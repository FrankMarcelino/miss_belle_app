-- ============================================================================
-- MIGRATION: Adicionar campo `role` ao retorno de get_active_users()
-- Data: 2026-02-18
-- Descrição: Necessário para que o frontend possa filtrar o super admin
--            da lista de responsáveis quando o usuário comum está criando
--            ou editando uma despesa.
-- ============================================================================

DROP FUNCTION IF EXISTS get_active_users();

CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(id uuid, full_name text, email text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, email, role
  FROM profiles
  WHERE is_active = true
  ORDER BY full_name;
$$;
