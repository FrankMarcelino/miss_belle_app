-- ============================================================================
-- MIGRATION: Início de vigência para despesas recorrentes
-- Data: 2026-02-20
-- Descrição: Adiciona effective_from para impedir lançamentos retroativos.
--            Padrão de mercado: despesas só geram splits a partir do mês
--            configurado, nunca para períodos anteriores.
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR effective_from em expenses
-- ============================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS effective_from date;

-- Backfill: despesas existentes recebem o 1º dia do mês de criação
-- (comportamento esperado: não gerar retroativos além da criação)
UPDATE expenses
SET effective_from = DATE_TRUNC('month', created_at)::date
WHERE effective_from IS NULL;

-- Tornar obrigatório com default = 1º dia do mês atual
ALTER TABLE expenses ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN effective_from SET DEFAULT DATE_TRUNC('month', CURRENT_DATE)::date;

COMMENT ON COLUMN expenses.effective_from IS
  'Mês a partir do qual splits são gerados. Splits nunca são criados para períodos anteriores a este.';

-- ============================================================================
-- 2. LIMPEZA DE SPLITS RETROATIVOS INDEVIDOS
--    Remove splits PENDENTES cujo reference_period é anterior ao effective_from
--    da despesa. Splits já PAGOS são preservados (auditoria).
-- ============================================================================

DELETE FROM expense_splits es
WHERE es.status = 'pending'
  AND es.reference_period IS NOT NULL
  AND es.reference_period < (
    SELECT to_char(e.effective_from, 'YYYY-MM')
    FROM expenses e
    WHERE e.id = es.expense_id
  );

-- ============================================================================
-- 3. ATUALIZAR ensure_period_splits
--    Agora respeita effective_from: não gera splits para períodos anteriores
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
  v_period := COALESCE(p_period, to_char(CURRENT_DATE, 'YYYY-MM'));

  FOR v_expense IN
    SELECT e.*
    FROM expenses e
    WHERE e.is_active = true
      -- Apenas recorrentes mensais e anuais
      -- 'once' e 'installments' têm todos os splits gerados na criação
      AND e.recurrence IN ('monthly', 'yearly')
  LOOP
    -- ── Respeitar effective_from ──────────────────────────────────────────
    -- Não gerar splits para períodos antes do início de vigência
    IF to_char(v_expense.effective_from, 'YYYY-MM') > v_period THEN
      CONTINUE;
    END IF;

    -- Despesas anuais: só processar no mês exato de vencimento
    IF v_expense.recurrence = 'yearly' THEN
      IF to_char(v_expense.due_date, 'YYYY-MM') != v_period THEN
        CONTINUE;
      END IF;
    END IF;

    -- Contar usuários atribuídos
    SELECT COUNT(*) INTO v_user_count
    FROM expense_assignments
    WHERE expense_id = v_expense.id;

    IF v_user_count = 0 THEN
      CONTINUE;
    END IF;

    v_amount_per_user := ROUND(v_expense.amount / v_user_count, 2);

    IF v_expense.recurrence = 'monthly' THEN
      v_due_date := (v_period || '-' || LPAD(v_expense.due_day_of_month::text, 2, '0'))::date;
    ELSE
      v_due_date := v_expense.due_date;
    END IF;

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
  'Gera splits do período para despesas mensais/anuais ativas. Respeita effective_from (sem retroativos).';

-- ============================================================================
-- 4. ATUALIZAR create_expense_with_assignments
--    Adiciona p_effective_from para controle do início de vigência
-- ============================================================================

-- Remover versão anterior para evitar ambiguidade
DROP FUNCTION IF EXISTS create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric
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
  p_adjustment_value   numeric DEFAULT NULL,
  p_effective_from     date    DEFAULT NULL   -- início de vigência (geração de splits)
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
  v_effective_from  date;
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

  -- ── Calcular effective_from ────────────────────────────────────────────────
  -- Mensal: usa o p_effective_from informado, ou o 1º dia do mês atual
  -- Única/Anual/Parcelada: usa a data do primeiro vencimento (due_date)
  v_effective_from := COALESCE(
    p_effective_from,
    CASE
      WHEN p_recurrence = 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE)::date
      ELSE DATE_TRUNC('month', p_due_date)::date
    END
  );

  -- ── 1. Criar a despesa ────────────────────────────────────────────────────

  INSERT INTO expenses (
    title, description, amount, type, category,
    recurrence, due_day_of_month, due_date, created_by,
    installments_count, contract_end_date, adjustment_index, adjustment_value,
    effective_from
  )
  VALUES (
    p_title, p_description, p_amount, p_type, p_category,
    p_recurrence, p_due_day_of_month, p_due_date, auth.uid(),
    COALESCE(p_installments_count, 1),
    p_contract_end_date, p_adjustment_index, p_adjustment_value,
    v_effective_from
  )
  RETURNING id INTO v_expense_id;

  -- ── 2. Criar atribuições ──────────────────────────────────────────────────

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
    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, NULL, p_due_date);
    END LOOP;

  ELSIF p_recurrence = 'monthly' THEN
    -- Gerar split apenas para o mês de início de vigência
    v_period := to_char(v_effective_from, 'YYYY-MM');
    v_split_due_date := (v_period || '-' || LPAD(p_due_day_of_month::text, 2, '0'))::date;

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, v_split_due_date)
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF p_recurrence = 'yearly' THEN
    v_period := to_char(p_due_date, 'YYYY-MM');

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, p_due_date)
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF p_recurrence = 'installments' THEN
    -- Valor por parcela por usuário
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
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric, date
) TO authenticated;

COMMENT ON FUNCTION create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric, date
) IS 'Cria despesa com atribuições e splits. Respeita effective_from para não gerar retroativos.';

-- ============================================================================
-- 5. VERIFICAÇÃO FINAL
-- ============================================================================

DO $$
DECLARE
  v_deleted_count integer;
BEGIN
  SELECT COUNT(*) INTO v_deleted_count
  FROM expense_splits es
  WHERE es.status = 'pending'
    AND es.reference_period IS NOT NULL
    AND es.reference_period < (
      SELECT to_char(e.effective_from, 'YYYY-MM')
      FROM expenses e WHERE e.id = es.expense_id
    );

  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION: Início de Vigência (effective_from) — APLICADA!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 expenses.effective_from adicionado';
  RAISE NOTICE '   Backfill: 1º dia do mês de criação para registros existentes';
  RAISE NOTICE '';
  RAISE NOTICE '🧹 Splits retroativos pendentes removidos: %', v_deleted_count;
  RAISE NOTICE '   (splits pagos preservados para auditoria)';
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  Funções atualizadas:';
  RAISE NOTICE '   ✓ ensure_period_splits → respeita effective_from';
  RAISE NOTICE '   ✓ create_expense_with_assignments → aceita p_effective_from';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
