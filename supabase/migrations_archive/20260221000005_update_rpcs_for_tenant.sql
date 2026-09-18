-- ============================================================================
-- MIGRATION: Atualizar todas as RPCs para multi-tenancy
-- Data: 2026-02-21
-- Descrição: Todas as funções SECURITY DEFINER precisam filtrar por tenant
--            e propagar tenant_id nos INSERTs.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. auth_user_has_expense_assignment  (helper de RLS — adiciona tenant check)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auth_user_has_expense_assignment(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_assignments
    WHERE expense_id = p_expense_id
      AND user_id    = auth.uid()
      AND tenant_id  = auth_tenant_id()
  )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. auth_user_created_expense  (helper de RLS — adiciona tenant check)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auth_user_created_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expenses
    WHERE id         = p_expense_id
      AND created_by = auth.uid()
      AND tenant_id  = auth_tenant_id()
  )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. get_active_users  (retorna apenas usuários do mesmo tenant)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(id uuid, full_name text, email text, role text)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, email, role
  FROM profiles
  WHERE is_active  = true
    AND tenant_id  = auth_tenant_id()
  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION get_active_users() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. create_expense_with_assignments  (propaga tenant_id)
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS create_expense_with_assignments(
  varchar, text, numeric, varchar, varchar, varchar, uuid[], integer, date, integer, date, varchar, numeric, date
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
  p_effective_from     date    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id      uuid;
  v_tenant_id       uuid;
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
  v_tenant_id := auth_tenant_id();

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

  -- Verificar que todos os user_ids pertencem ao mesmo tenant
  IF EXISTS (
    SELECT 1 FROM unnest(p_user_ids) uid
    WHERE NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = uid AND tenant_id = v_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais usuários não pertencem a este tenant';
  END IF;

  -- ── Calcular effective_from ───────────────────────────────────────────────

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
    effective_from, tenant_id
  )
  VALUES (
    p_title, p_description, p_amount, p_type, p_category,
    p_recurrence, p_due_day_of_month, p_due_date, auth.uid(),
    COALESCE(p_installments_count, 1),
    p_contract_end_date, p_adjustment_index, p_adjustment_value,
    v_effective_from, v_tenant_id
  )
  RETURNING id INTO v_expense_id;

  -- ── 2. Criar atribuições ──────────────────────────────────────────────────

  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO expense_assignments (expense_id, user_id, tenant_id)
    VALUES (v_expense_id, v_user_id, v_tenant_id)
    ON CONFLICT (expense_id, user_id) DO NOTHING;
  END LOOP;

  -- ── 3. Calcular valor por usuário ─────────────────────────────────────────

  v_user_count      := array_length(p_user_ids, 1);
  v_amount_per_user := ROUND(p_amount / v_user_count, 2);

  -- ── 4. Gerar splits ───────────────────────────────────────────────────────

  IF p_recurrence = 'once' THEN
    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date, tenant_id)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, NULL, p_due_date, v_tenant_id);
    END LOOP;

  ELSIF p_recurrence = 'monthly' THEN
    v_period         := to_char(v_effective_from, 'YYYY-MM');
    v_split_due_date := (v_period || '-' || LPAD(p_due_day_of_month::text, 2, '0'))::date;

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date, tenant_id)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, v_split_due_date, v_tenant_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF p_recurrence = 'yearly' THEN
    v_period := to_char(p_due_date, 'YYYY-MM');

    FOREACH v_user_id IN ARRAY p_user_ids
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date, tenant_id)
      VALUES (v_expense_id, v_user_id, v_amount_per_user, v_period, p_due_date, v_tenant_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF p_recurrence = 'installments' THEN
    v_amount_per_user := ROUND(p_amount / p_installments_count / v_user_count, 2);

    FOR i IN 1..p_installments_count LOOP
      v_ref_period := to_char(p_due_date + (interval '1 month' * (i - 1)), 'YYYY-MM');
      v_due        := (p_due_date + (interval '1 month' * (i - 1)))::date;

      FOREACH v_user_id IN ARRAY p_user_ids
      LOOP
        INSERT INTO expense_splits (
          expense_id, user_id, amount_due, reference_period, due_date, installment_number, tenant_id
        )
        VALUES (
          v_expense_id, v_user_id, v_amount_per_user, v_ref_period, v_due, i, v_tenant_id
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

-- ════════════════════════════════════════════════════════════════════════════
-- 5. ensure_period_splits  (filtra por tenant do usuário chamante)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ensure_period_splits(
  p_period varchar DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_expense         expenses%ROWTYPE;
  v_user_id         uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
  v_period          varchar(7);
  v_due_date        date;
  v_created_count   integer := 0;
  v_inserted        integer;
BEGIN
  v_tenant_id := auth_tenant_id();
  v_period    := COALESCE(p_period, to_char(CURRENT_DATE, 'YYYY-MM'));

  FOR v_expense IN
    SELECT e.*
    FROM expenses e
    WHERE e.is_active  = true
      AND e.tenant_id  = v_tenant_id          -- ← isolamento de tenant
      AND e.recurrence IN ('monthly', 'yearly')
  LOOP
    -- Respeitar effective_from
    IF to_char(v_expense.effective_from, 'YYYY-MM') > v_period THEN
      CONTINUE;
    END IF;

    -- Anuais: só no mês exato de vencimento
    IF v_expense.recurrence = 'yearly' THEN
      IF to_char(v_expense.due_date, 'YYYY-MM') != v_period THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT COUNT(*) INTO v_user_count
    FROM expense_assignments
    WHERE expense_id = v_expense.id;

    IF v_user_count = 0 THEN CONTINUE; END IF;

    v_amount_per_user := ROUND(v_expense.amount / v_user_count, 2);

    IF v_expense.recurrence = 'monthly' THEN
      v_due_date := (v_period || '-' || LPAD(v_expense.due_day_of_month::text, 2, '0'))::date;
    ELSE
      v_due_date := v_expense.due_date;
    END IF;

    FOR v_user_id IN
      SELECT user_id FROM expense_assignments WHERE expense_id = v_expense.id
    LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount_due, reference_period, due_date, tenant_id)
      VALUES (v_expense.id, v_user_id, v_amount_per_user, v_period, v_due_date, v_tenant_id)
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_created_count := v_created_count + v_inserted;
    END LOOP;
  END LOOP;

  RETURN v_created_count;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_period_splits(varchar) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. update_expense_assignments  (verifica tenant)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_expense_assignments(
  p_expense_id uuid,
  p_user_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
  v_amount          numeric(10,2);
  v_user_id         uuid;
BEGIN
  v_tenant_id := auth_tenant_id();

  -- Permissão: criador ou super admin do tenant
  IF NOT (
    EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id AND created_by = auth.uid() AND tenant_id = v_tenant_id)
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para atualizar atribuições desta despesa';
  END IF;

  -- Verificar que todos os novos usuários são do mesmo tenant
  IF EXISTS (
    SELECT 1 FROM unnest(p_user_ids) uid
    WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND tenant_id = v_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Um ou mais usuários não pertencem a este tenant';
  END IF;

  -- Remover atribuições que não estão mais na lista
  DELETE FROM expense_assignments
  WHERE expense_id = p_expense_id
    AND user_id != ALL(p_user_ids);

  -- Adicionar novas atribuições
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO expense_assignments (expense_id, user_id, tenant_id)
    VALUES (p_expense_id, v_user_id, v_tenant_id)
    ON CONFLICT (expense_id, user_id) DO NOTHING;
  END LOOP;

  -- Recalcular splits pendentes
  SELECT amount INTO v_amount FROM expenses WHERE id = p_expense_id;
  SELECT COUNT(*) INTO v_user_count FROM expense_assignments WHERE expense_id = p_expense_id;

  IF v_user_count > 0 THEN
    v_amount_per_user := ROUND(v_amount / v_user_count, 2);

    UPDATE expense_splits
    SET amount_due = v_amount_per_user
    WHERE expense_id = p_expense_id
      AND status     = 'pending';
  END IF;

  -- Remover splits pendentes de usuários que saíram
  DELETE FROM expense_splits
  WHERE expense_id = p_expense_id
    AND status     = 'pending'
    AND user_id    != ALL(p_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION update_expense_assignments(uuid, uuid[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. update_period_expense_amount  (verifica tenant)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_period_expense_amount(
  p_expense_id uuid,
  p_period     varchar,
  p_new_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
BEGIN
  v_tenant_id := auth_tenant_id();

  IF NOT (
    auth_user_has_expense_assignment(p_expense_id) OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para atualizar o valor desta despesa';
  END IF;

  UPDATE expenses
  SET amount = p_new_amount
  WHERE id = p_expense_id AND tenant_id = v_tenant_id;

  SELECT COUNT(*) INTO v_user_count
  FROM expense_assignments
  WHERE expense_id = p_expense_id;

  IF v_user_count > 0 THEN
    v_amount_per_user := ROUND(p_new_amount / v_user_count, 2);

    UPDATE expense_splits
    SET amount_due = v_amount_per_user
    WHERE expense_id       = p_expense_id
      AND reference_period = p_period
      AND status           = 'pending'
      AND tenant_id        = v_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_period_expense_amount(uuid, varchar, numeric) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. apply_expense_adjustment  (verifica tenant + is_super_admin)
-- ════════════════════════════════════════════════════════════════════════════

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
  v_tenant_id       uuid;
  v_user_count      integer;
  v_amount_per_user numeric(10,2);
BEGIN
  v_tenant_id := auth_tenant_id();

  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super admins podem aplicar reajustes';
  END IF;

  UPDATE expenses
  SET
    amount           = p_new_amount,
    adjustment_index = p_adjustment_index,
    adjustment_value = p_adjustment_value
  WHERE id = p_expense_id AND tenant_id = v_tenant_id;

  SELECT COUNT(*) INTO v_user_count
  FROM expense_assignments
  WHERE expense_id = p_expense_id;

  IF v_user_count > 0 THEN
    v_amount_per_user := ROUND(p_new_amount / v_user_count, 2);

    UPDATE expense_splits
    SET amount_due = v_amount_per_user
    WHERE expense_id = p_expense_id
      AND status     = 'pending'
      AND tenant_id  = v_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_expense_adjustment(uuid, numeric, varchar, numeric) TO authenticated;

-- ── Verificação ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  MIGRATION 005: Todas as RPCs atualizadas para multi-tenancy';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  Funções atualizadas:';
  RAISE NOTICE '   auth_user_has_expense_assignment → verifica tenant';
  RAISE NOTICE '   auth_user_created_expense        → verifica tenant';
  RAISE NOTICE '   get_active_users                 → filtra por tenant';
  RAISE NOTICE '   create_expense_with_assignments  → propaga tenant_id';
  RAISE NOTICE '   ensure_period_splits             → filtra por tenant';
  RAISE NOTICE '   update_expense_assignments       → verifica tenant';
  RAISE NOTICE '   update_period_expense_amount     → verifica tenant';
  RAISE NOTICE '   apply_expense_adjustment         → verifica tenant';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════════';
END $$;
