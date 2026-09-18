-- ============================================================================
-- MIGRATION: Permitir leitura de perfis por todos os usuários autenticados
-- Data: 2026-02-20
-- Descrição: O sistema de despesas precisa exibir os nomes dos responsáveis
--            em cada despesa. Sem esta policy, joins a `profiles` via
--            expense_assignments e expense_splits retornam null para usuários
--            que não são o perfil consultado.
-- ============================================================================

CREATE POLICY "Authenticated users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION: Leitura de perfis liberada para usuários autenticados';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Nova policy adicionada:';
  RAISE NOTICE '   "Authenticated users can view all profiles" ON profiles FOR SELECT';
  RAISE NOTICE '   USING (true)';
  RAISE NOTICE '';
  RAISE NOTICE '   Policies anteriores mantidas (super admin + own profile).';
  RAISE NOTICE '   Impacto: joins a profiles em expense_assignments e expense_splits';
  RAISE NOTICE '   agora retornam full_name corretamente para todos os usuários.';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
