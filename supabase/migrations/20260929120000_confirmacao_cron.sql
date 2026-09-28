-- ============================================================================
-- Confirmação automática 24 h antes — o relógio (#8)
--
-- pg_cron chama a Edge Function `confirmacoes` a cada 15 min, só das 09:00 às
-- 22:59 de Brasília (`0,1,12-23` em UTC): o 1º aviso sai até 13:00 e o
-- cancelamento, 8 h depois; de madrugada não há o que fazer.
--
-- A URL e o segredo vivem no Vault, não aqui: sem eles `confirmacoes_disparar`
-- não chama nada. É uma das cinco chaves que precisam estar postas para uma
-- confirmação sair — Vault, segredos da Edge Function, confirmation_settings,
-- profissional ligada, data de início. Cada uma sozinha barra.
--
-- Para ligar em produção (uma vez):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/confirmacoes', 'confirmacoes_url');
--   select vault.create_secret('<mesmo valor de CONFIRMACOES_CRON_SECRET>', 'confirmacoes_cron_secret');
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function public.confirmacoes_disparar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'confirmacoes_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'confirmacoes_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_segredo, '') = '' then
    return 'sem_configuracao';
  end if;

  -- Assíncrono: o pg_net enfileira e volta. A rodada leva até ~2 min (intervalo
  -- aleatório entre envios); o resultado fica no log da função, não aqui.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_segredo, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return 'disparado';
end;
$$;

revoke execute on function public.confirmacoes_disparar() from public, anon, authenticated;
grant  execute on function public.confirmacoes_disparar() to service_role;

select cron.schedule('confirmacoes', '*/15 0,1,12-23 * * *', 'select public.confirmacoes_disparar()');
