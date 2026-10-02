-- Chave de PLATAFORMA: uma credencial para o integrador e o tenant da LIVIA em
-- cada chamada (cabeçalho X-Livia-Tenant-Id), no mesmo padrão do contrato LIVIA ↔ AB.
--
-- Por quê: o Agent Builder guarda UMA chave de agenda para a plataforma inteira
-- (system_agendador_integration_settings, id = 'default'). Com chave por clínica,
-- todo agente do AB cairia na clínica dessa chave — a Miss Belle. Chave por
-- tenant no AB não escala (decisão do Frank, 02/10/2026); quem resolve a clínica
-- passa a ser o tenant da LIVIA. Ver LIVIA-AVOCADO/app#1237 e docs#22.
--
-- E é o identificador que sobrevive à fase 2 da docs#22: quando a agenda virar
-- módulo da LIVIA, o tenant da LIVIA É a clínica e este vínculo some.
--
-- Fusível: sem vínculo, RECUSA. Não existe clínica padrão.
--
-- Compatível com a função no ar: api_authenticate continua aceitando só
-- p_key_hash (o novo parâmetro tem default), e a chave de clínica segue valendo.

-- 1. O vínculo com a LIVIA muda de casa: da chave para a clínica. É por ele que
--    a clínica é encontrada quando a chave não pertence a ninguém.
alter table public.tenants add column livia_tenant_id uuid;
alter table public.tenants add constraint tenants_livia_tenant_id_key unique (livia_tenant_id);

update public.tenants t
   set livia_tenant_id = k.livia_tenant_id
  from (
    select distinct on (tenant_id) tenant_id, livia_tenant_id
      from public.api_keys
     where livia_tenant_id is not null and revoked_at is null
     order by tenant_id, created_at desc
  ) k
 where k.tenant_id = t.id;

-- 2. Escopo da chave. A de plataforma não tem clínica; a de clínica tem.
alter table public.api_keys add column scope text not null default 'clinic';
alter table public.api_keys alter column tenant_id drop not null;
alter table public.api_keys add constraint api_keys_scope_tenant_check check (
  (scope = 'clinic' and tenant_id is not null) or (scope = 'platform' and tenant_id is null)
);

-- 3. Autenticação. Assinatura nova (com o tenant da LIVIA), então sai a antiga:
--    com as duas, a chamada só com p_key_hash ficaria ambígua no PostgREST.
drop function public.api_authenticate(text);

create function public.api_authenticate(p_key_hash text, p_livia_tenant_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_key    uuid;
  v_scope  text;
  v_tenant uuid;
  v_livia  uuid;
begin
  select k.id, k.scope, k.tenant_id into v_key, v_scope, v_tenant
    from public.api_keys k
   where k.key_hash = p_key_hash
     and k.revoked_at is null;

  if v_key is null then
    return null;  -- chave ausente, inválida e revogada respondem igual
  end if;

  if v_scope = 'platform' then
    if p_livia_tenant_id is null then
      return jsonb_build_object('error', 'TENANT_REQUIRED');
    end if;
    select t.id into v_tenant
      from public.tenants t
     where t.livia_tenant_id = p_livia_tenant_id
       and t.is_active;
    if v_tenant is null then
      return jsonb_build_object('error', 'TENANT_NOT_LINKED');
    end if;
  else
    select t.livia_tenant_id into v_livia
      from public.tenants t
     where t.id = v_tenant
       and t.is_active;
    if not found then
      return null;
    end if;
    -- Chave de clínica com o cabeçalho de OUTRA clínica: configuração trocada
    -- no integrador. Recusar é o que torna o erro visível.
    if p_livia_tenant_id is not null and p_livia_tenant_id is distinct from v_livia then
      return jsonb_build_object('error', 'TENANT_MISMATCH');
    end if;
  end if;

  update public.api_keys set last_used_at = now() where id = v_key;

  return jsonb_build_object('tenantId', v_tenant, 'apiKeyId', v_key);
end;
$function$;

-- 4. Emissão da chave de plataforma. Mesmo formato da de clínica, prefixo próprio
--    para quem cola a chave saber qual tem na mão.
create function public.api_issue_platform_key(p_name text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_key text;
begin
  v_key := 'mbp_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.api_keys (tenant_id, name, key_hash, scope)
  values (null, p_name, encode(extensions.digest(v_key, 'sha256'), 'hex'), 'platform');

  return v_key;
end;
$function$;

-- 5. api_issue_key grava o vínculo na CLÍNICA, e não troca um vínculo diferente
--    em silêncio (seria mudar de cliente a agenda inteira).
create or replace function public.api_issue_key(p_tenant_id uuid, p_name text, p_livia_tenant_id uuid default null)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_key   text;
  v_livia uuid;
begin
  select t.livia_tenant_id into v_livia from public.tenants t where t.id = p_tenant_id;
  if not found then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  if p_livia_tenant_id is not null then
    if v_livia is not null and v_livia <> p_livia_tenant_id then
      raise exception 'clínica já vinculada a outro livia_tenant_id (%)', v_livia using errcode = '23505';
    end if;
    update public.tenants set livia_tenant_id = p_livia_tenant_id where id = p_tenant_id;
  end if;

  v_key := 'mb_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.api_keys (tenant_id, name, key_hash, scope)
  values (p_tenant_id, p_name, encode(extensions.digest(v_key, 'sha256'), 'hex'), 'clinic');

  return v_key;
end;
$function$;

-- 6. Identidade: lê o vínculo da clínica e aceita a chave de plataforma (que não
--    tem tenant_id, por isso não dá mais para juntar pela clínica da chave).
create or replace function public.api_clinic_identity(p_tenant_id uuid, p_api_key_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'liviaTenantId', t.livia_tenant_id,
    'timezone', 'America/Sao_Paulo'
  )
  from public.tenants t
  join public.api_keys k on k.id = p_api_key_id and (k.tenant_id = t.id or k.scope = 'platform')
  where t.id = p_tenant_id;
$function$;

-- 7. O vínculo já foi copiado para a clínica; a coluna da chave sai (sem legado).
alter table public.api_keys drop column livia_tenant_id;

revoke execute on function public.api_authenticate(text, uuid)            from public, anon, authenticated;
revoke execute on function public.api_issue_platform_key(text)            from public, anon, authenticated;
revoke execute on function public.api_issue_key(uuid, text, uuid)         from public, anon, authenticated;
revoke execute on function public.api_clinic_identity(uuid, uuid)         from public, anon, authenticated;
grant  execute on function public.api_authenticate(text, uuid)            to service_role;
grant  execute on function public.api_issue_platform_key(text)            to service_role;
grant  execute on function public.api_issue_key(uuid, text, uuid)         to service_role;
grant  execute on function public.api_clinic_identity(uuid, uuid)         to service_role;
