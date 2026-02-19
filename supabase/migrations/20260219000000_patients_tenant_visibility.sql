-- ============================================================================
-- MIGRATION: Pacientes visíveis para todos os usuários do tenant
-- Pacientes pertencem à clínica (tenant), não ao profissional individual.
-- ============================================================================

DROP POLICY IF EXISTS "User manages own patients" ON patients;

CREATE POLICY "Tenant users manage patients" ON patients
  FOR ALL TO authenticated
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
