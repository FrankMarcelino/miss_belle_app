-- ============================================================================
-- MIGRATION: Melhorias no Sistema de Despesas
-- Data: 2026-02-20
-- Descrição: Adiciona suporte a parcelamento, contrato e reajuste de índice
-- ============================================================================

-- ============================================================================
-- 1. NOVOS CAMPOS EM expenses
-- ============================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS installments_count integer NOT NULL DEFAULT 1
    CHECK (installments_count >= 1),
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS adjustment_index varchar(10)
    CHECK (adjustment_index IN ('igpm','ipca','inpc','fixed') OR adjustment_index IS NULL),
  ADD COLUMN IF NOT EXISTS adjustment_value numeric;

-- Adicionar 'installments' à constraint de recorrência
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_recurrence_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_recurrence_check
    CHECK (recurrence IN ('once','monthly','yearly','installments'));

-- Relaxar a constraint de consistência para aceitar installments
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_recurrence_date_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_recurrence_date_check CHECK (
    (recurrence = 'monthly'      AND due_day_of_month IS NOT NULL) OR
    (recurrence = 'once'         AND due_date IS NOT NULL) OR
    (recurrence = 'yearly'       AND due_date IS NOT NULL) OR
    (recurrence = 'installments' AND due_date IS NOT NULL)
  );

COMMENT ON COLUMN expenses.installments_count IS 'Número de parcelas (1 = sem parcelamento; >1 = parcelado)';
COMMENT ON COLUMN expenses.contract_end_date  IS 'Data de término do contrato (para aluguel e similares)';
COMMENT ON COLUMN expenses.adjustment_index   IS 'Índice de reajuste aplicado: igpm | ipca | inpc | fixed';
COMMENT ON COLUMN expenses.adjustment_value   IS 'Percentual ou valor de reajuste aplicado';

-- ============================================================================
-- 2. NOVO CAMPO EM expense_splits
-- ============================================================================

ALTER TABLE expense_splits
  ADD COLUMN IF NOT EXISTS installment_number integer;

COMMENT ON COLUMN expense_splits.installment_number IS 'Número da parcela (1-based). NULL para não-parcelado.';

-- ============================================================================
-- 3. ATUALIZAR RPC create_expense_with_assignments
--    Adiciona suporte a recurrence = 'installments'
-- ============================================================================

-- Remover versão antiga (9 parâmetros) para evitar ambiguidade de sobrecarga
DROP FUNCTION IF EXISTS create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date
);

CREATE OR REPLACE FUNCTION create_expense_with_assignments(
  p_title              varchar,
  p_description        text,
  p_amount             numeric,
  p_type               varchar,
  p_category           varchar,
  p_recurrence         varchar,
  p_user_ids           uuid[],
  p_due_day_of_month   integer DEFAULT NULL,
  p_due_date           date    DEFAULT NULL,
  p_installments_count integer DEFAULT 1,
  p_contract_end_date  date    DEFAULT NULL,
  p_adjustment_index   varchar DEFAULT NULL,
  p_adjustment_value   numeric DEFAULT NULL
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
  i                 integer;
  v_ref_period      varchar(7);
  v_due             date;
BEGIN
  -- ── Validações ────────────────────────────────────────────────────────────

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos um usuário deve ser atribuído à despesa';
  END IF;

  IF p_recurrence = 'monthly' AND p_due_day_of_month IS NULL THEN
    RAISE EXCEPTION 'Despesas mensais requerem due_day_of_month';
  END IF;

  IF p_recurrence IN ('once', 'yearly', 'installments') AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Despesas únicas, anuais e parceladas requerem due_date';
  END IF;

  IF p_recurrence = 'installments' AND (p_installments_count IS NULL OR p_installments_count < 2) THEN
    RAISE EXCEPTION 'Despesas parceladas requerem installments_count >= 2';
  END IF;

  -- ── 1. Criar a despesa ────────────────────────────────────────────────────

  INSERT INTO expenses (
    title, description, amount, type, category,
    recurrence, due_day_of_month, due_date, created_by,
    installments_count, contract_end_date, adjustment_index, adjustment_value
  )
  VALUES (
    p_title, p_description, p_amount, p_type, p_category,
    p_recurrence, p_due_day_of_month, p_due_date, auth.uid(),
    COALESCE(p_installments_count, 1),
    p_contract_end_date, p_adjustment_index, p_adjustment_value
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

  ELSIF p_recurrence = 'installments' THEN
    -- Parcelado: gerar N splits mensais a partir de p_due_date
    -- amount_per_user já calculado acima; dividir também pelo número de parcelas
    v_amount_per_user := ROUND(p_amount / p_installments_count / v_user_count, 2);

    FOR i IN 1..p_installments_count LOOP
      v_ref_period := to_char(p_due_date + (interval '1 month' * (i - 1)), 'YYYY-MM');
      v_due        := (p_due_date + (interval '1 month' * (i - 1)))::date;

      FOREACH v_user_id IN ARRAY p_user_ids
      LOOP
        INSERT INTO expense_splits (
          expense_id, user_id, amount_due, reference_period, due_date, installment_number
        )
        VALUES (
          v_expense_id, v_user_id, v_amount_per_user, v_ref_period, v_due, i
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  RETURN v_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric
) TO authenticated;

COMMENT ON FUNCTION create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric
) IS 'Cria uma despesa com atribuições e splits. Suporta recorrência única, mensal, anual e parcelada.';

-- ============================================================================
-- 4. NOVA RPC: update_period_expense_amount
--    Permite que qualquer usuário atribuído à despesa atualize o valor
--    real de uma despesa variável para um período específico.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_period_expense_amount(
  p_expense_id uuid,
  p_period     varchar,   -- formato YYYY-MM
  p_new_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
BEGIN
  -- Verificar se o usuário tem acesso à despesa
  IF NOT EXISTS (
    SELECT 1 FROM expense_assignments
    WHERE expense_id = p_expense_id AND user_id = auth.uid()
  ) AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para atualizar esta despesa';
  END IF;

  -- Verificar se a despesa existe e está ativa
  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE id = p_expense_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Despesa não encontrada: %', p_expense_id;
  END IF;

  IF p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;

  -- Contar usuários atribuídos
  SELECT COUNT(*) INTO v_user_count
  FROM expense_assignments
  WHERE expense_id = p_expense_id;

  v_amount_per_user := ROUND(p_new_amount / v_user_count, 2);

  -- Atualizar valor padrão da despesa para próximos períodos
  UPDATE expenses
  SET amount     = p_new_amount,
      updated_at = now()
  WHERE id = p_expense_id;

  -- Atualizar splits PENDENTES do período informado
  UPDATE expense_splits
  SET amount_due = v_amount_per_user,
      updated_at = now()
  WHERE expense_id       = p_expense_id
    AND reference_period = p_period
    AND status           = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION update_period_expense_amount(uuid, varchar, numeric) TO authenticated;

COMMENT ON FUNCTION update_period_expense_amount IS
  'Atualiza o valor real de uma despesa variável para um período. Disponível para todos os responsáveis.';

-- ============================================================================
-- 5. NOVA RPC: apply_expense_adjustment
--    Apenas admin. Aplica reajuste por índice (IGPM, IPCA etc.)
--    ao valor de uma despesa e atualiza splits pendentes futuros.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_expense_adjustment(
  p_expense_id       uuid,
  p_new_amount       numeric,
  p_adjustment_index varchar,
  p_adjustment_value numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
BEGIN
  -- Apenas super admin pode aplicar reajuste
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem aplicar reajustes';
  END IF;

  -- Verificar se a despesa existe e está ativa
  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE id = p_expense_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Despesa não encontrada: %', p_expense_id;
  END IF;

  IF p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Novo valor deve ser maior que zero';
  END IF;

  -- Contar usuários atribuídos
  SELECT COUNT(*) INTO v_user_count
  FROM expense_assignments
  WHERE expense_id = p_expense_id;

  v_amount_per_user := ROUND(p_new_amount / v_user_count, 2);

  -- Atualizar a despesa com novo valor e índice aplicado
  UPDATE expenses
  SET amount           = p_new_amount,
      adjustment_index = p_adjustment_index,
      adjustment_value = p_adjustment_value,
      updated_at       = now()
  WHERE id = p_expense_id;

  -- Atualizar todos os splits PENDENTES (todos os períodos futuros)
  UPDATE expense_splits
  SET amount_due = v_amount_per_user,
      updated_at = now()
  WHERE expense_id = p_expense_id
    AND status     = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION apply_expense_adjustment(uuid, numeric, varchar, numeric) TO authenticated;

COMMENT ON FUNCTION apply_expense_adjustment IS
  'Aplica reajuste de contrato (aluguel) ao valor da despesa e atualiza splits pendentes. Apenas admin.';

-- ============================================================================
-- 6. ATUALIZAR ensure_period_splits para ignorar 'installments'
--    (splits parcelados já são gerados todos de uma vez na criação)
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
      -- Apenas recorrentes: 'once' e 'installments' já têm todos os splits gerados na criação
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
  'Gera splits do período para despesas mensais e anuais ativas. Parceladas já têm splits pré-gerados.';

-- ============================================================================
-- 7. VERIFICAÇÃO FINAL
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION: Melhorias no Sistema de Despesas — APLICADA!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Alterações em expenses:';
  RAISE NOTICE '   ✓ installments_count  (default 1)';
  RAISE NOTICE '   ✓ contract_end_date   (data de término do contrato)';
  RAISE NOTICE '   ✓ adjustment_index    (igpm|ipca|inpc|fixed)';
  RAISE NOTICE '   ✓ adjustment_value    (percentual/valor do reajuste)';
  RAISE NOTICE '   ✓ recurrence += installments';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Alterações em expense_splits:';
  RAISE NOTICE '   ✓ installment_number  (número da parcela, 1-based)';
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  RPCs atualizadas/criadas:';
  RAISE NOTICE '   ✓ create_expense_with_assignments (+ parcelamento)';
  RAISE NOTICE '   ✓ ensure_period_splits (ignora installments)';
  RAISE NOTICE '   ✓ update_period_expense_amount (novo)';
  RAISE NOTICE '   ✓ apply_expense_adjustment (novo, apenas admin)';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
