


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) IS 'Aplica reajuste de contrato (aluguel) ao valor da despesa e atualiza splits pendentes. Apenas admin.';



CREATE OR REPLACE FUNCTION "public"."auth_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."auth_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_created_expense"("p_expense_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM expenses
    WHERE id         = p_expense_id
      AND created_by = auth.uid()
      AND tenant_id  = auth_tenant_id()
  )
$$;


ALTER FUNCTION "public"."auth_user_created_expense"("p_expense_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_has_expense_assignment"("p_expense_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_assignments
    WHERE expense_id = p_expense_id
      AND user_id    = auth.uid()
      AND tenant_id  = auth_tenant_id()
  )
$$;


ALTER FUNCTION "public"."auth_user_has_expense_assignment"("p_expense_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_role"() RETURNS character varying
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."auth_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_set_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."auto_set_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_set_transaction_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- tenant_id
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid());
  END IF;
  -- professional_id: pega do appointment se não informado
  IF NEW.professional_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
    NEW.professional_id := (SELECT professional_id FROM appointments WHERE id = NEW.appointment_id);
  END IF;
  -- fallback: usuário logado é o profissional
  IF NEW.professional_id IS NULL THEN
    NEW.professional_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."auto_set_transaction_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_duration integer;
  v_new_start integer;
  v_new_end integer;
  v_conflict boolean;
BEGIN
  SELECT duration_minutes INTO v_duration
  FROM procedures
  WHERE id = p_procedure_id;

  IF v_duration IS NULL THEN
    v_duration := 30;
  END IF;

  v_new_start := EXTRACT(HOUR FROM p_appointment_time) * 60
               + EXTRACT(MINUTE FROM p_appointment_time);
  v_new_end   := v_new_start + v_duration;

  SELECT EXISTS (
    SELECT 1
    FROM appointments a
    JOIN procedures p ON p.id = a.procedure_id
    WHERE a.professional_id = p_professional_id
      AND a.appointment_date = p_appointment_date
      AND a.status NOT IN ('cancelled')
      AND (p_appointment_id IS NULL OR a.id != p_appointment_id)
      AND (
        v_new_start < (EXTRACT(HOUR FROM a.appointment_time) * 60
                     + EXTRACT(MINUTE FROM a.appointment_time)
                     + COALESCE(p.duration_minutes, 30))
        AND
        v_new_end > (EXTRACT(HOUR FROM a.appointment_time) * 60
                   + EXTRACT(MINUTE FROM a.appointment_time))
      )
  ) INTO v_conflict;

  RETURN v_conflict;
END;
$$;


ALTER FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid") IS 'Verifica se há conflito de horário para um agendamento. Retorna true se houver conflito.';



CREATE OR REPLACE FUNCTION "public"."create_expense_with_assignments"("p_title" character varying, "p_description" "text", "p_amount" numeric, "p_type" character varying, "p_category" character varying, "p_recurrence" character varying, "p_user_ids" "uuid"[], "p_due_day_of_month" integer DEFAULT NULL::integer, "p_due_date" "date" DEFAULT NULL::"date", "p_installments_count" integer DEFAULT 1, "p_contract_end_date" "date" DEFAULT NULL::"date", "p_adjustment_index" character varying DEFAULT NULL::character varying, "p_adjustment_value" numeric DEFAULT NULL::numeric, "p_effective_from" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_expense_with_assignments"("p_title" character varying, "p_description" "text", "p_amount" numeric, "p_type" character varying, "p_category" character varying, "p_recurrence" character varying, "p_user_ids" "uuid"[], "p_due_day_of_month" integer, "p_due_date" "date", "p_installments_count" integer, "p_contract_end_date" "date", "p_adjustment_index" character varying, "p_adjustment_value" numeric, "p_effective_from" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_initial_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO subscriptions (tenant_id, plan_id, status)
  VALUES (NEW.id, 'starter', 'active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_initial_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_period_splits"("p_period" character varying DEFAULT NULL::character varying) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."ensure_period_splits"("p_period" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_period_splits"("p_period" character varying) IS 'Gera splits do período para despesas mensais/anuais ativas. Respeita effective_from (sem retroativos).';



CREATE OR REPLACE FUNCTION "public"."get_active_users"() RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text", "role" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id, full_name, email, role
  FROM profiles
  WHERE is_active  = true
    AND tenant_id  = auth_tenant_id()
  ORDER BY full_name;
$$;


ALTER FUNCTION "public"."get_active_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "duration_minutes" integer, "default_price" numeric, "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") IS 'Retorna lista de procedimentos que um profissional específico pode realizar';



CREATE OR REPLACE FUNCTION "public"."handle_expense_split_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."handle_expense_split_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin' AND is_active = true
     FROM profiles WHERE id = auth.uid()),
    false
  )
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_closing_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Recalcular o total do fechamento baseado nas transações
  UPDATE cash_register_closings
  SET total_amount = COALESCE((
    SELECT SUM(amount)
    FROM cash_register_transactions
    WHERE closing_id = COALESCE(NEW.closing_id, OLD.closing_id)
  ), 0)
  WHERE id = COALESCE(NEW.closing_id, OLD.closing_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."recalculate_closing_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_user_profile"("p_full_name" "text", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Idempotente: não faz nada se perfil já existe
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RETURN;
  END IF;

  -- Todo signup público cria seu próprio tenant como super_admin
  INSERT INTO tenants (name, slug)
  VALUES (
    p_full_name || ' - Clínica',
    lower(regexp_replace(p_full_name, '[^a-zA-Z0-9]', '-', 'g'))
         || '-' || floor(extract(epoch FROM now()))::text
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO profiles (id, email, full_name, role, is_active, tenant_id)
  VALUES (auth.uid(), p_email, p_full_name, 'super_admin', true, v_tenant_id);
END $$;


ALTER FUNCTION "public"."register_user_profile"("p_full_name" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_patients_for_professional"("prof_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO patients (id, full_name, phone, email, notes, professional_id, created_at) VALUES
    (gen_random_uuid(), 'Ana Paula Silva', '(11) 98765-4321', 'ana.silva@email.com', 'Cliente VIP - Prefere manhãs', prof_id, NOW()),
    (gen_random_uuid(), 'Beatriz Costa', '(11) 97654-3210', 'bia.costa@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Carla Mendes', '(11) 96543-2109', 'carla.mendes@email.com', 'Pele sensível', prof_id, NOW()),
    (gen_random_uuid(), 'Daniela Oliveira', '(11) 95432-1098', 'dani.oliveira@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Elaine Santos', '(11) 94321-0987', 'elaine.santos@email.com', 'Agendamentos apenas após 14h', prof_id, NOW()),
    (gen_random_uuid(), 'Fernanda Lima', '(11) 93210-9876', 'fer.lima@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Gabriela Rocha', '(11) 92109-8765', 'gabi.rocha@email.com', 'Cliente desde 2023', prof_id, NOW()),
    (gen_random_uuid(), 'Helena Martins', '(11) 91098-7654', 'helena.martins@email.com', NULL, prof_id, NOW());
END;
$$;


ALTER FUNCTION "public"."seed_patients_for_professional"("prof_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_appointment_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Se houver calção, marcar has_payment = true
  IF NEW.downpayment_amount > 0 THEN
    NEW.has_payment := true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_appointment_payment_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) IS 'Atualiza atribuições e recalcula splits pendentes. Splits pagos nunca são modificados.';



CREATE OR REPLACE FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) IS 'Atualiza o valor real de uma despesa variável para um período. Disponível para todos os responsáveis.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "procedure_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "appointment_date" "date" NOT NULL,
    "appointment_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "cancellation_reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "downpayment_amount" numeric(10,2) DEFAULT 0,
    "downpayment_method" character varying(50),
    "downpayment_notes" "text",
    "has_payment" boolean DEFAULT false,
    "tenant_id" "uuid" NOT NULL,
    "payment_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "payment_paid_at" timestamp with time zone,
    "rescheduled_from_date" "date",
    "rescheduled_from_time" time without time zone,
    "reschedule_count" integer DEFAULT 0 NOT NULL,
    "final_price" numeric,
    CONSTRAINT "appointments_downpayment_method_check" CHECK (((("downpayment_method")::"text" = ANY ((ARRAY['dinheiro'::character varying, 'credito'::character varying, 'debito'::character varying, 'pix'::character varying])::"text"[])) OR ("downpayment_method" IS NULL))),
    CONSTRAINT "appointments_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['none'::"text", 'partial'::"text", 'paid'::"text", 'reopened'::"text", 'reversed'::"text", 'credited'::"text", 'legacy'::"text"]))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."downpayment_amount" IS 'Valor do calção pago no momento do agendamento';



COMMENT ON COLUMN "public"."appointments"."downpayment_method" IS 'Forma de pagamento do calção: dinheiro, credito, debito, pix';



COMMENT ON COLUMN "public"."appointments"."downpayment_notes" IS 'Observações sobre o calção';



COMMENT ON COLUMN "public"."appointments"."has_payment" IS 'Indica se o agendamento tem algum pagamento registrado';



COMMENT ON COLUMN "public"."appointments"."payment_status" IS 'Estado do pagamento: none=sem pagamento, partial=sinal pago, paid=pago integralmente, reopened=reaberto p/ correção, reversed=estornado, credited=virou crédito, legacy=anterior ao sistema';



COMMENT ON COLUMN "public"."appointments"."payment_paid_at" IS 'Data/hora do pagamento efetivo (primeira transação vinculada)';



COMMENT ON COLUMN "public"."appointments"."rescheduled_from_date" IS 'Original appointment date before the last reschedule';



COMMENT ON COLUMN "public"."appointments"."rescheduled_from_time" IS 'Original appointment time before the last reschedule';



COMMENT ON COLUMN "public"."appointments"."reschedule_count" IS 'Number of times this appointment has been rescheduled';



COMMENT ON COLUMN "public"."appointments"."final_price" IS 'Actual price charged for this appointment. Falls back to procedure default_price when NULL';



CREATE TABLE IF NOT EXISTS "public"."cash_register_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "closing_date" "date" NOT NULL,
    "total_amount" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "is_finalized" boolean DEFAULT false,
    "finalized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."cash_register_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_register_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "closing_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "transaction_type" character varying(20) DEFAULT 'full_payment'::character varying,
    "tenant_id" "uuid" NOT NULL,
    "professional_id" "uuid",
    "type" "text" DEFAULT 'payment'::"text" NOT NULL,
    "reversal_reason" "text",
    "reversal_method" "text",
    "reversal_at" timestamp with time zone,
    "reversed_by" "uuid",
    "reversal_of" "uuid",
    "reversal_protocol" "text",
    CONSTRAINT "cash_register_transactions_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "cash_register_transactions_transaction_type_check" CHECK ((("transaction_type")::"text" = ANY ((ARRAY['downpayment'::character varying, 'remaining_payment'::character varying, 'full_payment'::character varying])::"text"[]))),
    CONSTRAINT "cash_register_transactions_type_check" CHECK (("type" = ANY (ARRAY['payment'::"text", 'reversal'::"text", 'adjustment'::"text"]))),
    CONSTRAINT "crt_reversal_fields_required" CHECK ((("type" <> 'reversal'::"text") OR (("reversal_reason" IS NOT NULL) AND ("reversal_method" IS NOT NULL) AND ("reversal_of" IS NOT NULL))))
);


ALTER TABLE "public"."cash_register_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cash_register_transactions"."transaction_type" IS 'Tipo da transação: downpayment (calção), remaining_payment (restante), full_payment (total)';



COMMENT ON COLUMN "public"."cash_register_transactions"."type" IS 'Natureza: payment=pagamento, reversal=estorno, adjustment=ajuste manual';



COMMENT ON COLUMN "public"."cash_register_transactions"."reversal_of" IS 'FK para a transação original que está sendo estornada';



COMMENT ON COLUMN "public"."cash_register_transactions"."reversal_protocol" IS 'Número de protocolo do estorno, ex: EST-20260226-0001';



CREATE TABLE IF NOT EXISTS "public"."expense_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."expense_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_assignments" IS 'Usuários responsáveis por cada despesa (template permanente para recorrentes)';



CREATE TABLE IF NOT EXISTS "public"."expense_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_due" numeric(10,2) NOT NULL,
    "reference_period" character varying(7),
    "due_date" "date",
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "paid_at" timestamp with time zone,
    "payment_proof_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "installment_number" integer,
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "expense_splits_amount_due_check" CHECK (("amount_due" > (0)::numeric)),
    CONSTRAINT "expense_splits_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying])::"text"[])))
);


ALTER TABLE "public"."expense_splits" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_splits" IS 'Instâncias de pagamento por usuário por período';



COMMENT ON COLUMN "public"."expense_splits"."reference_period" IS 'Período no formato YYYY-MM (NULL para despesas únicas)';



COMMENT ON COLUMN "public"."expense_splits"."payment_proof_url" IS 'URL do comprovante de pagamento no Supabase Storage (bucket: expense-proofs)';



COMMENT ON COLUMN "public"."expense_splits"."installment_number" IS 'Número da parcela (1-based). NULL para não-parcelado.';



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "amount" numeric(10,2) NOT NULL,
    "type" character varying(20) NOT NULL,
    "category" character varying(50) DEFAULT 'outros'::character varying NOT NULL,
    "recurrence" character varying(20) DEFAULT 'once'::character varying NOT NULL,
    "due_day_of_month" integer,
    "due_date" "date",
    "created_by" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "installments_count" integer DEFAULT 1 NOT NULL,
    "contract_end_date" "date",
    "adjustment_index" character varying(10),
    "adjustment_value" numeric,
    "effective_from" "date" DEFAULT ("date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone))::"date" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "expenses_adjustment_index_check" CHECK (((("adjustment_index")::"text" = ANY ((ARRAY['igpm'::character varying, 'ipca'::character varying, 'inpc'::character varying, 'fixed'::character varying])::"text"[])) OR ("adjustment_index" IS NULL))),
    CONSTRAINT "expenses_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "expenses_category_check" CHECK ((("category")::"text" = ANY ((ARRAY['aluguel'::character varying, 'energia'::character varying, 'internet'::character varying, 'insumos'::character varying, 'limpeza'::character varying, 'decoracao'::character varying, 'obras'::character varying, 'mimos'::character varying, 'equipamentos'::character varying, 'marketing'::character varying, 'outros'::character varying])::"text"[]))),
    CONSTRAINT "expenses_due_day_of_month_check" CHECK ((("due_day_of_month" >= 1) AND ("due_day_of_month" <= 28))),
    CONSTRAINT "expenses_installments_count_check" CHECK (("installments_count" >= 1)),
    CONSTRAINT "expenses_recurrence_check" CHECK ((("recurrence")::"text" = ANY ((ARRAY['once'::character varying, 'monthly'::character varying, 'yearly'::character varying, 'installments'::character varying])::"text"[]))),
    CONSTRAINT "expenses_recurrence_date_check" CHECK ((((("recurrence")::"text" = 'monthly'::"text") AND ("due_day_of_month" IS NOT NULL)) OR ((("recurrence")::"text" = 'once'::"text") AND ("due_date" IS NOT NULL)) OR ((("recurrence")::"text" = 'yearly'::"text") AND ("due_date" IS NOT NULL)) OR ((("recurrence")::"text" = 'installments'::"text") AND ("due_date" IS NOT NULL)))),
    CONSTRAINT "expenses_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['fixed'::character varying, 'variable'::character varying])::"text"[])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


COMMENT ON TABLE "public"."expenses" IS 'Definição das despesas fixas e variáveis da clínica';



COMMENT ON COLUMN "public"."expenses"."type" IS 'fixed = recorrente previsível; variable = eventual/imprevisível';



COMMENT ON COLUMN "public"."expenses"."recurrence" IS 'once = única; monthly = mensal; yearly = anual';



COMMENT ON COLUMN "public"."expenses"."due_day_of_month" IS 'Dia do mês de vencimento para despesas mensais (1-28)';



COMMENT ON COLUMN "public"."expenses"."due_date" IS 'Data exata de vencimento para despesas únicas e anuais';



COMMENT ON COLUMN "public"."expenses"."installments_count" IS 'Número de parcelas (1 = sem parcelamento; >1 = parcelado)';



COMMENT ON COLUMN "public"."expenses"."contract_end_date" IS 'Data de término do contrato (para aluguel e similares)';



COMMENT ON COLUMN "public"."expenses"."adjustment_index" IS 'Índice de reajuste aplicado: igpm | ipca | inpc | fixed';



COMMENT ON COLUMN "public"."expenses"."adjustment_value" IS 'Percentual ou valor de reajuste aplicado';



COMMENT ON COLUMN "public"."expenses"."effective_from" IS 'Mês a partir do qual splits são gerados. Splits nunca são criados para períodos anteriores a este.';



CREATE TABLE IF NOT EXISTS "public"."patient_credit_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "credit_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "amount_used" numeric(10,2) NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_by" "uuid",
    CONSTRAINT "patient_credit_uses_amount_used_check" CHECK (("amount_used" > (0)::numeric))
);


ALTER TABLE "public"."patient_credit_uses" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_credit_uses" IS 'Histórico de uso (parcial ou total) dos créditos de clientes. Imutável.';



CREATE TABLE IF NOT EXISTS "public"."patient_credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "amount_original" numeric(10,2) NOT NULL,
    "amount_remaining" numeric(10,2) NOT NULL,
    "origin" "text" NOT NULL,
    "origin_appointment_id" "uuid",
    "origin_transaction_id" "uuid",
    "notes" "text",
    "expires_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "patient_credits_amount_original_check" CHECK (("amount_original" > (0)::numeric)),
    CONSTRAINT "patient_credits_amount_remaining_check" CHECK (("amount_remaining" >= (0)::numeric)),
    CONSTRAINT "patient_credits_origin_check" CHECK (("origin" = ANY (ARRAY['reversal'::"text", 'cancellation'::"text", 'downpayment'::"text", 'manual'::"text"]))),
    CONSTRAINT "patient_credits_remaining_lte_original" CHECK (("amount_remaining" <= "amount_original"))
);


ALTER TABLE "public"."patient_credits" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_credits" IS 'Créditos de clientes com um profissional específico. Uso parcial permitido. Imutável após criação.';



COMMENT ON COLUMN "public"."patient_credits"."amount_remaining" IS 'Saldo restante do crédito (decrementado a cada uso em patient_credit_uses).';



COMMENT ON COLUMN "public"."patient_credits"."expires_at" IS 'Data de expiração do crédito. NULL = sem prazo.';



CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "notes" "text",
    "professional_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "duration_minutes" integer NOT NULL,
    "default_price" numeric(10,2) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL,
    "is_variable_price" boolean DEFAULT false NOT NULL,
    "min_price" numeric,
    CONSTRAINT "procedures_default_price_check" CHECK (("default_price" >= (0)::numeric)),
    CONSTRAINT "procedures_duration_minutes_check" CHECK (("duration_minutes" > 0))
);


ALTER TABLE "public"."procedures" OWNER TO "postgres";


COMMENT ON COLUMN "public"."procedures"."is_variable_price" IS 'Whether this procedure has a variable price (set per appointment)';



COMMENT ON COLUMN "public"."procedures"."min_price" IS 'Minimum allowed price for variable-price procedures';



CREATE TABLE IF NOT EXISTS "public"."professional_procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "procedure_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."professional_procedures" OWNER TO "postgres";


COMMENT ON TABLE "public"."professional_procedures" IS 'Tabela de relacionamento N:N entre profissionais e procedimentos. Define quais procedimentos cada profissional pode realizar.';



COMMENT ON COLUMN "public"."professional_procedures"."professional_id" IS 'ID do profissional que pode realizar o procedimento';



COMMENT ON COLUMN "public"."professional_procedures"."procedure_id" IS 'ID do procedimento que o profissional pode realizar';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "stripe_subscription_id" character varying,
    "stripe_customer_id" character varying,
    "plan_id" character varying DEFAULT 'starter'::character varying NOT NULL,
    "status" character varying DEFAULT 'active'::character varying NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_exempt" boolean DEFAULT false NOT NULL,
    CONSTRAINT "subscriptions_plan_id_check" CHECK ((("plan_id")::"text" = ANY ((ARRAY['starter'::character varying, 'pro'::character varying, 'clinic'::character varying])::"text"[]))),
    CONSTRAINT "subscriptions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'trialing'::character varying, 'past_due'::character varying, 'canceled'::character varying, 'unpaid'::character varying])::"text"[])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "slug" character varying(100),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" character varying
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_register_closings"
    ADD CONSTRAINT "cash_register_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_register_closings"
    ADD CONSTRAINT "cash_register_closings_professional_id_closing_date_key" UNIQUE ("professional_id", "closing_date");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_assignments"
    ADD CONSTRAINT "expense_assignments_expense_id_user_id_key" UNIQUE ("expense_id", "user_id");



ALTER TABLE ONLY "public"."expense_assignments"
    ADD CONSTRAINT "expense_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_credit_uses"
    ADD CONSTRAINT "patient_credit_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_procedures"
    ADD CONSTRAINT "professional_procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_procedures"
    ADD CONSTRAINT "professional_procedures_unique" UNIQUE ("professional_id", "procedure_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



CREATE UNIQUE INDEX "expense_splits_once_unique" ON "public"."expense_splits" USING "btree" ("expense_id", "user_id") WHERE ("reference_period" IS NULL);



CREATE UNIQUE INDEX "expense_splits_recurring_unique" ON "public"."expense_splits" USING "btree" ("expense_id", "user_id", "reference_period") WHERE ("reference_period" IS NOT NULL);



CREATE INDEX "idx_appointments_date" ON "public"."appointments" USING "btree" ("appointment_date");



CREATE INDEX "idx_appointments_has_payment" ON "public"."appointments" USING "btree" ("has_payment") WHERE ("has_payment" = true);



CREATE INDEX "idx_appointments_payment_status" ON "public"."appointments" USING "btree" ("tenant_id", "payment_status");



CREATE INDEX "idx_appointments_professional" ON "public"."appointments" USING "btree" ("professional_id");



CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "idx_appointments_tenant_id" ON "public"."appointments" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_appointments_unique_active_slot" ON "public"."appointments" USING "btree" ("professional_id", "appointment_date", "appointment_time") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "idx_cash_closings_date" ON "public"."cash_register_closings" USING "btree" ("closing_date");



CREATE INDEX "idx_cash_closings_professional" ON "public"."cash_register_closings" USING "btree" ("professional_id");



CREATE INDEX "idx_crc_tenant_id" ON "public"."cash_register_closings" USING "btree" ("tenant_id");



CREATE INDEX "idx_credit_uses_appointment" ON "public"."patient_credit_uses" USING "btree" ("appointment_id") WHERE ("appointment_id" IS NOT NULL);



CREATE INDEX "idx_credit_uses_credit" ON "public"."patient_credit_uses" USING "btree" ("credit_id");



CREATE INDEX "idx_credit_uses_tenant" ON "public"."patient_credit_uses" USING "btree" ("tenant_id");



CREATE INDEX "idx_crt_professional_id" ON "public"."cash_register_transactions" USING "btree" ("professional_id");



CREATE INDEX "idx_crt_reversal_of" ON "public"."cash_register_transactions" USING "btree" ("reversal_of") WHERE ("reversal_of" IS NOT NULL);



CREATE INDEX "idx_crt_tenant_id" ON "public"."cash_register_transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_crt_type" ON "public"."cash_register_transactions" USING "btree" ("type");



CREATE INDEX "idx_expense_assign_tenant_id" ON "public"."expense_assignments" USING "btree" ("tenant_id");



CREATE INDEX "idx_expense_assignments_expense" ON "public"."expense_assignments" USING "btree" ("expense_id");



CREATE INDEX "idx_expense_assignments_user" ON "public"."expense_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_expense_splits_due_date" ON "public"."expense_splits" USING "btree" ("due_date");



CREATE INDEX "idx_expense_splits_expense" ON "public"."expense_splits" USING "btree" ("expense_id");



CREATE INDEX "idx_expense_splits_period" ON "public"."expense_splits" USING "btree" ("reference_period");



CREATE INDEX "idx_expense_splits_status" ON "public"."expense_splits" USING "btree" ("status");



CREATE INDEX "idx_expense_splits_tenant_id" ON "public"."expense_splits" USING "btree" ("tenant_id");



CREATE INDEX "idx_expense_splits_user" ON "public"."expense_splits" USING "btree" ("user_id");



CREATE INDEX "idx_expenses_created_by" ON "public"."expenses" USING "btree" ("created_by");



CREATE INDEX "idx_expenses_recurrence_active" ON "public"."expenses" USING "btree" ("recurrence", "is_active");



CREATE INDEX "idx_expenses_tenant_id" ON "public"."expenses" USING "btree" ("tenant_id");



CREATE INDEX "idx_expenses_type_active" ON "public"."expenses" USING "btree" ("type", "is_active");



CREATE INDEX "idx_patient_credits_active" ON "public"."patient_credits" USING "btree" ("professional_id", "patient_id") WHERE ("amount_remaining" > (0)::numeric);



CREATE INDEX "idx_patient_credits_patient" ON "public"."patient_credits" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_credits_professional" ON "public"."patient_credits" USING "btree" ("professional_id");



CREATE INDEX "idx_patient_credits_tenant" ON "public"."patient_credits" USING "btree" ("tenant_id");



CREATE INDEX "idx_patients_professional" ON "public"."patients" USING "btree" ("professional_id");



CREATE INDEX "idx_patients_tenant_id" ON "public"."patients" USING "btree" ("tenant_id");



CREATE INDEX "idx_procedures_tenant_id" ON "public"."procedures" USING "btree" ("tenant_id");



CREATE INDEX "idx_prof_procs_tenant_id" ON "public"."professional_procedures" USING "btree" ("tenant_id");



CREATE INDEX "idx_professional_procedures_procedure" ON "public"."professional_procedures" USING "btree" ("procedure_id");



CREATE INDEX "idx_professional_procedures_professional" ON "public"."professional_procedures" USING "btree" ("professional_id");



CREATE INDEX "idx_profiles_tenant_id" ON "public"."profiles" USING "btree" ("tenant_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_stripe_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscriptions_tenant_id" ON "public"."subscriptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_transactions_appointment" ON "public"."cash_register_transactions" USING "btree" ("appointment_id") WHERE ("appointment_id" IS NOT NULL);



CREATE INDEX "idx_transactions_type" ON "public"."cash_register_transactions" USING "btree" ("transaction_type");



CREATE OR REPLACE TRIGGER "check_appointment_payment" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_appointment_payment_status"();



CREATE OR REPLACE TRIGGER "expense_split_payment_trigger" BEFORE UPDATE ON "public"."expense_splits" FOR EACH ROW EXECUTE FUNCTION "public"."handle_expense_split_payment"();



CREATE OR REPLACE TRIGGER "expense_splits_updated_at" BEFORE UPDATE ON "public"."expense_splits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "tenants_create_subscription" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."create_initial_subscription"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."cash_register_closings" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."expense_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."expense_splits" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."patient_credit_uses" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."patient_credits" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."procedures" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_id" BEFORE INSERT ON "public"."professional_procedures" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_transaction_fields" BEFORE INSERT ON "public"."cash_register_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_transaction_fields"();



CREATE OR REPLACE TRIGGER "update_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cash_register_closings_updated_at" BEFORE UPDATE ON "public"."cash_register_closings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_closing_total_on_delete" AFTER DELETE ON "public"."cash_register_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_closing_total"();



CREATE OR REPLACE TRIGGER "update_closing_total_on_insert" AFTER INSERT ON "public"."cash_register_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_closing_total"();



CREATE OR REPLACE TRIGGER "update_closing_total_on_update" AFTER UPDATE ON "public"."cash_register_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_closing_total"();



CREATE OR REPLACE TRIGGER "update_patients_updated_at" BEFORE UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_procedures_updated_at" BEFORE UPDATE ON "public"."procedures" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."cash_register_closings"
    ADD CONSTRAINT "cash_register_closings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_register_closings"
    ADD CONSTRAINT "cash_register_closings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_closing_id_fkey" FOREIGN KEY ("closing_id") REFERENCES "public"."cash_register_closings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "public"."cash_register_transactions"("id");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_register_transactions"
    ADD CONSTRAINT "cash_register_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."expense_assignments"
    ADD CONSTRAINT "expense_assignments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_assignments"
    ADD CONSTRAINT "expense_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."expense_assignments"
    ADD CONSTRAINT "expense_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."patient_credit_uses"
    ADD CONSTRAINT "patient_credit_uses_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."patient_credit_uses"
    ADD CONSTRAINT "patient_credit_uses_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."patient_credits"("id");



ALTER TABLE ONLY "public"."patient_credit_uses"
    ADD CONSTRAINT "patient_credit_uses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."patient_credit_uses"
    ADD CONSTRAINT "patient_credit_uses_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_origin_appointment_id_fkey" FOREIGN KEY ("origin_appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_origin_transaction_id_fkey" FOREIGN KEY ("origin_transaction_id") REFERENCES "public"."cash_register_transactions"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."patient_credits"
    ADD CONSTRAINT "patient_credits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."professional_procedures"
    ADD CONSTRAINT "professional_procedures_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_procedures"
    ADD CONSTRAINT "professional_procedures_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_procedures"
    ADD CONSTRAINT "professional_procedures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



CREATE POLICY "Admin deletes cash register" ON "public"."cash_register_closings" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND "public"."is_super_admin"()));



CREATE POLICY "Admin deletes splits" ON "public"."expense_splits" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND "public"."is_super_admin"()));



CREATE POLICY "Authenticated user creates expense" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Creator or admin deletes assignment" ON "public"."expense_assignments" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND ("public"."auth_user_created_expense"("expense_id") OR "public"."is_super_admin"())));



CREATE POLICY "Creator or admin deletes expense" ON "public"."expenses" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "Creator or admin inserts assignment" ON "public"."expense_assignments" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND ("public"."auth_user_created_expense"("expense_id") OR "public"."is_super_admin"())));



CREATE POLICY "Creator or admin updates expense" ON "public"."expenses" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"()))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "Only super admins can delete credit uses" ON "public"."patient_credit_uses" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Only super admins can delete patient credits" ON "public"."patient_credits" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin inserts splits" ON "public"."expense_splits" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND "public"."is_super_admin"()));



CREATE POLICY "Super admin manages profiles" ON "public"."profiles" TO "authenticated" USING (("public"."is_super_admin"() AND ("tenant_id" = "public"."auth_tenant_id"()))) WITH CHECK (("public"."is_super_admin"() AND ("tenant_id" = "public"."auth_tenant_id"())));



CREATE POLICY "Super admin updates own tenant" ON "public"."tenants" FOR UPDATE TO "authenticated" USING ((("id" = "public"."auth_tenant_id"()) AND "public"."is_super_admin"())) WITH CHECK ((("id" = "public"."auth_tenant_id"()) AND "public"."is_super_admin"()));



CREATE POLICY "Super admins can delete any transaction" ON "public"."cash_register_transactions" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can insert credit uses" ON "public"."patient_credit_uses" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can insert patient credits" ON "public"."patient_credits" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can insert transactions" ON "public"."cash_register_transactions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can update any patient credit" ON "public"."patient_credits" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can update any transaction" ON "public"."cash_register_transactions" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all credit uses" ON "public"."patient_credit_uses" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all patient credits" ON "public"."patient_credits" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all transactions" ON "public"."cash_register_transactions" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Tenant users manage patients" ON "public"."patients" TO "authenticated" USING (("tenant_id" = "public"."auth_tenant_id"())) WITH CHECK (("tenant_id" = "public"."auth_tenant_id"()));



CREATE POLICY "User creates own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "User deletes own appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User deletes own procedures" ON "public"."procedures" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User inserts own appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User manages own procedures" ON "public"."procedures" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "User manages own professional_procedures" ON "public"."professional_procedures" TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"()))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User opens own cash register" ON "public"."cash_register_closings" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "User or admin updates cash register" ON "public"."cash_register_closings" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"()))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User updates own appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"()))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User updates own procedures" ON "public"."procedures" FOR UPDATE USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."professional_procedures"
  WHERE (("professional_procedures"."procedure_id" = "procedures"."id") AND ("professional_procedures"."professional_id" = "auth"."uid"()))))))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."professional_procedures"
  WHERE (("professional_procedures"."procedure_id" = "procedures"."id") AND ("professional_procedures"."professional_id" = "auth"."uid"())))))));



CREATE POLICY "User updates own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) AND ("tenant_id" = "public"."auth_tenant_id"()))) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = ("public"."auth_user_role"())::"text")));



CREATE POLICY "User updates own split" ON "public"."expense_splits" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()))) WITH CHECK ((("tenant_id" = "public"."auth_tenant_id"()) AND (("user_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User views own appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "User views own cash register" ON "public"."cash_register_closings" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND (("professional_id" = "auth"."uid"()) OR "public"."is_super_admin"())));



CREATE POLICY "Users can delete own transactions" ON "public"."cash_register_transactions" FOR DELETE TO "authenticated" USING (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own credit uses" ON "public"."patient_credit_uses" FOR INSERT TO "authenticated" WITH CHECK (("credit_id" IN ( SELECT "patient_credits"."id"
   FROM "public"."patient_credits"
  WHERE ("patient_credits"."professional_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own patient credits" ON "public"."patient_credits" FOR INSERT TO "authenticated" WITH CHECK (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own transactions" ON "public"."cash_register_transactions" FOR INSERT TO "authenticated" WITH CHECK (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can update own patient credits" ON "public"."patient_credits" FOR UPDATE TO "authenticated" USING (("professional_id" = "auth"."uid"())) WITH CHECK (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can update own transactions" ON "public"."cash_register_transactions" FOR UPDATE TO "authenticated" USING (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can view own credit uses" ON "public"."patient_credit_uses" FOR SELECT TO "authenticated" USING (("credit_id" IN ( SELECT "patient_credits"."id"
   FROM "public"."patient_credits"
  WHERE ("patient_credits"."professional_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own patient credits" ON "public"."patient_credits" FOR SELECT TO "authenticated" USING (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users can view own transactions" ON "public"."cash_register_transactions" FOR SELECT TO "authenticated" USING (("professional_id" = "auth"."uid"()));



CREATE POLICY "Users see own tenant" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" = "public"."auth_tenant_id"()));



CREATE POLICY "View expense assignments in tenant" ON "public"."expense_assignments" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND ("public"."is_super_admin"() OR ("user_id" = "auth"."uid"()) OR "public"."auth_user_created_expense"("expense_id"))));



CREATE POLICY "View expense splits in tenant" ON "public"."expense_splits" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND ("public"."is_super_admin"() OR ("user_id" = "auth"."uid"()) OR "public"."auth_user_created_expense"("expense_id"))));



CREATE POLICY "View expenses in tenant" ON "public"."expenses" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."auth_tenant_id"()) AND ("public"."is_super_admin"() OR ("created_by" = "auth"."uid"()) OR "public"."auth_user_has_expense_assignment"("id"))));



CREATE POLICY "View procedures in tenant" ON "public"."procedures" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."auth_tenant_id"()));



CREATE POLICY "View professional_procedures in tenant" ON "public"."professional_procedures" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."auth_tenant_id"()));



CREATE POLICY "View profiles in same tenant" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."auth_tenant_id"()));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_register_closings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_register_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_credit_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_service_role_all" ON "public"."subscriptions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "subscriptions_tenant_select" ON "public"."subscriptions" FOR SELECT USING (("tenant_id" = "public"."auth_tenant_id"()));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_expense_adjustment"("p_expense_id" "uuid", "p_new_amount" numeric, "p_adjustment_index" character varying, "p_adjustment_value" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_user_created_expense"("p_expense_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_created_expense"("p_expense_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_created_expense"("p_expense_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_user_has_expense_assignment"("p_expense_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_has_expense_assignment"("p_expense_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_has_expense_assignment"("p_expense_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_set_transaction_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_set_transaction_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_set_transaction_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_appointment_conflict"("p_professional_id" "uuid", "p_appointment_date" "date", "p_appointment_time" time without time zone, "p_procedure_id" "uuid", "p_appointment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_expense_with_assignments"("p_title" character varying, "p_description" "text", "p_amount" numeric, "p_type" character varying, "p_category" character varying, "p_recurrence" character varying, "p_user_ids" "uuid"[], "p_due_day_of_month" integer, "p_due_date" "date", "p_installments_count" integer, "p_contract_end_date" "date", "p_adjustment_index" character varying, "p_adjustment_value" numeric, "p_effective_from" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_expense_with_assignments"("p_title" character varying, "p_description" "text", "p_amount" numeric, "p_type" character varying, "p_category" character varying, "p_recurrence" character varying, "p_user_ids" "uuid"[], "p_due_day_of_month" integer, "p_due_date" "date", "p_installments_count" integer, "p_contract_end_date" "date", "p_adjustment_index" character varying, "p_adjustment_value" numeric, "p_effective_from" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_expense_with_assignments"("p_title" character varying, "p_description" "text", "p_amount" numeric, "p_type" character varying, "p_category" character varying, "p_recurrence" character varying, "p_user_ids" "uuid"[], "p_due_day_of_month" integer, "p_due_date" "date", "p_installments_count" integer, "p_contract_end_date" "date", "p_adjustment_index" character varying, "p_adjustment_value" numeric, "p_effective_from" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_initial_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_initial_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_initial_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_period_splits"("p_period" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_period_splits"("p_period" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_period_splits"("p_period" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_professional_procedures"("p_professional_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_expense_split_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_expense_split_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_expense_split_payment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_closing_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_closing_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_closing_total"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_user_profile"("p_full_name" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_user_profile"("p_full_name" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_user_profile"("p_full_name" "text", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_patients_for_professional"("prof_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_patients_for_professional"("prof_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_patients_for_professional"("prof_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_appointment_payment_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_appointment_payment_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_appointment_payment_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_expense_assignments"("p_expense_id" "uuid", "p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_period_expense_amount"("p_expense_id" "uuid", "p_period" character varying, "p_new_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."cash_register_closings" TO "anon";
GRANT ALL ON TABLE "public"."cash_register_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_register_closings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_register_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cash_register_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_register_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."expense_assignments" TO "anon";
GRANT ALL ON TABLE "public"."expense_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."expense_splits" TO "anon";
GRANT ALL ON TABLE "public"."expense_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_splits" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."patient_credit_uses" TO "anon";
GRANT ALL ON TABLE "public"."patient_credit_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_credit_uses" TO "service_role";



GRANT ALL ON TABLE "public"."patient_credits" TO "anon";
GRANT ALL ON TABLE "public"."patient_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_credits" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."procedures" TO "anon";
GRANT ALL ON TABLE "public"."procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."procedures" TO "service_role";



GRANT ALL ON TABLE "public"."professional_procedures" TO "anon";
GRANT ALL ON TABLE "public"."professional_procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_procedures" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































