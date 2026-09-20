-- ============================================================================
-- Job diário: avisar tenants cujo trial expira em 7 dias
-- Requer: pg_cron e pg_net habilitados no projeto Supabase
-- ============================================================================

-- Habilitar extensões (já ativas em projetos Supabase por padrão)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função chamada pelo cron
CREATE OR REPLACE FUNCTION notify_trial_expiring()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  admin_email text;
  admin_name  text;
  days_left   int;
  edge_url    text;
  service_key text;
BEGIN
  edge_url    := current_setting('app.supabase_url',    true) || '/functions/v1/send-email';
  service_key := current_setting('app.service_role_key', true);

  FOR r IN
    SELECT s.tenant_id, s.trial_ends_at
    FROM   subscriptions s
    WHERE  s.status = 'trialing'
      AND  s.is_exempt = false
      AND  s.trial_ends_at::date = (now() + interval '7 days')::date
  LOOP
    days_left := 7;

    -- Buscar email do super_admin do tenant
    SELECT p.email, p.full_name
    INTO   admin_email, admin_name
    FROM   profiles p
    WHERE  p.tenant_id = r.tenant_id
      AND  p.role = 'super_admin'
    LIMIT  1;

    IF admin_email IS NULL THEN CONTINUE; END IF;

    -- Chamar Edge Function send-email via pg_net
    PERFORM net.http_post(
      url     := edge_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body    := jsonb_build_object(
        'type', 'trial_expiring',
        'to',   admin_email,
        'data', jsonb_build_object(
          'name',      admin_name,
          'days_left', days_left
        )
      )
    );
  END LOOP;
END;
$$;

-- Agendar para rodar todos os dias às 09:00 UTC
SELECT cron.schedule(
  'notify-trial-expiring',
  '0 9 * * *',
  'SELECT notify_trial_expiring()'
);
