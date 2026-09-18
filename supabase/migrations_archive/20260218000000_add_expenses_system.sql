-- ============================================================================
-- MIGRATION: Sistema de Gestão de Despesas
-- Data: 2026-02-18
-- Descrição: Criação das tabelas expenses, expense_assignments e expense_splits
--            com RLS completo, funções auxiliares e triggers
-- ============================================================================

-- ============================================================================
-- 0. LIMPAR POLICIES EXISTENTES (idempotente)
-- ============================================================================

DO $$
DECLARE
  policy_record RECORD;
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['expenses', 'expense_assignments', 'expense_splits']
  LOOP
    FOR policy_record IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_record.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 1. TABELA: expenses
--    Define a despesa (título, valor, tipo, recorrência)
-- ============================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title             varchar(255)  NOT NULL,
  description       text,
  amount            numeric(10,2) NOT NULL CHECK (amount > 0),

  -- 'fixed'    = despesa fixa (aluguel, salário, assinaturas)
  -- 'variable' = despesa variável (manutenção, material, eventual)
  type              varchar(20)   NOT NULL
                    CHECK (type IN ('fixed', 'variable')),

  -- Categoria para agrupamento no dashboard
  category          varchar(50)   NOT NULL DEFAULT 'outros'
                    CHECK (category IN (
                      'aluguel',
                      'utilidades',    -- luz, água, internet, telefone
                      'material',      -- insumos, produtos
                      'marketing',     -- publicidade, redes sociais
                      'equipamentos',  -- compra ou manutenção de equipamentos
                      'limpeza',       -- produtos e serviços de limpeza
                      'alimentacao',   -- café, refeições para equipe
                      'outros'
                    )),

  -- 'once'    = despesa única (sem recorrência)
  -- 'monthly' = mensal
  -- 'yearly'  = anual
  recurrence        varchar(20)   NOT NULL DEFAULT 'once'
                    CHECK (recurrence IN ('once', 'monthly', 'yearly')),

  -- Para recorrência mensal: dia do mês de vencimento (1-28)
  -- Limitado a 28 para evitar problemas com fevereiro
  due_day_of_month  integer       CHECK (due_day_of_month BETWEEN 1 AND 28),

  -- Para despesas únicas e anuais: data exata de vencimento
  due_date          date,

  created_by        uuid          NOT NULL REFERENCES profiles(id),
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  -- Validação de consistência: mensal precisa de dia, único/anual precisa de data
  CONSTRAINT expenses_recurrence_date_check CHECK (
    (recurrence = 'monthly' AND due_day_of_month IS NOT NULL) OR
    (recurrence = 'once'    AND due_date IS NOT NULL) OR
    (recurrence = 'yearly'  AND due_date IS NOT NULL)
  )
);

COMMENT ON TABLE  expenses                    IS 'Definição das despesas fixas e variáveis da clínica';
COMMENT ON COLUMN expenses.type              IS 'fixed = recorrente previsível; variable = eventual/imprevisível';
COMMENT ON COLUMN expenses.recurrence        IS 'once = única; monthly = mensal; yearly = anual';
COMMENT ON COLUMN expenses.due_day_of_month  IS 'Dia do mês de vencimento para despesas mensais (1-28)';
COMMENT ON COLUMN expenses.due_date          IS 'Data exata de vencimento para despesas únicas e anuais';

-- ============================================================================
-- 2. TABELA: expense_assignments
--    Registra quais usuários são responsáveis por cada despesa.
--    Para despesas recorrentes, funciona como template permanente.
--    Para despesas únicas, define quem divide o custo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  uuid        NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (expense_id, user_id)
);

COMMENT ON TABLE expense_assignments IS 'Usuários responsáveis por cada despesa (template permanente para recorrentes)';

-- ============================================================================
-- 3. TABELA: expense_splits
--    Instâncias reais de pagamento: uma linha por (despesa, usuário, período).
--    Para recorrentes: reference_period = 'YYYY-MM'
--    Para únicas: reference_period = NULL
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_splits (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id          uuid          NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id             uuid          NOT NULL REFERENCES profiles(id),

  -- Valor que este usuário deve pagar neste período
  -- Calculado automaticamente: expense.amount / qtd_usuários
  amount_due          numeric(10,2) NOT NULL CHECK (amount_due > 0),

  -- 'YYYY-MM' para recorrentes, NULL para únicos
  reference_period    varchar(7),

  -- Data limite de pagamento desta parcela
  due_date            date,

  -- 'pending' = aguardando pagamento
  -- 'paid'    = pago (paid_at é preenchido automaticamente)
  status              varchar(20)   NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid')),

  paid_at             timestamptz,

  -- URL do comprovante no Supabase Storage
  -- Caminho esperado: expense-proofs/{user_id}/{split_id}.{ext}
  payment_proof_url   text,

  notes               text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  expense_splits                      IS 'Instâncias de pagamento por usuário por período';
COMMENT ON COLUMN expense_splits.reference_period    IS 'Período no formato YYYY-MM (NULL para despesas únicas)';
COMMENT ON COLUMN expense_splits.payment_proof_url   IS 'URL do comprovante de pagamento no Supabase Storage (bucket: expense-proofs)';

-- Unique: evita duplicata para despesas recorrentes (por expense + user + period)
CREATE UNIQUE INDEX IF NOT EXISTS expense_splits_recurring_unique
  ON expense_splits (expense_id, user_id, reference_period)
  WHERE reference_period IS NOT NULL;

-- Unique: evita duplicata para despesas únicas (por expense + user)
CREATE UNIQUE INDEX IF NOT EXISTS expense_splits_once_unique
  ON expense_splits (expense_id, user_id)
  WHERE reference_period IS NULL;

-- ============================================================================
-- 4. ÍNDICES DE PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_expenses_created_by        ON expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_type_active        ON expenses (type, is_active);
CREATE INDEX IF NOT EXISTS idx_expenses_recurrence_active  ON expenses (recurrence, is_active);

CREATE INDEX IF NOT EXISTS idx_expense_assignments_expense ON expense_assignments (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_assignments_user    ON expense_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_expense_splits_user         ON expense_splits (user_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_status       ON expense_splits (status);
CREATE INDEX IF NOT EXISTS idx_expense_splits_period       ON expense_splits (reference_period);
CREATE INDEX IF NOT EXISTS idx_expense_splits_due_date     ON expense_splits (due_date);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense      ON expense_splits (expense_id);

-- ============================================================================
-- 5. TRIGGER: updated_at automático
-- ============================================================================

-- Função genérica (CREATE OR REPLACE: seguro se já existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger em expenses
DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger em expense_splits
DROP TRIGGER IF EXISTS expense_splits_updated_at ON expense_splits;
CREATE TRIGGER expense_splits_updated_at
  BEFORE UPDATE ON expense_splits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. TRIGGER: Gerenciar paid_at automaticamente ao mudar status
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_expense_split_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ao marcar como pago: registrar timestamp se não informado
  IF NEW.status = 'paid' AND OLD.status = 'pending' THEN
    NEW.paid_at = COALESCE(NEW.paid_at, now());
  END IF;

  -- Ao reverter para pendente: limpar timestamp de pagamento
  -- (comprovante é mantido para auditoria)
  IF NEW.status = 'pending' AND OLD.status = 'paid' THEN
    NEW.paid_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_split_payment_trigger ON expense_splits;
CREATE TRIGGER expense_split_payment_trigger
  BEFORE UPDATE ON expense_splits
  FOR EACH ROW EXECUTE FUNCTION handle_expense_split_payment();

-- ============================================================================
-- 7. FUNÇÃO: create_expense_with_assignments
--    Cria uma despesa, suas atribuições e os splits do período atual
--    de forma atômica (tudo em uma transaction).
--
--    Parâmetros:
--      p_title             - Título da despesa
--      p_description       - Descrição (opcional)
--      p_amount            - Valor total
--      p_type              - 'fixed' | 'variable'
--      p_category          - Categoria
--      p_recurrence        - 'once' | 'monthly' | 'yearly'
--      p_user_ids          - Array de UUIDs dos usuários responsáveis
--      p_due_day_of_month  - Dia de vencimento (obrigatório para monthly)
--      p_due_date          - Data de vencimento (obrigatório para once/yearly)
--
--    Retorna: UUID da despesa criada
-- ============================================================================

CREATE OR REPLACE FUNCTION create_expense_with_assignments(
  p_title             varchar,
  p_description       text,
  p_amount            numeric,
  p_type              varchar,
  p_category          varchar,
  p_recurrence        varchar,
  p_user_ids          uuid[],
  p_due_day_of_month  integer DEFAULT NULL,
  p_due_date          date    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id      uuid;
  v_user_id         uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
  v_period          varchar(7);
  v_split_due_date  date;
BEGIN
  -- ── Validações ────────────────────────────────────────────────────────────

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos um usuário deve ser atribuído à despesa';
  END IF;

  IF p_recurrence = 'monthly' AND p_due_day_of_month IS NULL THEN
    RAISE EXCEPTION 'Despesas mensais requerem due_day_of_month';
  END IF;

  IF p_recurrence IN ('once', 'yearly') AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Despesas únicas e anuais requerem due_date';
  END IF;

  -- ── 1. Criar a despesa ────────────────────────────────────────────────────

  INSERT INTO expenses (
    title, description, amount, type, category,
    recurrence, due_day_of_month, due_date, created_by
  )
  VALUES (
    p_title, p_description, p_amount, p_type, p_category,
    p_recurrence, p_due_day_of_month, p_due_date, auth.uid()
  )
  RETURNING id INTO v_expense_id;

  -- ── 2. Criar atribuições (assignments) ───────────────────────────────────

  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO expense_assignments (expense_id, user_id)
    VALUES (v_expense_id, v_user_id)
    ON CONFLICT (expense_id, user_id) DO NOTHING;
  END LOOP;

  -- ── 3. Calcular valor por usuário ─────────────────────────────────────────

  v_user_count      := array_length(p_user_ids, 1);
  v_amount_per_user := ROUND(p_amount / v_user_count, 2);

  -- ── 4. Gerar splits ───────────────────────────────────────────────────────

  IF p_recurrence = 'once' THEN
    -- Despesa única: splits criados imediatamente
    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, NULL, p_due_date);
    END LOOP;

  ELSIF p_recurrence = 'monthly' THEN
    -- Mensal: gerar splits para o mês atual
    v_period := to_char(CURRENT_DATE, 'YYYY-MM');
    v_split_due_date := (v_period || '-' || LPAD(p_due_day_of_month::text, 2, '0'))::date;

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, v_split_due_date)
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF p_recurrence = 'yearly' THEN
    -- Anual: gerar split com o período do mês de vencimento
    v_period := to_char(p_due_date, 'YYYY-MM');

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, p_due_date)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date
) TO authenticated;

COMMENT ON FUNCTION create_expense_with_assignments IS
  'Cria uma despesa com atribuições e splits do período atual de forma atômica';

-- ============================================================================
-- 8. FUNÇÃO: ensure_period_splits
--    Garante que todos os splits do período informado existam para
--    despesas recorrentes ativas. Chamada pelo frontend ao abrir a tela
--    de despesas para o mês atual.
--
--    Parâmetros:
--      p_period - Período no formato 'YYYY-MM' (default: mês atual)
--
--    Retorna: quantidade de novos splits criados
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_period_splits(
  p_period varchar DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense         expenses%ROWTYPE;
  v_user_id         uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
  v_period          varchar(7);
  v_due_date        date;
  v_created_count   integer := 0;
  v_inserted        integer;
BEGIN
  -- Default: mês atual no formato YYYY-MM
  v_period := COALESCE(p_period, to_char(CURRENT_DATE, 'YYYY-MM'));

  FOR v_expense IN
    SELECT e.*
    FROM expenses e
    WHERE e.is_active = true
      AND e.recurrence IN ('monthly', 'yearly')
  LOOP
    -- Despesas anuais: só processar no mês correto de vencimento
    IF v_expense.recurrence = 'yearly' THEN
      IF to_char(v_expense.due_date, 'YYYY-MM') != v_period THEN
        CONTINUE;
      END IF;
    END IF;

    -- Contar usuários atribuídos
    SELECT COUNT(*) INTO v_user_count
    FROM expense_assignments
    WHERE expense_id = v_expense.id;

    -- Pular despesas sem atribuições
    IF v_user_count = 0 THEN
      CONTINUE;
    END IF;

    v_amount_per_user := ROUND(v_expense.amount / v_user_count, 2);

    -- Calcular due_date para este período
    IF v_expense.recurrence = 'monthly' THEN
      v_due_date := (v_period || '-' || LPAD(v_expense.due_day_of_month::text, 2, '0'))::date;
    ELSE
      v_due_date := v_expense.due_date;
    END IF;

    -- Inserir splits faltantes para cada usuário atribuído
    FOR v_user_id IN
      SELECT user_id FROM expense_assignments WHERE expense_id = v_expense.id
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense.id, v_user_id, v_amount_per_user, v_period, v_due_date)
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_created_count := v_created_count + v_inserted;
    END LOOP;
  END LOOP;

  RETURN v_created_count;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_period_splits(varchar) TO authenticated;

COMMENT ON FUNCTION ensure_period_splits IS
  'Gera splits do período para todas as despesas recorrentes ativas. Idempotente.';

-- ============================================================================
-- 9. FUNÇÃO: update_expense_assignments
--    Atualiza as atribuições de uma despesa existente e recalcula os splits
--    PENDENTES do período atual. Splits já pagos não são alterados.
--
--    Parâmetros:
--      p_expense_id - UUID da despesa a atualizar
--      p_user_ids   - Novo array de UUIDs dos usuários responsáveis
-- ============================================================================

CREATE OR REPLACE FUNCTION update_expense_assignments(
  p_expense_id  uuid,
  p_user_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense         expenses%ROWTYPE;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
  v_period          varchar(7);
  v_user_id         uuid;
BEGIN
  -- Verificar se o usuário é o criador ou super admin
  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada: %', p_expense_id;
  END IF;

  IF v_expense.created_by != auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta despesa';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos um usuário deve ser atribuído à despesa';
  END IF;

  -- ── 1. Sincronizar assignments ────────────────────────────────────────────

  -- Remover atribuições que não estão mais na lista
  DELETE FROM expense_assignments
  WHERE expense_id = p_expense_id
    AND user_id != ALL(p_user_ids);

  -- Adicionar novas atribuições
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO expense_assignments (expense_id, user_id)
    VALUES (p_expense_id, v_user_id)
    ON CONFLICT (expense_id, user_id) DO NOTHING;
  END LOOP;

  -- ── 2. Recalcular splits PENDENTES do período atual ───────────────────────

  v_user_count      := array_length(p_user_ids, 1);
  v_amount_per_user := ROUND(v_expense.amount / v_user_count, 2);
  v_period          := to_char(CURRENT_DATE, 'YYYY-MM');

  -- Atualizar amount_due dos splits pendentes do mês atual
  UPDATE expense_splits
  SET amount_due = v_amount_per_user,
      updated_at = now()
  WHERE expense_id = p_expense_id
    AND status = 'pending'
    AND (
      reference_period = v_period  -- recorrentes do mês atual
      OR reference_period IS NULL  -- únicos ainda pendentes
    );

  -- Inserir splits para novos usuários que ainda não têm (no período atual)
  IF v_expense.recurrence != 'once' THEN
    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (
        expense_id, user_id, amount_due, reference_period, due_date
      )
      SELECT
        p_expense_id,
        v_user_id,
        v_amount_per_user,
        v_period,
        CASE
          WHEN v_expense.recurrence = 'monthly' THEN
            (v_period || '-' || LPAD(v_expense.due_day_of_month::text, 2, '0'))::date
          ELSE
            v_expense.due_date
        END
      WHERE NOT EXISTS (
        SELECT 1 FROM expense_splits
        WHERE expense_id = p_expense_id
          AND user_id = v_user_id
          AND reference_period = v_period
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_expense_assignments(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION update_expense_assignments IS
  'Atualiza atribuições e recalcula splits pendentes. Splits pagos nunca são modificados.';

-- ============================================================================
-- 10. RLS: expenses
-- ============================================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Super admin vê tudo
CREATE POLICY "Super admins can view all expenses"
  ON expenses FOR SELECT TO authenticated
  USING (is_super_admin());

-- Usuário vê despesas que criou OU às quais foi atribuído
CREATE POLICY "Users can view own or assigned expenses"
  ON expenses FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT expense_id FROM expense_assignments WHERE user_id = auth.uid()
    )
  );

-- Qualquer usuário autenticado pode criar despesas
CREATE POLICY "Authenticated users can insert expenses"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Criador pode atualizar suas despesas
CREATE POLICY "Creators can update own expenses"
  ON expenses FOR UPDATE TO authenticated
  USING  (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Super admin pode atualizar qualquer despesa
CREATE POLICY "Super admins can update any expense"
  ON expenses FOR UPDATE TO authenticated
  USING (is_super_admin());

-- Criador pode deletar (soft delete via is_active é preferível)
CREATE POLICY "Creators can delete own expenses"
  ON expenses FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Super admin pode deletar qualquer despesa
CREATE POLICY "Super admins can delete any expense"
  ON expenses FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- 11. RLS: expense_assignments
-- ============================================================================

ALTER TABLE expense_assignments ENABLE ROW LEVEL SECURITY;

-- Usuário vê as atribuições das suas próprias despesas + as suas próprias
CREATE POLICY "Users can view relevant assignments"
  ON expense_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR expense_id IN (SELECT id FROM expenses WHERE created_by = auth.uid())
    OR is_super_admin()
  );

-- Criador da despesa gerencia as atribuições (ou super admin)
CREATE POLICY "Expense creators can insert assignments"
  ON expense_assignments FOR INSERT TO authenticated
  WITH CHECK (
    expense_id IN (SELECT id FROM expenses WHERE created_by = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Expense creators can delete assignments"
  ON expense_assignments FOR DELETE TO authenticated
  USING (
    expense_id IN (SELECT id FROM expenses WHERE created_by = auth.uid())
    OR is_super_admin()
  );

-- ============================================================================
-- 12. RLS: expense_splits
-- ============================================================================

ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

-- Super admin vê todos os splits
CREATE POLICY "Super admins can view all splits"
  ON expense_splits FOR SELECT TO authenticated
  USING (is_super_admin());

-- Usuário vê seus próprios splits
CREATE POLICY "Users can view own splits"
  ON expense_splits FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Criador da despesa vê todos os splits das suas despesas (para gestão)
CREATE POLICY "Expense creators can view all splits of own expenses"
  ON expense_splits FOR SELECT TO authenticated
  USING (
    expense_id IN (SELECT id FROM expenses WHERE created_by = auth.uid())
  );

-- Usuário pode atualizar seus próprios splits
-- (marcar como pago, adicionar comprovante, notas)
CREATE POLICY "Users can update own splits"
  ON expense_splits FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('pending', 'paid')
  );

-- Super admin pode atualizar qualquer split
CREATE POLICY "Super admins can update any split"
  ON expense_splits FOR UPDATE TO authenticated
  USING (is_super_admin());

-- Insert via funções SECURITY DEFINER (bypass RLS) — super admin também pode inserir diretamente
CREATE POLICY "Super admins can insert splits"
  ON expense_splits FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- Super admin pode deletar splits
CREATE POLICY "Super admins can delete splits"
  ON expense_splits FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- 13. FUNÇÃO: get_active_users
--     Retorna lista de usuários ativos para seleção no formulário de despesas.
--     SECURITY DEFINER permite que qualquer usuário autenticado veja a lista,
--     necessário para que profissionais possam atribuir despesas entre si
--     (a RLS de profiles normalmente só deixa o usuário ver a si próprio).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name::text, p.email::text
  FROM profiles p
  WHERE p.is_active = true
  ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_users() TO authenticated;

COMMENT ON FUNCTION get_active_users IS
  'Lista usuários ativos para seleção no formulário de despesas. SECURITY DEFINER necessário para acesso entre usuários.';

-- ============================================================================
-- 14. NOTA: Storage Bucket para Comprovantes
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '⚠️  AÇÃO MANUAL NECESSÁRIA — Storage Bucket para comprovantes';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Acesse: Dashboard > Storage > New Bucket';
  RAISE NOTICE '';
  RAISE NOTICE '1. Nome do bucket: expense-proofs';
  RAISE NOTICE '   Tipo: Private (NÃO marcar "Public")';
  RAISE NOTICE '';
  RAISE NOTICE '2. Criar 3 policies no bucket "expense-proofs":';
  RAISE NOTICE '';
  RAISE NOTICE '   ── Policy: Usuário faz upload ──────────────────────────────────';
  RAISE NOTICE '   Allowed operation: INSERT';
  RAISE NOTICE '   Target roles: authenticated';
  RAISE NOTICE '   WITH CHECK expression:';
  RAISE NOTICE '     bucket_id = ''expense-proofs''';
  RAISE NOTICE '     AND (storage.foldername(name))[1] = auth.uid()::text';
  RAISE NOTICE '';
  RAISE NOTICE '   ── Policy: Usuário visualiza seus arquivos ─────────────────────';
  RAISE NOTICE '   Allowed operation: SELECT';
  RAISE NOTICE '   Target roles: authenticated';
  RAISE NOTICE '   USING expression:';
  RAISE NOTICE '     bucket_id = ''expense-proofs''';
  RAISE NOTICE '     AND (storage.foldername(name))[1] = auth.uid()::text';
  RAISE NOTICE '';
  RAISE NOTICE '   ── Policy: Usuário remove seus arquivos ─────────────────────────';
  RAISE NOTICE '   Allowed operation: DELETE';
  RAISE NOTICE '   Target roles: authenticated';
  RAISE NOTICE '   USING expression:';
  RAISE NOTICE '     bucket_id = ''expense-proofs''';
  RAISE NOTICE '     AND (storage.foldername(name))[1] = auth.uid()::text';
  RAISE NOTICE '';
  RAISE NOTICE 'Caminho de upload no frontend:';
  RAISE NOTICE '   expense-proofs/{user_id}/{split_id}.{jpg|png|pdf}';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- 14. VERIFICAÇÃO FINAL
-- ============================================================================

DO $$
DECLARE
  expenses_count    INT;
  assignments_count INT;
  splits_count      INT;
BEGIN
  SELECT COUNT(*) INTO expenses_count    FROM pg_policies WHERE tablename = 'expenses';
  SELECT COUNT(*) INTO assignments_count FROM pg_policies WHERE tablename = 'expense_assignments';
  SELECT COUNT(*) INTO splits_count      FROM pg_policies WHERE tablename = 'expense_splits';

  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION: Sistema de Despesas — APLICADO COM SUCESSO!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📦 Tabelas criadas:';
  RAISE NOTICE '   ✓ expenses               (definição das despesas)';
  RAISE NOTICE '   ✓ expense_assignments    (template de responsáveis)';
  RAISE NOTICE '   ✓ expense_splits         (instâncias de pagamento)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 RLS configurado:';
  RAISE NOTICE '   ✓ expenses              → % policies', expenses_count;
  RAISE NOTICE '   ✓ expense_assignments   → % policies', assignments_count;
  RAISE NOTICE '   ✓ expense_splits        → % policies', splits_count;
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  Funções RPC disponíveis:';
  RAISE NOTICE '   ✓ create_expense_with_assignments(...)';
  RAISE NOTICE '   ✓ ensure_period_splits(period)';
  RAISE NOTICE '   ✓ update_expense_assignments(expense_id, user_ids)';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Triggers criados:';
  RAISE NOTICE '   ✓ expenses_updated_at            → atualiza updated_at';
  RAISE NOTICE '   ✓ expense_splits_updated_at      → atualiza updated_at';
  RAISE NOTICE '   ✓ expense_split_payment_trigger  → gerencia paid_at';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  PENDENTE: Criar Storage Bucket "expense-proofs" manualmente';
  RAISE NOTICE '   (veja as instruções acima)';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
